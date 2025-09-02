import * as vscode from "vscode";

export class TestPreviewPanel {
  private static currentPanel: TestPreviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.panel = vscode.window.createWebviewPanel(
      "rtlTestPreview",
      "🧪 RTL Test Preview",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "media"),
        ],
      },
    );

    this.panel.onDidDispose(this.dispose, null, this.disposables);
    this.setupWebviewContent();
  }

  public static show(context: vscode.ExtensionContext): TestPreviewPanel {
    if (TestPreviewPanel.currentPanel) {
      TestPreviewPanel.currentPanel.panel.reveal(vscode.ViewColumn.Two);
      return TestPreviewPanel.currentPanel;
    }

    TestPreviewPanel.currentPanel = new TestPreviewPanel(context);
    return TestPreviewPanel.currentPanel;
  }

  public updateTestCode(testCode: string, componentName: string) {
    this.panel.webview.postMessage({
      command: "updateTestCode",
      testCode,
      componentName,
    });
  }

  public show() {
    this.panel.reveal(vscode.ViewColumn.Two);
  }

  private setupWebviewContent() {
    this.panel.webview.html = this.getWebviewContent();

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "saveTest":
            await this.saveTestToFile(message.testCode, message.filePath);
            break;
          case "copyTest":
            await vscode.env.clipboard.writeText(message.testCode);
            vscode.window.showInformationMessage("Test copied to clipboard!");
            break;
          case "regenerate":
            await this.regenerateTest(message.style);
            break;
        }
      },
      null,
      this.disposables,
    );
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>RTL Test Preview</title>
            <style>
                * {
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                
                .header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: 600;
                }
                
                .header .icon {
                    font-size: 28px;
                    margin-right: 10px;
                }
                
                .controls {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }
                
                .button {
                    padding: 8px 16px;
                    border: 1px solid var(--vscode-button-border);
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s ease;
                }
                
                .button:hover {
                    background: var(--vscode-button-hoverBackground);
                    transform: translateY(-1px);
                }
                
                .button.primary {
                    background: var(--vscode-button-background);
                    border-color: var(--vscode-button-background);
                }
                
                .style-selector {
                    display: flex;
                    gap: 5px;
                }
                
                .style-option {
                    padding: 6px 12px;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.2s ease;
                }
                
                .style-option.active {
                    background: var(--vscode-button-background);
                    border-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                
                .code-container {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    overflow: hidden;
                    margin-bottom: 20px;
                }
                
                .code-header {
                    background: var(--vscode-editorGroupHeader-tabsBackground);
                    padding: 10px 15px;
                    font-size: 14px;
                    font-weight: 500;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .code-content {
                    background: var(--vscode-editor-background);
                    padding: 0;
                    margin: 0;
                }
                
                pre {
                    margin: 0;
                    padding: 20px;
                    overflow-x: auto;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    font-size: 14px;
                    line-height: 1.5;
                }
                
                .empty-state {
                    text-align: center;
                    padding: 60px 20px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .empty-state .icon {
                    font-size: 48px;
                    margin-bottom: 15px;
                    opacity: 0.5;
                }
                
                .loading {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 40px;
                    font-size: 16px;
                }
                
                .spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid var(--vscode-progressBar-background);
                    border-top: 2px solid var(--vscode-progressBar-background);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-right: 10px;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .quick-actions {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 10px;
                    margin-top: 20px;
                }
                
                .quick-action {
                    padding: 15px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    background: var(--vscode-editor-background);
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .quick-action:hover {
                    border-color: var(--vscode-button-background);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <span class="icon">🧪</span>
                <h1>RTL Test Preview</h1>
            </div>
            
            <div class="controls">
                <div class="style-selector">
                    <div class="style-option active" data-style="comprehensive">📋 Comprehensive</div>
                    <div class="style-option" data-style="minimal">⚡ Minimal</div>
                    <div class="style-option" data-style="accessibility">♿ Accessibility</div>
                </div>
                
                <button class="button primary" id="regenerateBtn">
                    <span>🔄</span> Regenerate
                </button>
                
                <button class="button" id="saveBtn">
                    <span>💾</span> Save Test
                </button>
                
                <button class="button" id="copyBtn">
                    <span>📋</span> Copy
                </button>
            </div>
            
            <div class="code-container">
                <div class="code-header">
                    <span id="testFileName">Generated Test</span>
                </div>
                <div class="code-content">
                    <div id="testCode" class="empty-state">
                        <div class="icon">🔍</div>
                        <h3>No Test Generated Yet</h3>
                        <p>Right-click on a React component and select "Generate RTL Tests" to get started.</p>
                    </div>
                </div>
            </div>
            
            <div class="quick-actions">
                <div class="quick-action" id="addTestCase">
                    <strong>➕ Add Test Case</strong>
                    <p>Add another test case to this suite</p>
                </div>
                
                <div class="quick-action" id="improveTests">
                    <strong>✨ Improve Tests</strong>
                    <p>Enhance existing tests with better practices</p>
                </div>
                
                <div class="quick-action" id="addMocks">
                    <strong>🎭 Add Mocks</strong>
                    <p>Generate mocks for dependencies</p>
                </div>
                
                <div class="quick-action" id="addA11yTests">
                    <strong>♿ Add A11y Tests</strong>
                    <p>Include accessibility testing</p>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                let currentTestCode = '';
                let currentFilePath = '';
                let currentStyle = 'comprehensive';
                
                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.command) {
                        case 'updateTestCode':
                            updateTestDisplay(message.testCode, message.componentName);
                            break;
                    }
                });
                
                function updateTestDisplay(testCode, componentName) {
                    currentTestCode = testCode;
                    currentFilePath = componentName + '.test.tsx';
                    
                    document.getElementById('testFileName').textContent = currentFilePath;
                    document.getElementById('testCode').innerHTML = \`<pre>\${escapeHtml(testCode)}</pre>\`;
                }
                
                function escapeHtml(text) {
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                }
                
                // Event listeners
                document.getElementById('saveBtn').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'saveTest',
                        testCode: currentTestCode,
                        filePath: currentFilePath
                    });
                });
                
                document.getElementById('copyBtn').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'copyTest',
                        testCode: currentTestCode
                    });
                });
                
                document.getElementById('regenerateBtn').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'regenerate',
                        style: currentStyle
                    });
                });
                
                // Style selector
                document.querySelectorAll('.style-option').forEach(option => {
                    option.addEventListener('click', () => {
                        document.querySelector('.style-option.active').classList.remove('active');
                        option.classList.add('active');
                        currentStyle = option.dataset.style;
                    });
                });
            </script>
        </body>
        </html>`;
  }

  private async saveTestToFile(testCode: string, filePath: string) {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      const testUri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
      await vscode.workspace.fs.writeFile(
        testUri,
        new TextEncoder().encode(testCode),
      );

      const document = await vscode.workspace.openTextDocument(testUri);
      await vscode.window.showTextDocument(document);

      vscode.window.showInformationMessage(`✅ Test saved to ${filePath}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save test: ${error}`);
    }
  }

  private async regenerateTest(style: string) {
    vscode.window.showInformationMessage(
      `🔄 Regenerating test with ${style} style...`,
    );
    // TODO: Trigger regeneration with new style
  }

  private dispose() {
    TestPreviewPanel.currentPanel = undefined;
    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
