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
    // 1. Command Palette: Old command
    let generateDisposable = vscode.commands.registerCommand('extension.generateReactTests', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No file open.');
            return;
        }
        const filePath = editor.document.fileName;
        const fileContent = editor.document.getText();
        try {
            vscode.window.showInformationMessage('Generating React tests with Ollama...');
            const testCode = await (0, llmClient_1.generateTestsWithOllama)(fileContent);
            const dirname = path.dirname(filePath);
            const basename = path.basename(filePath, '.tsx');
            const testFilePath = path.join(dirname, `${basename}.test.tsx`);
            await fs.writeFile(testFilePath, testCode, 'utf-8');
            vscode.window.showInformationMessage(`Test created: ${testFilePath}`);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to generate test: ${err.message}`);
        }
    });
    // 2. Webview Panel: Rich UI
    let panelDisposable = vscode.commands.registerCommand('extension.openTestGenPanel', async () => {
        const panel = vscode.window.createWebviewPanel('testGenPanel', 'React Test Generator', vscode.ViewColumn.One, { enableScripts: true });
        // Track generated test for save operation
        let lastGenerated = {};
        // Initial content
        panel.webview.html = (0, webviewContent_1.getWebviewContent)(panel.webview, context.extensionUri);
        // Listen for messages from UI
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'select') {
                // Load component source from file system
                try {
                    const fileUri = vscode.Uri.file(path.join(vscode.workspace.rootPath || '', message.file));
                    const componentSource = (await vscode.workspace.fs.readFile(fileUri)).toString();
                    panel.webview.postMessage({
                        type: 'status',
                        status: 'Component loaded. Ready to generate test.'
                    });
                    lastGenerated.file = message.file;
                    lastGenerated.testCode = undefined;
                }
                catch (err) {
                    panel.webview.postMessage({
                        type: 'status',
                        status: 'Failed to load component.'
                    });
                }
            }
            else if (message.type === 'generate') {
                // Find component, generate test
                try {
                    const componentPath = path.join(vscode.workspace.rootPath || '', message.file);
                    const componentContent = await fs.readFile(componentPath, 'utf-8');
                    const testCode = await (0, llmClient_1.generateTestsWithOllama)(componentContent);
                    panel.webview.postMessage({
                        type: 'preview',
                        testContent: testCode,
                        status: 'Test generated!'
                    });
                    lastGenerated.file = message.file;
                    lastGenerated.testCode = testCode;
                }
                catch (err) {
                    panel.webview.postMessage({
                        type: 'status',
                        status: 'Failed to generate test.'
                    });
                }
            }
            else if (message.type === 'save') {
                // Save generated test
                if (lastGenerated.file && lastGenerated.testCode) {
                    try {
                        const dirname = path.dirname(lastGenerated.file);
                        const basename = path.basename(lastGenerated.file, '.tsx');
                        const testFilePath = path.join(vscode.workspace.rootPath || '', dirname, `${basename}.test.tsx`);
                        await fs.writeFile(testFilePath, lastGenerated.testCode, 'utf-8');
                        panel.webview.postMessage({
                            type: 'status',
                            status: `Test saved: ${testFilePath}`
                        });
                    }
                    catch (err) {
                        panel.webview.postMessage({
                            type: 'status',
                            status: 'Failed to save test.'
                        });
                    }
                }
                else {
                    panel.webview.postMessage({
                        type: 'status',
                        status: 'Nothing to save.'
                    });
                }
            }
        });
    });
    context.subscriptions.push(generateDisposable, panelDisposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map