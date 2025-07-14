"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
// --- Extension Activation ---
function activate(ctx) {
    // Register the command for the context menu and command palette
    ctx.subscriptions.push(vscode.commands.registerCommand('rtl-test-generator.generateTest', () => openConfigWebview(ctx)));
    // Register the sidebar view provider (Activity Bar)
    ctx.subscriptions.push(vscode.window.registerWebviewViewProvider('rtlTestGeneratorView', // Must match the view ID in package.json
    new RtlTestSidebarProvider(ctx)));
}
// --- Webview Panel for "Generate RTL Test" Command ---
function openConfigWebview(ctx) {
    const panel = vscode.window.createWebviewPanel('rtlTestConfig', 'Configure RTL Test', vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: false
    });
    const nonce = getNonce();
    panel.webview.html = getWebviewHtml(panel.webview, ctx, nonce);
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'submit') {
            await generateAndInsertTest(message.payload);
            panel.dispose();
        }
        if (message.command === 'cancel') {
            panel.dispose();
        }
    });
}
// --- Helper: Nonce Generator for CSP ---
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
// --- Helper: Webview HTML Content ---
function getWebviewHtml(webview, ctx, nonce) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta http-equiv="Content-Security-Policy"
            content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';"/>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Configure RTL Test</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
          margin: 0;
          padding: 24px 20px 20px 20px;
        }
        h1 {
          font-size: 1.5em;
          margin-bottom: 0.5em;
          color: var(--vscode-titleBar-activeForeground);
        }
        label {
          display: block;
          margin-top: 1.2em;
          margin-bottom: 0.2em;
          font-weight: bold;
        }
        input, select, textarea {
          width: 100%;
          padding: 7px;
          margin-bottom: 0.7em;
          border: 1px solid var(--vscode-input-border);
          border-radius: 4px;
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          font-size: 1em;
          box-sizing: border-box;
        }
        textarea {
          resize: vertical;
          min-height: 60px;
          max-height: 200px;
        }
        .actions {
          margin-top: 2em;
          display: flex;
          justify-content: flex-end;
          gap: 1em;
        }
        button {
          padding: 8px 20px;
          font-size: 1em;
          border: none;
          border-radius: 4px;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          cursor: pointer;
          transition: background 0.2s;
        }
        button:hover {
          background: var(--vscode-button-hoverBackground);
        }
      </style>
    </head>
    <body>
      <h1>Configure RTL Test</h1>
      <form id="rtlTestForm">
        <label for="testFileName">Test File Name</label>
        <input id="testFileName" placeholder="MyComponent.test.tsx" required />

        <label for="componentName">Component Name</label>
        <input id="componentName" placeholder="MyComponent" required />

        <label for="mockStrategy">Mock Strategy</label>
        <select id="mockStrategy">
          <option value="jest.spyOn">jest.spyOn()</option>
          <option value="jest.mock">jest.mock()</option>
          <option value="msw">Mock Service Worker (msw)</option>
        </select>

        <label for="utils">Testing Utilities to Import</label>
        <input id="utils" placeholder="@testing-library/react, user-event" />

        <label for="customSetup">Custom Test Setup (optional)</label>
        <textarea id="customSetup" placeholder="Any setup code or comments..."></textarea>

        <div class="actions">
          <button type="button" id="cancel">Cancel</button>
          <button type="submit" id="submit">Generate</button>
        </div>
      </form>
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        document.getElementById('cancel').addEventListener('click', () => {
          vscode.postMessage({ command: 'cancel' });
        });

        document.getElementById('rtlTestForm').addEventListener('submit', (e) => {
          e.preventDefault();
          vscode.postMessage({
            command: 'submit',
            payload: {
              testFileName: document.getElementById('testFileName').value,
              componentName: document.getElementById('componentName').value,
              mockStrategy: document.getElementById('mockStrategy').value,
              utils: document.getElementById('utils').value,
              customSetup: document.getElementById('customSetup').value
            }
          });
        });
      </script>
    </body>
    </html>
  `;
}
// --- Helper: Generate and Insert Test File ---
async function generateAndInsertTest(payload) {
    const editor = vscode.window.activeTextEditor;
    let dirUri;
    if (editor) {
        dirUri = vscode.Uri.joinPath(editor.document.uri, '..');
    }
    else if (vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0) {
        dirUri = vscode.workspace.workspaceFolders[0].uri;
    }
    else {
        vscode.window.showErrorMessage('No active editor or workspace folder found.');
        return;
    }
    const testFileName = payload.testFileName || 'Generated.test.tsx';
    const testFileUri = vscode.Uri.joinPath(dirUri, testFileName);
    // Replace this stub with a backend call if needed
    const testCode = `// Test for ${payload.componentName}
import { render } from '@testing-library/react';
import ${payload.componentName} from './${payload.componentName}';

describe('${payload.componentName}', () => {
  it('renders without crashing', () => {
    render(<${payload.componentName} />);
  });
});
`;
    try {
        let fileExists = false;
        try {
            await vscode.workspace.fs.stat(testFileUri);
            fileExists = true;
        }
        catch { }
        if (fileExists) {
            const overwrite = await vscode.window.showWarningMessage(`File ${testFileName} already exists. Overwrite?`, { modal: true }, 'Yes', 'No');
            if (overwrite !== 'Yes')
                return;
        }
        await vscode.workspace.fs.writeFile(testFileUri, Buffer.from(testCode, 'utf8'));
        const doc = await vscode.workspace.openTextDocument(testFileUri);
        await vscode.window.showTextDocument(doc, { preview: false });
        vscode.window.showInformationMessage(`Test file "${testFileName}" created!`);
    }
    catch (err) {
        vscode.window.showErrorMessage('Failed to create test file: ' + err.message);
    }
}
// --- Sidebar Provider for Activity Bar View ---
class RtlTestSidebarProvider {
    context;
    constructor(context) {
        this.context = context;
    }
    resolveWebviewView(webviewView) {
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
          h2 { margin-top: 0; }
          button {
            margin-top: 1em;
            padding: 8px 20px;
            font-size: 1em;
            border: none;
            border-radius: 4px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            transition: background 0.2s;
          }
          button:hover {
            background: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
        <h2>RTL Test Generator</h2>
        <p>Right-click a .ts or .tsx file and choose "Generate RTL Test" to begin.</p>
        <button onclick="vscode.postMessage({ command: 'openConfig' })">Open Test Configurator</button>
        <script>
          const vscode = acquireVsCodeApi();
          document.querySelector('button').addEventListener('click', () => {
            vscode.postMessage({ command: 'openConfig' });
          });
        </script>
      </body>
      </html>
    `;
        // Listen for messages from the sidebar webview (optional: open panel on button click)
        webviewView.webview.onDidReceiveMessage((message) => {
            if (message.command === 'openConfig') {
                openConfigWebview(this.context);
            }
        });
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map