import * as path from 'path';
import * as vscode from 'vscode';
import { ComponentInfo } from '../types';

const COMPONENT_NAME_PATTERN = /[A-Z][A-Za-z0-9_]*/;

const FUNCTION_COMPONENT_PATTERNS: RegExp[] = [
  new RegExp(`export\\s+default\\s+function\\s+(${COMPONENT_NAME_PATTERN.source})\\s*\\(`),
  new RegExp(`function\\s+(${COMPONENT_NAME_PATTERN.source})\\s*\\(`),
  new RegExp(
    `export\\s+const\\s+(${COMPONENT_NAME_PATTERN.source})\\s*(?::\\s*React\\.(?:FC|FunctionComponent)\\s*<[^>]+>)?\\s*=\\s*`
  ),
  new RegExp(
    `const\\s+(${COMPONENT_NAME_PATTERN.source})\\s*(?::\\s*React\\.(?:FC|FunctionComponent)\\s*<[^>]+>)?\\s*=\\s*`
  )
];

const ARROW_FUNCTION_PATTERN = new RegExp(
  `const\\s+(${COMPONENT_NAME_PATTERN.source})\\s*=?\\s*(?:React\\.)?(?:memo|forwardRef)?\\s*\\(?[A-Za-z0-9_,\\s{}:=\\[\\]<>\\.?]*\\)?\\s*=>`,
  'm'
);

const CLASS_COMPONENT_PATTERN = new RegExp(
  `class\\s+(${COMPONENT_NAME_PATTERN.source})\\s+extends\\s+(?:React\\.)?(?:Component|PureComponent)`,
  'm'
);

const TEST_FILE_CANDIDATES = [
  (name: string) => `${name}.test.tsx`,
  (name: string) => `${name}.test.ts`,
  (name: string) => `${name}.spec.tsx`,
  (name: string) => `${name}.spec.ts`,
  (name: string) => `${name}.test.jsx`,
  (name: string) => `${name}.spec.jsx`
];

const findComponentName = (text: string): string | null => {
  for (const pattern of [...FUNCTION_COMPONENT_PATTERNS, ARROW_FUNCTION_PATTERN, CLASS_COMPONENT_PATTERN]) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
};

const extractPropsDefinition = (text: string, componentName: string): string | null => {
  const propsTypeNameMatch =
    new RegExp(
      `${componentName}\\s*:\\s*React\\.(?:FC|FunctionComponent)\\s*<\\s*(${COMPONENT_NAME_PATTERN.source})\\s*>`,
      'm'
    ).exec(text) ??
    new RegExp(
      `function\\s+${componentName}\\s*\\([^)]*:\\s*(${COMPONENT_NAME_PATTERN.source})`,
      'm'
    ).exec(text) ??
    new RegExp(
      `const\\s+${componentName}\\s*=?\\s*\\([^)]*:\\s*(${COMPONENT_NAME_PATTERN.source})`,
      'm'
    ).exec(text);

  const propsTypeName =
    propsTypeNameMatch?.[1] ??
    (text.includes(`${componentName}Props`) ? `${componentName}Props` : null);

  if (!propsTypeName) {
    return null;
  }

  const interfaceRegex = new RegExp(
    `interface\\s+${propsTypeName}\\s+{[\\s\\S]*?}`,
    'm'
  );
  const typeRegex = new RegExp(
    `type\\s+${propsTypeName}\\s*=\\s*{[\\s\\S]*?}`,
    'm'
  );

  const interfaceMatch = interfaceRegex.exec(text);
  if (interfaceMatch) {
    return interfaceMatch[0].trim();
  }

  const typeMatch = typeRegex.exec(text);
  if (typeMatch) {
    return typeMatch[0].trim();
  }

  return null;
};

const extractImports = (text: string): string[] => {
  const matches = text.match(/^\s*import\s.+$/gm);
  return matches?.map((line) => line.trim()) ?? [];
};

const fileExists = async (uri: vscode.Uri): Promise<boolean> => {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
};

const detectExistingTests = async (
  componentDir: string,
  componentName: string,
  workspaceFolder: vscode.WorkspaceFolder | undefined
): Promise<boolean> => {
  const searchDirectories = [
    path.join(componentDir, '__tests__'),
    componentDir,
    ...(workspaceFolder ? [path.join(workspaceFolder.uri.fsPath, '__tests__')] : [])
  ];

  for (const directory of searchDirectories) {
    for (const candidateFactory of TEST_FILE_CANDIDATES) {
      const candidate = candidateFactory(componentName);
      const testPath = path.join(directory, candidate);
      const uri = vscode.Uri.file(testPath);
      if (await fileExists(uri)) {
        return true;
      }
    }
  }

  return false;
};

export const detectReactComponent = async (
  document: vscode.TextDocument
): Promise<ComponentInfo | null> => {
  const text = document.getText();
  const componentName = findComponentName(text);

  if (!componentName) {
    return null;
  }

  const props = extractPropsDefinition(text, componentName);
  const imports = extractImports(text);
  const componentDir = path.dirname(document.uri.fsPath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const hasTests = await detectExistingTests(componentDir, componentName, workspaceFolder);

  return {
    name: componentName,
    filePath: document.uri.fsPath,
    code: text,
    props,
    imports,
    hasTests,
    displayName: componentName
  };
};
