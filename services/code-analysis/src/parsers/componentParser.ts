import { parse, ParserOptions } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import {
  ComponentType,
  EventHandler,
  HookUsage,
  PropDefinition,
  StateUsage
} from '../types';

const parserOptions: ParserOptions = {
  sourceType: 'module',
  plugins: [
    'jsx',
    'typescript',
    'classProperties',
    'decorators-legacy',
    'optionalChaining',
    'nullishCoalescingOperator'
  ]
};

const HOOK_NAMES = new Set([
  'useState',
  'useReducer',
  'useEffect',
  'useLayoutEffect',
  'useMemo',
  'useCallback',
  'useContext',
  'useRef',
  'useImperativeHandle',
  'useTransition',
  'useDeferredValue'
]);

const isComponentName = (name: string | undefined): boolean =>
  !!name && /^[A-Z]/.test(name);

const getNodeText = (code: string, node?: t.Node | null): string | null => {
  if (!node || node.start == null || node.end == null) {
    return null;
  }
  return code.slice(node.start, node.end);
};

const getIdentifierName = (node: t.Identifier | t.TSQualifiedName): string => {
  if (t.isIdentifier(node)) {
    return node.name;
  }
  return `${getIdentifierName(node.left)}.${getIdentifierName(node.right)}`;
};

const extractTypeNameFromAnnotation = (annotation: t.TSType): string | null => {
  if (t.isTSTypeReference(annotation)) {
    return getIdentifierName(annotation.typeName);
  }
  if (t.isTSParenthesizedType(annotation)) {
    return extractTypeNameFromAnnotation(annotation.typeAnnotation);
  }
  if (t.isTSIndexedAccessType(annotation)) {
    return extractTypeNameFromAnnotation(annotation.objectType);
  }
  return null;
};

const getTypeFromAnnotation = (annotation?: unknown): t.TSType | null => {
  if (!annotation) {
    return null;
  }

  if (t.isTSTypeAnnotation(annotation as t.Node)) {
    return (annotation as t.TSTypeAnnotation).typeAnnotation;
  }

  if (typeof annotation === 'object' && annotation !== null && 'typeAnnotation' in (annotation as Record<string, unknown>)) {
    const inner = (annotation as { typeAnnotation?: t.Node }).typeAnnotation;
    if (inner && t.isTSTypeAnnotation(inner as t.Node)) {
      return (inner as t.TSTypeAnnotation).typeAnnotation;
    }
  }

  return null;
};

const collectInterfaceMembers = (
  node: t.TSInterfaceDeclaration | t.TSTypeAliasDeclaration,
  code: string
): PropDefinition[] => {
  const props: PropDefinition[] = [];

  if (t.isTSInterfaceDeclaration(node)) {
    node.body.body.forEach((member) => {
      if (t.isTSPropertySignature(member) && member.key) {
        const name = t.isIdentifier(member.key)
          ? member.key.name
          : t.isStringLiteral(member.key)
          ? member.key.value
          : null;
        if (!name) {
          return;
        }
        const typeAnnotation = member.typeAnnotation?.typeAnnotation;
        props.push({
          name,
          type: typeAnnotation ? getNodeText(code, typeAnnotation) : null,
          required: !member.optional,
          description: member.leadingComments?.map((comment) => comment.value.trim()).join('\n') ?? null
        });
      }
    });
  } else if (t.isTSTypeAliasDeclaration(node)) {
    const typeAnnotation = node.typeAnnotation;
    if (t.isTSTypeLiteral(typeAnnotation)) {
      typeAnnotation.members.forEach((member) => {
        if (t.isTSPropertySignature(member) && member.key) {
          const name = t.isIdentifier(member.key)
            ? member.key.name
            : t.isStringLiteral(member.key)
            ? member.key.value
            : null;
          if (!name) {
            return;
          }
          const type = member.typeAnnotation?.typeAnnotation;
          props.push({
            name,
            type: type ? getNodeText(code, type) : null,
            required: !member.optional,
            description:
              member.leadingComments?.map((comment) => comment.value.trim()).join('\n') ?? null
          });
        }
      });
    }
  }

  return props;
};

const extractPropsFromObjectPattern = (
  pattern: t.ObjectPattern,
  code: string
): PropDefinition[] => {
  const props: PropDefinition[] = [];

  pattern.properties.forEach((property) => {
    if (t.isObjectProperty(property)) {
      const key = property.key;
      const name = t.isIdentifier(key)
        ? key.name
        : t.isStringLiteral(key)
        ? key.value
        : null;
      if (!name) {
        return;
      }

      const isOptional = t.isIdentifier(property.value)
        ? property.value.optional ?? false
        : t.isObjectPattern(property.value)
        ? false
        : false;

      let typeText: string | null = null;
      if (t.isIdentifier(property.value) && property.value.typeAnnotation) {
        const tsType = getTypeFromAnnotation(property.value.typeAnnotation);
        if (tsType) {
          typeText = getNodeText(code, tsType);
        }
      }

      let defaultValue: string | null = null;
      if (property.value && t.isAssignmentPattern(property.value)) {
        defaultValue = getNodeText(code, property.value.right);
      } else if (property.value && t.isObjectPattern(property.value)) {
        defaultValue = '{...}';
      } else if (t.isObjectProperty(property) && property.value && property.value.start != null) {
        defaultValue = getNodeText(code, property.value);
      }

      props.push({
        name,
        required: !isOptional && !pattern.optional,
        type: typeText,
        defaultValue
      });
    } else if (t.isRestElement(property) && t.isIdentifier(property.argument)) {
      props.push({
        name: property.argument.name,
        required: false,
        type: 'Record<string, unknown>',
        defaultValue: null,
        description: 'Rest props'
      });
    }
  });

  return props;
};

export const parseComponent = (code: string): t.File => parse(code, parserOptions);

export const extractComponentName = (ast: t.File): string | null => {
  let detectedName: string | null = null;

  traverse(ast, {
    ExportDefaultDeclaration(path) {
      if (detectedName) {
        return;
      }
      const { declaration } = path.node;
      if (t.isIdentifier(declaration)) {
        detectedName = declaration.name;
      } else if (t.isFunctionDeclaration(declaration) && declaration.id) {
        detectedName = declaration.id.name;
      } else if (t.isClassDeclaration(declaration) && declaration.id) {
        detectedName = declaration.id.name;
      } else if (t.isCallExpression(declaration)) {
        const firstArg = declaration.arguments[0];
        if (t.isIdentifier(firstArg)) {
          detectedName = firstArg.name;
        } else if (t.isFunctionExpression(firstArg) || t.isArrowFunctionExpression(firstArg)) {
          const functionId =
            'id' in firstArg && firstArg.id && t.isIdentifier(firstArg.id) ? firstArg.id : null;
          if (functionId) {
            detectedName = functionId.name;
          }
        }
      }
    },
    FunctionDeclaration(path) {
      if (!detectedName && path.node.id && isComponentName(path.node.id.name)) {
        detectedName = path.node.id.name;
      }
    },
    ClassDeclaration(path) {
      if (!detectedName && path.node.id && isComponentName(path.node.id.name)) {
        detectedName = path.node.id.name;
      }
    },
    VariableDeclarator(path) {
      if (detectedName || !t.isIdentifier(path.node.id)) {
        return;
      }
      const { name } = path.node.id;
      if (!isComponentName(name)) {
        return;
      }
      const init = path.node.init;
      if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
        detectedName = name;
      }
    }
  });

  return detectedName;
};

export const detectComponentType = (ast: t.File, componentName: string): ComponentType => {
  let type: ComponentType = 'functional';

  traverse(ast, {
    ClassDeclaration(path) {
      if (path.node.id?.name === componentName) {
        type = 'class';
      }
    }
  });

  return type;
};

export const extractPropsInterface = (
  ast: t.File,
  code: string,
  componentName: string
): PropDefinition[] => {
  const interfaceMap = new Map<string, t.TSInterfaceDeclaration | t.TSTypeAliasDeclaration>();

  traverse(ast, {
    TSInterfaceDeclaration(path) {
      interfaceMap.set(path.node.id.name, path.node);
    },
    TSTypeAliasDeclaration(path) {
      interfaceMap.set(path.node.id.name, path.node);
    }
  });

  const props: PropDefinition[] = [];
  const referencedTypeNames = new Set<string>();

  const processParams = (params: (t.Identifier | t.Pattern | t.RestElement)[]) => {
    if (!params.length) {
      return;
    }
    const firstParam = params[0];
    if (t.isObjectPattern(firstParam)) {
      extractPropsFromObjectPattern(firstParam, code).forEach((prop) => props.push(prop));
      const type = getTypeFromAnnotation(firstParam.typeAnnotation ?? null);
      const typeName = type ? extractTypeNameFromAnnotation(type) : null;
      if (typeName) {
        referencedTypeNames.add(typeName);
      }
    } else if (t.isIdentifier(firstParam) && firstParam.typeAnnotation) {
      const type = getTypeFromAnnotation(firstParam.typeAnnotation);
      const typeName = type ? extractTypeNameFromAnnotation(type) : null;
      if (typeName) {
        referencedTypeNames.add(typeName);
      }
    }
  };

  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id?.name === componentName) {
        processParams(path.node.params as (t.Identifier | t.Pattern | t.RestElement)[]);
      }
    },
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id) || path.node.id.name !== componentName) {
        return;
      }
      if (path.node.id.typeAnnotation) {
        const annotation = getTypeFromAnnotation(path.node.id.typeAnnotation);
        if (annotation) {
          if (
            t.isTSTypeReference(annotation) &&
            annotation.typeParameters &&
            annotation.typeParameters.params.length
          ) {
            const paramType = annotation.typeParameters.params[0];
            const typeName = extractTypeNameFromAnnotation(paramType);
            if (typeName) {
              referencedTypeNames.add(typeName);
            }
          } else {
            const typeName = extractTypeNameFromAnnotation(annotation);
            if (typeName) {
              referencedTypeNames.add(typeName);
            }
          }
        }
      }

      const init = path.node.init;
      if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
        processParams(init.params as (t.Identifier | t.Pattern | t.RestElement)[]);
      }
    },
    ClassDeclaration(path) {
      if (path.node.id?.name !== componentName) {
        return;
      }
      const superTypeParams = path.node.superTypeParameters;
      if (superTypeParams && t.isTSTypeParameterInstantiation(superTypeParams) && superTypeParams.params.length) {
        const propsType = superTypeParams.params[0];
        const typeName = extractTypeNameFromAnnotation(propsType);
        if (typeName) {
          referencedTypeNames.add(typeName);
        }
      }
    }
  });

  referencedTypeNames.forEach((typeName) => {
    const declaration = interfaceMap.get(typeName);
    if (declaration) {
      collectInterfaceMembers(declaration, code).forEach((prop) => {
        props.push(prop);
      });
    }
  });

  return props;
};

export const extractHooks = (
  ast: t.File,
  code: string
): { hooks: HookUsage[]; state: StateUsage[] } => {
  const hooks: HookUsage[] = [];
  const state: StateUsage[] = [];

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      let hookName: string | null = null;

      if (t.isIdentifier(callee) && HOOK_NAMES.has(callee.name)) {
        hookName = callee.name;
      } else if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.property) &&
        HOOK_NAMES.has(callee.property.name)
      ) {
        hookName = callee.property.name;
      }

      if (!hookName) {
        return;
      }

      const usage: HookUsage = {
        name: hookName
      };

      if (
        (hookName === 'useEffect' ||
          hookName === 'useMemo' ||
          hookName === 'useCallback' ||
          hookName === 'useLayoutEffect') &&
        path.node.arguments.length > 1
      ) {
        const depsArg = path.node.arguments[1];
        if (t.isArrayExpression(depsArg)) {
          usage.dependencies = depsArg.elements
            .map((element) =>
              element && element.start != null && element.end != null
                ? code.slice(element.start, element.end)
                : null
            )
            .filter((value): value is string => value !== null);
        }
      }

      if (hookName === 'useState' || hookName === 'useReducer') {
        const parent = path.parentPath;
        if (parent && parent.isVariableDeclarator()) {
          const id = parent.node.id;
          if (t.isArrayPattern(id)) {
            const firstElement = id.elements[0];
            if (t.isIdentifier(firstElement)) {
              state.push({
                name: firstElement.name,
                initialValue:
                  path.node.arguments[0] && path.node.arguments[0].start != null
                    ? code.slice(
                        path.node.arguments[0].start!,
                        path.node.arguments[0].end ?? path.node.arguments[0].start!
                      )
                    : undefined
              });
            }
          }
        }
      }

      hooks.push(usage);
    }
  });

  return { hooks, state };
};

export const extractEventHandlers = (ast: t.File, code: string): EventHandler[] => {
  const handlers: EventHandler[] = [];

  traverse(ast, {
    JSXAttribute(path) {
      if (!t.isJSXIdentifier(path.node.name)) {
        return;
      }

      const attributeName = path.node.name.name;
      if (!/^on[A-Z].*/.test(attributeName)) {
        return;
      }

      let handler = 'anonymous';
      const value = path.node.value;
      if (t.isJSXExpressionContainer(value)) {
        const expression = value.expression;
        if (t.isIdentifier(expression)) {
          handler = expression.name;
        } else {
          handler = getNodeText(code, expression) ?? handler;
        }
      } else if (t.isStringLiteral(value)) {
        handler = value.value;
      }

      const openingElement = path.findParent((parent) => parent.isJSXOpeningElement()) as
        | NodePath<t.JSXOpeningElement>
        | null;

      let elementName: string | null = null;
      if (openingElement) {
        const { name } = openingElement.node;
        if (t.isJSXIdentifier(name)) {
          elementName = name.name;
        } else if (t.isJSXMemberExpression(name)) {
          if (t.isJSXIdentifier(name.property)) {
            elementName = name.property.name;
          }
        }
      }

      handlers.push({
        name: attributeName,
        handler,
        element: elementName
      });
    }
  });

  return handlers;
};

export const extractDataTestIds = (ast: t.File): string[] => {
  const dataTestIds = new Set<string>();

  traverse(ast, {
    JSXAttribute(path) {
      if (t.isJSXIdentifier(path.node.name) && path.node.name.name === 'data-testid') {
        const value = path.node.value;
        if (t.isStringLiteral(value)) {
          dataTestIds.add(value.value);
        }
      }
    }
  });

  return Array.from(dataTestIds);
};
