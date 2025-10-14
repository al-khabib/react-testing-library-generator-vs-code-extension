import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { EventHandler, HookUsage, ImportDefinition } from '../types';

export const analyzeImports = (ast: t.File): ImportDefinition[] => {
  const imports: ImportDefinition[] = [];

  traverse(ast, {
    ImportDeclaration(path) {
      const { node } = path;
      const imported: string[] = [];
      let namespace: string | null = null;
      let defaultImport: string | null = null;

      node.specifiers.forEach((specifier) => {
        if (t.isImportSpecifier(specifier)) {
          if (t.isIdentifier(specifier.imported)) {
            imported.push(specifier.imported.name);
          } else if (t.isStringLiteral(specifier.imported)) {
            imported.push(specifier.imported.value);
          }
        } else if (t.isImportNamespaceSpecifier(specifier)) {
          namespace = specifier.local.name;
        } else if (t.isImportDefaultSpecifier(specifier)) {
          defaultImport = specifier.local.name;
        }
      });

      imports.push({
        source: node.source.value,
        imported,
        namespace,
        defaultImport
      });
    }
  });

  return imports;
};

interface TestingContext {
  hooks: HookUsage[];
  eventHandlers: EventHandler[];
  dataTestIds: string[];
  imports: ImportDefinition[];
}

export const identifyTestingLibraryNeeds = (context: TestingContext): string[] => {
  const recommendations = new Set<string>();

  if (context.eventHandlers.length) {
    recommendations.add('Use fireEvent or userEvent to trigger component callbacks.');
  }

  const hasAsyncHook = context.hooks.some((hook) => hook.name === 'useEffect' || hook.name === 'useLayoutEffect');
  if (hasAsyncHook) {
    recommendations.add('Wrap asynchronous updates in waitFor or findBy queries.');
  }

  const usesState = context.hooks.some((hook) => hook.name === 'useState' || hook.name === 'useReducer');
  if (usesState) {
    recommendations.add('Leverage act utilities when asserting stateful updates.');
  }

  if (context.dataTestIds.length) {
    recommendations.add('Prefer getByTestId or within queries for elements with data-testid attributes.');
  }

  const usesRouter = context.imports.some((imp) => imp.source.includes('react-router'));
  if (usesRouter) {
    recommendations.add('Wrap component with MemoryRouter when rendering in tests.');
  }

  const usesRedux = context.imports.some((imp) => imp.source.includes('react-redux'));
  if (usesRedux) {
    recommendations.add('Provide Redux store context (Provider) when rendering tests.');
  }

  return Array.from(recommendations);
};
