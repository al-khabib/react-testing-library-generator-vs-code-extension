import * as vscode from "vscode";

export function getImports(document: vscode.TextDocument): string[] {
  const imports: string[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text.trim();
    if (!line) continue;
    if (line.startsWith("import")) {
      imports.push(line);
      continue;
    }
    if (!line.startsWith("import") && !line.startsWith("export {")) break;
  }
  return imports;
}

export function getSelection(document: vscode.TextDocument): {
  selection: vscode.Selection;
  text: string;
} | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document) return null;
  if (editor.selections.length !== 1) return null;
  const selection = editor.selection;
  if (selection.isEmpty) return null;
  const text = document.getText(selection).trim();
  if (!text) return null;
  return { selection, text };
}

export function getWorkspaceRelativePath(uri: vscode.Uri): string | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return undefined;
  return uri.fsPath.substring(folder.uri.fsPath.length + 1).replace(/\\/g, "/");
}
