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
    // Helper: open a Webview with preloaded test content & file path
    async function openTestGenWebview(documentUri, initialTestCode) {
        const panel = vscode.window.createWebviewPanel('testGenWebview', `Generate Test: ${path.basename(documentUri.fsPath)}`, vscode.ViewColumn.One, { enableScripts: true });
        // Initialize the last file and test code stored in memory for saving
        let currentTestCode = initialTestCode;
        let currentFileUri = documentUri;
        panel.webview.html = (0, webviewContent_1.getWebviewContent)(panel.webview, context.extensionUri, initialTestCode);
        // Receive messages from the Webview UI
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'updateTestCode') {
                currentTestCode = message.testCode;
            }
            else if (message.type === 'generateFile') {
                // Get user input for test file name
                const defaultTestFileName = `${path.basename(currentFileUri.fsPath, '.tsx')}.test.tsx`;
                const newFileName = await vscode.window.showInputBox({
                    prompt: 'Enter test file name',
                    value: defaultTestFileName,
                    validateInput: (value) => {
                        if (!value || !value.endsWith('.tsx')) {
                            return "File name must end with '.tsx'";
                        }
                        return null;
                    }
                });
                if (!newFileName) {
                    vscode.window.showWarningMessage('File generation cancelled');
                    return;
                }
                // Construct full path of test file
                const testFileUri = vscode.Uri.joinPath(vscode.Uri.file(path.dirname(currentFileUri.fsPath)), newFileName);
                // Write the edited test code to disk
                try {
                    await fs.writeFile(testFileUri.fsPath, currentTestCode, 'utf-8');
                    vscode.window.showInformationMessage(`Test file created: ${testFileUri.fsPath}`);
                    panel.dispose();
                }
                catch (error) {
                    vscode.window.showErrorMessage(`Failed to write test file: ${error.message}`);
                }
            }
        });
    }
    // Modified command handler for 'extension.generateReactTests'
    let disposable = vscode.commands.registerCommand('extension.generateReactTests', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }
        if (editor.document.languageId !== 'typescriptreact') {
            vscode.window.showErrorMessage('Please open a TypeScript React (.tsx) file');
            return;
        }
        const fileUri = editor.document.uri;
        const fileContent = editor.document.getText();
        try {
            vscode.window.showInformationMessage('Generating React tests via Ollama...');
            const testCode = await (0, llmClient_1.generateTestsWithOllama)(fileContent);
            // Clean testCode here if needed (strip markdown fences, etc.)
            openTestGenWebview(fileUri, testCode);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to generate test: ${err.message}`);
        }
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map