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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function activate(context) {
    console.log('RTL Test Generator AI is now active!');
    let disposable = vscode.commands.registerCommand('rtl-test-generator-ai.generateTest', async (uri) => {
        try {
            const filePath = uri?.fsPath || vscode.window.activeTextEditor?.document.fileName;
            if (!filePath) {
                vscode.window.showErrorMessage('No file selected');
                return;
            }
            if (!isReactComponentFile(filePath)) {
                vscode.window.showWarningMessage('Please select a React component file (.tsx or .ts)');
                return;
            }
            const fileContent = fs.readFileSync(filePath, 'utf8');
            if (!isReactComponent(fileContent)) {
                vscode.window.showWarningMessage('This file does not appear to contain a React component');
                return;
            }
            const componentName = extractComponentName(fileContent, filePath);
            // Show progress
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Generating tests for ${componentName}...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });
                // Generate test content (placeholder for now)
                const testContent = generateBasicTestTemplate(componentName, fileContent);
                progress.report({ increment: 50 });
                // Create test file
                const testFilePath = createTestFile(filePath, testContent);
                progress.report({ increment: 100 });
                // Open the generated test file
                const document = await vscode.workspace.openTextDocument(testFilePath);
                await vscode.window.showTextDocument(document);
                vscode.window.showInformationMessage(`Generated test file: ${path.basename(testFilePath)}`);
            });
        }
        catch (error) {
            console.error('Error:', error);
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });
    context.subscriptions.push(disposable);
}
function generateBasicTestTemplate(componentName, componentContent) {
    return `import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ${componentName} from './${componentName}';

describe('${componentName}', () => {
  test('renders without crashing', () => {
    render(<${componentName} />);
  });

  test('displays component content', () => {
    render(<${componentName} />);
    // Add your specific tests here
  });
});
`;
}
function createTestFile(originalFilePath, testContent) {
    const dir = path.dirname(originalFilePath);
    const baseName = path.basename(originalFilePath, path.extname(originalFilePath));
    const testFileName = `${baseName}.test.tsx`;
    const testFilePath = path.join(dir, testFileName);
    fs.writeFileSync(testFilePath, testContent, 'utf8');
    return testFilePath;
}
// ... keep your existing helper functions
function isReactComponentFile(filePath) {
    const ext = path.extname(filePath);
    return ext === '.tsx' || ext === '.ts';
}
function isReactComponent(content) {
    const reactPatterns = [
        /import.*React/,
        /export.*function.*\(/,
        /export.*const.*=/,
        /export default function/,
        /export default.*=>/,
        /<[A-Z]/
    ];
    return reactPatterns.some((pattern) => pattern.test(content));
}
function extractComponentName(content, filePath) {
    const exportPatterns = [
        /export\s+default\s+function\s+(\w+)/,
        /export\s+default\s+(\w+)/,
        /export\s+(?:const|function)\s+(\w+)/,
        /function\s+(\w+)\s*\(/
    ];
    for (const pattern of exportPatterns) {
        const match = content.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return path.basename(filePath, path.extname(filePath));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map