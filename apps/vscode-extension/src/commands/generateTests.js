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
exports.generateTests = generateTests;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
async function generateTests(uri) {
    try {
        // Get current file or selected file
        const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
        if (!targetUri) {
            vscode.window.showErrorMessage("No file selected");
            return;
        }
        // Validate file type
        const ext = path.extname(targetUri.fsPath);
        if (![".js", ".jsx", ".ts", ".tsx"].includes(ext)) {
            vscode.window.showErrorMessage("Please select a React component file (.js, .jsx, .ts, .tsx)");
            return;
        }
        // Skip test files
        if (targetUri.fsPath.includes(".test.") ||
            targetUri.fsPath.includes(".spec.")) {
            vscode.window.showErrorMessage("Cannot generate tests for test files");
            return;
        }
        // Read component code
        const document = await vscode.workspace.openTextDocument(targetUri);
        const componentCode = document.getText();
        if (!componentCode.trim()) {
            vscode.window.showErrorMessage("File is empty");
            return;
        }
        // Get component name for display
        const componentName = path.basename(targetUri.fsPath, ext);
        // Show progress with more steps
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `RTL Test Generator`,
            cancellable: true,
        }, async (progress, token) => {
            progress.report({
                increment: 0,
                message: `Analyzing ${componentName}...`,
            });
            if (token.isCancellationRequested)
                return;
            // Call backend API
            progress.report({
                increment: 25,
                message: "Connecting to AI service...",
            });
            const apiResponse = await callBackendAPI(componentCode, targetUri.fsPath, "comprehensive");
            if (token.isCancellationRequested)
                return;
            progress.report({ increment: 75, message: "Processing test code..." });
            if (!apiResponse.success) {
                throw new Error(apiResponse.error || "Unknown error from backend");
            }
            progress.report({ increment: 90, message: "Creating test file..." });
            // Create and open test file
            const testFilePath = getTestFilePath(targetUri.fsPath);
            await createTestFile(testFilePath, apiResponse.testCode);
            progress.report({ increment: 100, message: "Done!" });
            // Show success message with options
            const action = await vscode.window.showInformationMessage(`✅ RTL tests generated for ${componentName}!`, "Open Test File", "Generate Different Style", "Copy to Clipboard");
            if (action === "Open Test File") {
                const testUri = vscode.Uri.file(testFilePath);
                const testDocument = await vscode.workspace.openTextDocument(testUri);
                await vscode.window.showTextDocument(testDocument, vscode.ViewColumn.Beside);
            }
            else if (action === "Generate Different Style") {
                await showStylePicker(componentCode, targetUri.fsPath, componentName);
            }
            else if (action === "Copy to Clipboard") {
                await vscode.env.clipboard.writeText(apiResponse.testCode);
                vscode.window.showInformationMessage("Test code copied to clipboard!");
            }
        });
    }
    catch (error) {
        console.error("Error generating tests:", error);
        vscode.window.showErrorMessage(`Failed to generate tests: ${error}`);
    }
}
async function callBackendAPI(componentCode, filePath, testStyle) {
    const config = vscode.workspace.getConfiguration("rtlTestGeneratorAI");
    const apiUrl = config.get("apiUrl", "http://localhost:7070");
    const response = await fetch(`${apiUrl}/api/generate-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            componentCode,
            filePath,
            testStyle,
        }),
    });
    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    return await response.json();
}
async function createTestFile(testFilePath, testCode) {
    const testUri = vscode.Uri.file(testFilePath);
    // Check if file already exists
    try {
        await vscode.workspace.fs.stat(testUri);
        const overwrite = await vscode.window.showWarningMessage("Test file already exists. Do you want to overwrite it?", "Overwrite", "Cancel");
        if (overwrite !== "Overwrite") {
            return;
        }
    }
    catch {
        // File doesn't exist, which is fine
    }
    await vscode.workspace.fs.writeFile(testUri, new TextEncoder().encode(testCode));
}
async function showStylePicker(componentCode, filePath, componentName) {
    const style = await vscode.window.showQuickPick([
        {
            label: "⚡ Minimal",
            description: "Basic rendering and simple interaction tests",
            detail: "Fast generation, covers essential functionality",
            value: "minimal",
        },
        {
            label: "📋 Comprehensive",
            description: "Full test coverage with edge cases",
            detail: "Thorough testing, includes error handling",
            value: "comprehensive",
        },
        {
            label: "♿ Accessibility Focused",
            description: "Enhanced accessibility testing",
            detail: "ARIA labels, keyboard navigation, screen readers",
            value: "accessibility",
        },
    ], {
        placeHolder: "Choose test generation style",
        title: `Generate tests for ${componentName}`,
    });
    if (style) {
        // Regenerate with chosen style
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating ${style.label.replace(/[⚡📋♿]/g, "").trim()} tests...`,
        }, async (progress) => {
            const apiResponse = await callBackendAPI(componentCode, filePath, style.value);
            if (apiResponse.success) {
                const testFilePath = getTestFilePath(filePath);
                await createTestFile(testFilePath, apiResponse.testCode);
                vscode.window.showInformationMessage(`✅ ${style.label} tests generated!`);
            }
        });
    }
}
function getTestFilePath(componentPath) {
    const ext = path.extname(componentPath);
    const baseName = path.basename(componentPath, ext);
    const dir = path.dirname(componentPath);
    return path.join(dir, `${baseName}.test${ext}`);
}
//# sourceMappingURL=generateTests.js.map