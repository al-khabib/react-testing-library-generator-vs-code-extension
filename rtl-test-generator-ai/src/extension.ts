import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

export function activate(context: vscode.ExtensionContext) {
  console.log('RTL Test Generator AI is now active!')

  let disposable = vscode.commands.registerCommand(
    'rtl-test-generator-ai.generateTest',
    async (uri: vscode.Uri) => {
      try {
        const filePath =
          uri?.fsPath || vscode.window.activeTextEditor?.document.fileName

        if (!filePath) {
          vscode.window.showErrorMessage('No file selected')
          return
        }

        if (!isReactComponentFile(filePath)) {
          vscode.window.showWarningMessage(
            'Please select a React component file (.tsx or .ts)'
          )
          return
        }

        const fileContent = fs.readFileSync(filePath, 'utf8')

        if (!isReactComponent(fileContent)) {
          vscode.window.showWarningMessage(
            'This file does not appear to contain a React component'
          )
          return
        }

        const componentName = extractComponentName(fileContent, filePath)

        // Show progress
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Generating tests for ${componentName}...`,
            cancellable: false
          },
          async (progress) => {
            progress.report({ increment: 0 })

            // Generate test content (placeholder for now)
            const testContent = generateBasicTestTemplate(
              componentName,
              fileContent
            )

            progress.report({ increment: 50 })

            // Create test file
            const testFilePath = createTestFile(filePath, testContent)

            progress.report({ increment: 100 })

            // Open the generated test file
            const document = await vscode.workspace.openTextDocument(
              testFilePath
            )
            await vscode.window.showTextDocument(document)

            vscode.window.showInformationMessage(
              `Generated test file: ${path.basename(testFilePath)}`
            )
          }
        )
      } catch (error) {
        console.error('Error:', error)
        vscode.window.showErrorMessage(`Error: ${error}`)
      }
    }
  )

  context.subscriptions.push(disposable)
}

function generateBasicTestTemplate(
  componentName: string,
  componentContent: string
): string {
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
`
}

function createTestFile(originalFilePath: string, testContent: string): string {
  const dir = path.dirname(originalFilePath)
  const baseName = path.basename(
    originalFilePath,
    path.extname(originalFilePath)
  )
  const testFileName = `${baseName}.test.tsx`
  const testFilePath = path.join(dir, testFileName)

  fs.writeFileSync(testFilePath, testContent, 'utf8')
  return testFilePath
}

// ... keep your existing helper functions
function isReactComponentFile(filePath: string): boolean {
  const ext = path.extname(filePath)
  return ext === '.tsx' || ext === '.ts'
}

function isReactComponent(content: string): boolean {
  const reactPatterns = [
    /import.*React/,
    /export.*function.*\(/,
    /export.*const.*=/,
    /export default function/,
    /export default.*=>/,
    /<[A-Z]/
  ]

  return reactPatterns.some((pattern) => pattern.test(content))
}

function extractComponentName(content: string, filePath: string): string {
  const exportPatterns = [
    /export\s+default\s+function\s+(\w+)/,
    /export\s+default\s+(\w+)/,
    /export\s+(?:const|function)\s+(\w+)/,
    /function\s+(\w+)\s*\(/
  ]

  for (const pattern of exportPatterns) {
    const match = content.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return path.basename(filePath, path.extname(filePath))
}

export function deactivate() {}
