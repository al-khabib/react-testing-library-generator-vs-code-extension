import * as path from 'path';
import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';
import { SidebarProvider } from '../providers/SidebarProvider';
import { ComponentInfo, GeneratedTest } from '../types';
import { httpClient } from '../utils/httpClient';

type PanelInitPayload = {
  component: {
    name: string;
    displayName: string;
    filePath: string;
    source: 'full' | 'selection';
  };
  generatedTest: GeneratedTest;
};

type PanelOutgoingMessage =
  | { type: 'init'; payload: PanelInitPayload }
  | { type: 'generation:started' }
  | { type: 'generation:success'; payload: { generatedTest: GeneratedTest } }
  | { type: 'generation:error'; payload: { message: string } }
  | { type: 'file:saved'; payload: { filePath: string; relativePath?: string } }
  | { type: 'file:saveError'; payload: { message: string } };

type PanelIncomingMessage =
  | { type: 'ready' }
  | {
      type: 'regenerate';
      payload: { instructions?: string; displayName?: string };
    }
  | {
      type: 'retry';
      payload?: { instructions?: string; displayName?: string };
    }
  | {
      type: 'approve';
      payload: { displayName?: string; content?: string };
    }
  | { type: 'copy'; payload?: { content?: string } }
  | { type: 'close' };

interface ManifestEntry {
  file: string;
  css?: string[];
}

interface GenerationContext {
  componentInfo: ComponentInfo;
  generatedTest: GeneratedTest;
  displayName: string;
  lastInstructions: string;
}

export class TestGenerationPanel implements vscode.Disposable {
  private readonly panel: vscode.WebviewPanel;

  private readonly disposables: vscode.Disposable[] = [];

  private contextState: GenerationContext;

  private readonly sidebarProvider?: SidebarProvider;

  private constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    componentInfo: ComponentInfo,
    generatedTest: GeneratedTest,
    sidebarProvider?: SidebarProvider
  ) {
    this.sidebarProvider = sidebarProvider;

    const displayName = componentInfo.displayName ?? componentInfo.name;

    this.contextState = {
      componentInfo: { ...componentInfo, displayName },
      generatedTest,
      displayName,
      lastInstructions: componentInfo.instructions ?? ''
    };

    this.panel = vscode.window.createWebviewPanel(
      'rtl-generator.testPanel',
      `RTL Test Preview – ${displayName}`,
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionContext.extensionUri, 'dist', 'webview')]
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.extensionContext.extensionUri, 'media', 'rtl-icon.svg');
    void this.initializeWebview();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message: PanelIncomingMessage) => this.handleMessage(message).catch((error) => {
        const messageText = error instanceof Error ? error.message : 'Unexpected error occurred.';
        vscode.window.showErrorMessage(messageText);
        this.postMessage({ type: 'generation:error', payload: { message: messageText } });
      }),
      null,
      this.disposables
    );
  }

  static async create(
    extensionContext: vscode.ExtensionContext,
    componentInfo: ComponentInfo,
    generatedTest: GeneratedTest,
    sidebarProvider?: SidebarProvider
  ): Promise<TestGenerationPanel> {
    const panel = new TestGenerationPanel(extensionContext, componentInfo, generatedTest, sidebarProvider);
    await panel.whenReady();
    return panel;
  }

  dispose(): void {
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
    this.panel.dispose();
  }

  private async whenReady(): Promise<void> {
    await new Promise<void>((resolve) => {
      const listener = this.panel.webview.onDidReceiveMessage((message: PanelIncomingMessage) => {
        if (message.type === 'ready') {
          listener.dispose();
          resolve();
        }
      });
      this.disposables.push(listener);
    });

    this.postMessage({
      type: 'init',
      payload: {
        component: {
          name: this.contextState.componentInfo.name,
          displayName: this.contextState.displayName,
          filePath: this.contextState.componentInfo.filePath,
          source: this.contextState.componentInfo.source ?? 'full'
        },
        generatedTest: this.contextState.generatedTest
      }
    });
  }

  private async initializeWebview(): Promise<void> {
    try {
      const { scriptUri, styleUris } = await this.getWebviewAssets(this.panel.webview, 'panel.html');
      const nonce = this.generateNonce();
      const cspSource = this.panel.webview.cspSource;

      this.panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; script-src 'nonce-${nonce}' ${cspSource}; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource};" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            ${styleUris.map((uri) => `<link rel="stylesheet" href="${uri}" />`).join('\n')}
            <title>RTL Test Preview</title>
          </head>
          <body>
            <div id="root"></div>
            <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
          </body>
        </html>`;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load test preview resources.';
      vscode.window.showErrorMessage(message);
      this.panel.webview.html = `<html><body style="font-family: sans-serif; padding: 1rem;"><h3>Failed to load test preview</h3><p>${message}</p></body></html>`;
    }
  }

  private async handleMessage(message: PanelIncomingMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        // handled in whenReady promise.
        break;
      case 'regenerate':
      case 'retry': {
        const instructions = message.payload?.instructions ?? this.contextState.lastInstructions ?? '';
        const displayName = message.payload?.displayName ?? this.contextState.displayName;
        await this.handleRegeneration(instructions, displayName);
        break;
      }
      case 'approve': {
        const displayName = message.payload.displayName ?? this.contextState.displayName;
        const content = message.payload.content;
        await this.handleApprove(displayName, content);
        break;
      }
      case 'copy':
        await vscode.env.clipboard.writeText(
          message.payload?.content ?? this.contextState.generatedTest.content
        );
        vscode.window.showInformationMessage('Generated test copied to clipboard.');
        break;
      case 'close':
        this.dispose();
        break;
      default:
        break;
    }
  }

  private async loadWebviewManifest(): Promise<Record<string, ManifestEntry>> {
    const manifestCandidates = [
      vscode.Uri.joinPath(this.extensionContext.extensionUri, 'dist', 'webview', 'manifest.json'),
      vscode.Uri.joinPath(this.extensionContext.extensionUri, 'dist', 'webview', '.vite', 'manifest.json')
    ];

    for (const candidate of manifestCandidates) {
      try {
        const bytes = await vscode.workspace.fs.readFile(candidate);
        return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, ManifestEntry>;
      } catch (error) {
        if (error instanceof vscode.FileSystemError && error.code !== 'FileNotFound') {
          throw error;
        }
      }
    }

    throw new Error('Failed to locate test panel webview manifest.');
  }

  private async handleRegeneration(instructions: string, displayName: string): Promise<void> {
    this.postMessage({ type: 'generation:started' });
    const sanitizedInstructions = instructions.trim();
    const updatedComponent: ComponentInfo = {
      ...this.contextState.componentInfo,
      displayName,
      instructions: sanitizedInstructions.length ? sanitizedInstructions : undefined,
      source: this.contextState.componentInfo.source ?? 'full'
    };

    try {
      const generatedTest = await httpClient.generateTest(updatedComponent);

      this.contextState = {
        componentInfo: updatedComponent,
        generatedTest,
        displayName,
        lastInstructions: sanitizedInstructions
      };

      this.panel.title = `RTL Test Preview – ${displayName}`;
      this.postMessage({
        type: 'generation:success',
        payload: { generatedTest }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : httpClient.extractErrorMessage(error);
      this.postMessage({ type: 'generation:error', payload: { message } });
    }
  }

  private async handleApprove(displayName: string, content?: string): Promise<void> {
    const effectiveDisplayName = displayName.trim().length ? displayName.trim() : this.contextState.displayName;
    const sanitizedContent = typeof content === 'string' ? content : this.contextState.generatedTest.content;
    this.contextState = {
      ...this.contextState,
      displayName: effectiveDisplayName,
      componentInfo: {
        ...this.contextState.componentInfo,
        displayName: effectiveDisplayName
      },
      generatedTest: {
        ...this.contextState.generatedTest,
        content: sanitizedContent
      }
    };

    const configuration = vscode.workspace.getConfiguration('rtlTestGenerator');
    const outputDirectorySetting = configuration.get<string>('testOutputDirectory') ?? '__tests__';

    const componentDirectory = path.dirname(this.contextState.componentInfo.filePath);
    const targetDirectory = path.isAbsolute(outputDirectorySetting)
      ? outputDirectorySetting
      : path.join(componentDirectory, outputDirectorySetting);

    const defaultFileName =
      this.contextState.generatedTest.fileName ??
      `${effectiveDisplayName.replace(/\s+/g, '')}.test.tsx`;

    const defaultUri = vscode.Uri.file(path.join(targetDirectory, defaultFileName));

    const selection = await vscode.window.showSaveDialog({
      defaultUri,
      saveLabel: 'Create RTL Test File',
      filters: {
        'TypeScript React Test': ['tsx', 'ts'],
        'JavaScript React Test': ['jsx', 'js']
      }
    });

    if (!selection) {
      return;
    }

    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(selection.fsPath)));

      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(selection, encoder.encode(sanitizedContent));
      const document = await vscode.workspace.openTextDocument(selection);
      await vscode.window.showTextDocument(document, { preview: false });

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(selection);
      const relativePath =
        workspaceFolder != null
          ? path.relative(workspaceFolder.uri.fsPath, selection.fsPath)
          : undefined;

      this.postMessage({
        type: 'file:saved',
        payload: {
          filePath: selection.fsPath,
          relativePath
        }
      });

      const successPath = relativePath ?? selection.fsPath;
      vscode.window.showInformationMessage(`Created RTL test at ${successPath}.`);

      this.contextState = {
        ...this.contextState,
        generatedTest: {
          ...this.contextState.generatedTest,
          relativePath: relativePath ?? selection.fsPath,
          content: sanitizedContent
        }
      };

      if (this.sidebarProvider) {
        await this.sidebarProvider.handleGenerationSuccess(this.contextState.componentInfo, {
          ...this.contextState.generatedTest,
          generatedAt: this.contextState.generatedTest.generatedAt ?? new Date().toISOString(),
          relativePath
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create the test file.';
      this.postMessage({ type: 'file:saveError', payload: { message } });
      vscode.window.showErrorMessage(message);
    }
  }

  private postMessage(message: PanelOutgoingMessage): void {
    this.panel.webview.postMessage(message).then(
      undefined,
      (error: unknown) => {
        const messageText = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to communicate with test panel: ${messageText}`);
      }
    );
  }

  private async getWebviewAssets(webview: vscode.Webview, entryPoint: string): Promise<{
    scriptUri: vscode.Uri;
    styleUris: vscode.Uri[];
  }> {
    const manifest = await this.loadWebviewManifest();

    const entry = manifest[entryPoint] ?? manifest[`src/${entryPoint.replace('.html', '/main.tsx')}`];

    if (!entry) {
      throw new Error(`Webview manifest missing entry for ${entryPoint}`);
    }

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionContext.extensionUri, 'dist', 'webview', entry.file)
    );

    const styleUris =
      entry.css?.map((cssPath) =>
        webview.asWebviewUri(
          vscode.Uri.joinPath(this.extensionContext.extensionUri, 'dist', 'webview', cssPath)
        )
      ) ?? [];

    return { scriptUri, styleUris };
  }

  private generateNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () =>
      possible.charAt(Math.floor(Math.random() * possible.length))
    ).join('');
  }
}
