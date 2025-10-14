import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import {
  ComponentInfo,
  ExtensionSettings,
  GeneratedTest,
  ServiceStatus,
  TestHistoryEntry
} from '../types';

type IncomingMessage =
  | { type: 'getSettings' }
  | { type: 'getStatus' }
  | { type: 'getHistory' }
  | { type: 'updateSettings'; payload: ExtensionSettings }
  | { type: 'generateTest' }
  | { type: 'testGenerated'; payload: GeneratedTest & { componentName: string; filePath?: string } };

interface ManifestEntry {
  file: string;
  css?: string[];
}

const HISTORY_KEY = 'rtlTestGenerator.history';
const STATUS_KEY = 'rtlTestGenerator.status';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'rtl-generator.sidebarView';

  private view: vscode.WebviewView | undefined;

  private history: TestHistoryEntry[];

  private status: ServiceStatus | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.history = context.workspaceState.get<TestHistoryEntry[]>(HISTORY_KEY, []);
    this.status = context.workspaceState.get<ServiceStatus | undefined>(STATUS_KEY);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this.view = webviewView;
    const webview = webviewView.webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')]
    };

    webview.onDidReceiveMessage(async (message: IncomingMessage) => {
      await this.handleMessage(message);
    });

    return this.setHtml(webview).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error loading sidebar.';
      vscode.window.showErrorMessage(message);
    });
  }

  public handleGenerationStart(component: ComponentInfo): void {
    const entry: TestHistoryEntry = {
      componentName: component.name,
      filePath: component.filePath,
      status: 'pending',
      timestamp: new Date().toISOString()
    };
    this.upsertHistoryEntry(component.name, component.filePath, entry);
    void this.persistHistory();
    this.postMessage({ type: 'history', payload: this.history });
  }

  public async handleGenerationSuccess(
    component: ComponentInfo,
    generatedTest: GeneratedTest
  ): Promise<void> {
    const timestamp = generatedTest.generatedAt ?? new Date().toISOString();
    const entry: TestHistoryEntry = {
      componentName: component.name,
      filePath: component.filePath,
      status: 'success',
      timestamp,
      generatedTest: { ...generatedTest, generatedAt: timestamp }
    };
    this.upsertHistoryEntry(component.name, component.filePath, entry);
    await this.persistHistory();
    this.postMessage({
      type: 'testGenerated',
      payload: {
        componentName: component.name,
        ...entry.generatedTest
      }
    });
    this.postMessage({ type: 'history', payload: this.history });
  }

  public async handleGenerationError(component: ComponentInfo, errorMessage: string): Promise<void> {
    const entry: TestHistoryEntry = {
      componentName: component.name,
      filePath: component.filePath,
      status: 'error',
      timestamp: new Date().toISOString(),
      errorMessage
    };
    this.upsertHistoryEntry(component.name, component.filePath, entry);
    await this.persistHistory();
    this.postMessage({ type: 'error', payload: errorMessage });
    this.postMessage({ type: 'history', payload: this.history });
  }

  public async updateStatus(status: ServiceStatus): Promise<void> {
    this.status = status;
    await this.context.workspaceState.update(STATUS_KEY, status);
    this.postMessage({ type: 'status', payload: status });
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    switch (message.type) {
      case 'getSettings':
        this.postMessage({ type: 'settings', payload: this.getSettings() });
        break;
      case 'getStatus':
        if (this.status) {
          this.postMessage({ type: 'status', payload: this.status });
        }
        break;
      case 'getHistory':
        this.postMessage({ type: 'history', payload: this.history });
        break;
      case 'updateSettings': {
        const settings = message.payload;
        await this.updateConfiguration(settings);
        this.postMessage({ type: 'settings', payload: this.getSettings() });
        vscode.window.showInformationMessage('RTL Test Generator settings updated.');
        break;
      }
      case 'generateTest':
        await vscode.commands.executeCommand('rtl-generator.generateTest');
        break;
      case 'testGenerated': {
        const payload = message.payload;
        const entry: TestHistoryEntry = {
          componentName: payload.componentName,
          filePath: payload.filePath ?? payload.relativePath ?? payload.fileName,
          status: 'success',
          timestamp: payload.generatedAt ?? new Date().toISOString(),
          generatedTest: payload
        };
        this.upsertHistoryEntry(payload.componentName, entry.filePath, entry);
        await this.persistHistory();
        this.postMessage({ type: 'history', payload: this.history });
        break;
      }
      default:
        break;
    }
  }

  private postMessage(message: unknown): void {
    if (this.view?.webview) {
      this.view.webview.postMessage(message);
    }
  }

  private getSettings(): ExtensionSettings {
    const configuration = vscode.workspace.getConfiguration('rtlTestGenerator');
    return {
      apiGatewayUrl: configuration.get<string>('apiGatewayUrl', 'http://localhost:3000'),
      testOutputDirectory: configuration.get<string>('testOutputDirectory', '__tests__'),
      autoSaveGeneratedTests: configuration.get<boolean>('autoSaveGeneratedTests', false)
    };
  }

  private async updateConfiguration(settings: ExtensionSettings): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('rtlTestGenerator');
    await Promise.all([
      configuration.update('apiGatewayUrl', settings.apiGatewayUrl, vscode.ConfigurationTarget.Workspace),
      configuration.update(
        'testOutputDirectory',
        settings.testOutputDirectory,
        vscode.ConfigurationTarget.Workspace
      ),
      configuration.update(
        'autoSaveGeneratedTests',
        settings.autoSaveGeneratedTests,
        vscode.ConfigurationTarget.Workspace
      )
    ]);
  }

  private async persistHistory(): Promise<void> {
    this.history = this.history.slice(0, 20);
    await this.context.workspaceState.update(HISTORY_KEY, this.history);
  }

  private upsertHistoryEntry(componentName: string, filePath: string, entry: TestHistoryEntry): void {
    const existingIndex = this.history.findIndex(
      (item) => item.componentName === componentName && item.filePath === filePath
    );

    if (existingIndex >= 0) {
      this.history.splice(existingIndex, 1, entry);
    } else {
      this.history = [entry, ...this.history];
    }
  }

  private async setHtml(webview: vscode.Webview): Promise<void> {
    const { scriptUri, styleUris } = await this.getWebviewAssets(webview);
    const nonce = this.generateNonce();
    const cspSource = webview.cspSource;

    webview.html = `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; script-src 'nonce-${nonce}' ${cspSource}; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource};" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          ${styleUris
            .map(
              (uri) => `<link rel="stylesheet" href="${uri}" />`
            )
            .join('\n')}
          <title>RTL Test Generator</title>
        </head>
        <body>
          <div id="root"></div>
          <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
        </body>
      </html>`;
  }

  private async loadWebviewManifest(): Promise<Record<string, ManifestEntry>> {
    const manifestCandidates = [
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'manifest.json'),
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', '.vite', 'manifest.json')
    ];

    for (const candidate of manifestCandidates) {
      try {
        const manifestContent = await vscode.workspace.fs.readFile(candidate);
        return JSON.parse(new TextDecoder().decode(manifestContent)) as Record<string, ManifestEntry>;
      } catch (error) {
        if (error instanceof vscode.FileSystemError && error.code !== 'FileNotFound') {
          throw error;
        }
      }
    }

    throw new Error('Failed to locate webview asset manifest.');
  }

  private async getWebviewAssets(webview: vscode.Webview): Promise<{
    scriptUri: vscode.Uri;
    styleUris: vscode.Uri[];
  }> {
    const manifest = await this.loadWebviewManifest();

    const entry = manifest['index.html'] ?? manifest['src/main.tsx'];

    if (!entry) {
      throw new Error('Webview assets manifest is missing the main entry.');
    }

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', entry.file)
    );

    const styleUris =
      entry.css?.map((cssPath) =>
        webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', cssPath))
      ) ?? [];

    return { scriptUri, styleUris };
  }

  private generateNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
  }
}
