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
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const llmClient_1 = require("../../llm-server/llmClient");
const webviewContent_1 = require("../../vscode-webview/webviewContent");
function activate(context) {
    // Register command to generate tests with streaming UI
    const disposable = vscode.commands.registerCommand('extension.generateReactTests', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }
        if (editor.document.languageId !== 'typescriptreact') {
            vscode.window.showErrorMessage('Please open a TypeScript React (.tsx) file');
            return;
        }
        const componentUri = editor.document.uri;
        const componentSource = editor.document.getText();
        // Create & show the webview immediately with empty initial content
        const panel = vscode.window.createWebviewPanel('testGenWebview', `Generate Test: ${path.basename(componentUri.fsPath)}`, vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = (0, webviewContent_1.getWebviewContent)(panel.webview, context.extensionUri, '');
        // Store current edited test code
        let currentTestCode = '';
        // Handle messages from Webview (user edits / generate file)
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'updateTestCode') {
                currentTestCode = message.testCode;
            }
            else if (message.type === 'generateFile') {
                const defaultName = `${path.basename(componentUri.fsPath, '.tsx')}.test.tsx`;
                const filename = await vscode.window.showInputBox({
                    prompt: 'Test file name',
                    value: defaultName,
                    validateInput: (value) => {
                        if (!value)
                            return 'File name must not be empty';
                        if (!value.endsWith('.tsx'))
                            return 'File name must end with .tsx';
                        return null;
                    }
                });
                if (!filename) {
                    vscode.window.showWarningMessage('File generation cancelled');
                    return;
                }
                const testFileUri = vscode.Uri.joinPath(vscode.Uri.file(path.dirname(componentUri.fsPath)), filename);
                try {
                    await fs.writeFile(testFileUri.fsPath, currentTestCode, 'utf-8');
                    vscode.window.showInformationMessage(`Test file saved: ${testFileUri.fsPath}`);
                    panel.dispose();
                }
                catch (err) {
                    vscode.window.showErrorMessage(`Failed to save file: ${err.message}`);
                }
            }
        });
        // Stream generation, send partial chunks to Webview as received
        try {
            for await (const chunk of (0, llmClient_1.generateTestsStreamWithOllama)(componentSource)) {
                panel.webview.postMessage({ type: 'stream', content: chunk });
                currentTestCode += chunk;
            }
            panel.webview.postMessage({ type: 'stream-end', content: null });
        }
        catch (err) {
            panel.webview.postMessage({ type: 'error', message: err.message });
        }
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map