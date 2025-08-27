import * as vscode from 'vscode';

type GenerateRequest = {
  componentPath: string;
  componentSource: string;
  goals: { coverage: 'smoke' | 'interactions' | 'edge' };
};

type GenerateResponse = {
  tests: { filename: string; code: string }[];
  fixes?: { file: string; patch: string; reason: string }[];
  warnings?: string[];
};

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('testgen');
  return {
    gatewayUrl: cfg.get<string>('gatewayUrl', 'http://localhost:8000'),
    model: cfg.get<string>('model', 'deepseek-coder-v2-lite-instruct'),
    outputDir: cfg.get<string>('outputDir', '__tests__'),
  };
}

async function postJSON<T>(baseUrl: string, path: string, body: any): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gateway error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function ensureDir(uri: vscode.Uri) {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    await vscode.workspace.fs.createDirectory(uri);
  }
}

async function writeTests(rootDir: vscode.Uri, tests: { filename: string; code: string }[]) {
  for (const t of tests) {
    const fileUri = vscode.Uri.joinPath(rootDir, t.filename);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(t.code, 'utf8'));
  }
}

export function activate(context: vscode.ExtensionContext) {
  const genForFile = vscode.commands.registerCommand('testgen.generateForFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showWarningMessage('Open a TS/TSX file first.');
    const doc = editor.document;
    const filePath = doc.uri.fsPath;
    const source = doc.getText();
    const { gatewayUrl, outputDir } = getConfig();

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Generating RTL tests…', cancellable: false },
      async () => {
        const payload: GenerateRequest = {
          componentPath: filePath,
          componentSource: source,
          goals: { coverage: 'interactions' },
        };
        const resp = await postJSON<GenerateResponse>(gatewayUrl, '/v1/tests/generate', payload);
        const targetDir = vscode.Uri.joinPath(doc.uri.with({ path: doc.uri.path.replace(/\\/g, '/') }).with({}), '..', outputDir);
        await ensureDir(targetDir);
        await writeTests(targetDir, resp.tests);
        vscode.window.showInformationMessage(`Generated ${resp.tests.length} test file(s).`);
      }
    );
  });

  const genForFolder = vscode.commands.registerCommand('testgen.generateForFolder', async (uri?: vscode.Uri) => {
    const folder = uri ?? vscode.workspace.workspaceFolders?.?.uri;
    if (!folder) return vscode.window.showWarningMessage('Open a workspace or pass a folder.');
    const { gatewayUrl, outputDir } = getConfig();

    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, '**/*.{tsx,ts}'),
      '**/*.test.*'
    );

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Batch generating RTL tests…', cancellable: false },
      async () => {
        let total = 0;
        for (const file of files) {
          const doc = await vscode.workspace.openTextDocument(file);
          const payload: GenerateRequest = {
            componentPath: file.fsPath,
            componentSource: doc.getText(),
            goals: { coverage: 'smoke' },
          };
          try {
            const resp = await postJSON<GenerateResponse>(gatewayUrl, '/v1/tests/generate', payload);
            const targetDir = vscode.Uri.joinPath(file, '..', outputDir);
            await ensureDir(targetDir);
            await writeTests(targetDir, resp.tests);
            total += resp.tests.length;
          } catch (e: any) {
            console.error(`Failed for ${file.fsPath}:`, e?.message ?? e);
          }
        }
        vscode.window.showInformationMessage(`Batch generated ${total} test file(s).`);
      }
    );
  });

  const fixSelectors = vscode.commands.registerCommand('testgen.fixSelectorsInFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showWarningMessage('Open a test file.');
    const doc = editor.document;
    const source = doc.getText();
    const { gatewayUrl } = getConfig();

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Suggesting selector fixes…', cancellable: false },
      async () => {
        const resp = await postJSON<{ fixes: { file: string; patch: string; reason: string }[] }>(
          gatewayUrl,
          '/v1/tests/validate',
          { filePath: doc.uri.fsPath, source }
        );
        if (!resp.fixes?.length) {
          return vscode.window.showInformationMessage('No selector issues found.');
        }
        const edit = new vscode.WorkspaceEdit();
        // Simple whole-file patch replace if patch provides full file
        edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), resp.fixes.patch);
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage(`Applied ${resp.fixes.length} fix(es).`);
      }
    );
  });

  context.subscriptions.push(genForFile, genForFolder, fixSelectors);
}

export function deactivate() {}
