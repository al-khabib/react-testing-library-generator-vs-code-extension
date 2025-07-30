import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import { generateTestsWithOllama } from '../../llm-server/llmClient'
import { getWebviewContent } from '../../vscode-webview/webviewContent'

export function activate(context: vscode.ExtensionContext) {
  // Helper: open a Webview with preloaded test content & file path
  async function openTestGenWebview(
    documentUri: vscode.Uri,
    initialTestCode: string
  ) {
    const panel = vscode.window.createWebviewPanel(
      'testGenWebview',
      `Generate Test: ${path.basename(documentUri.fsPath)}`,
      vscode.ViewColumn.One,
      { enableScripts: true }
    )

    // Initialize the last file and test code stored in memory for saving
    let currentTestCode = initialTestCode
    let currentFileUri = documentUri

    panel.webview.html = getWebviewContent(
      panel.webview,
      context.extensionUri,
      initialTestCode
    )

    // Receive messages from the Webview UI
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'updateTestCode') {
        currentTestCode = message.testCode
      } else if (message.type === 'generateFile') {
        // Get user input for test file name
        const defaultTestFileName = `${path.basename(
          currentFileUri.fsPath,
          '.tsx'
        )}.test.tsx`
        const newFileName = await vscode.window.showInputBox({
          prompt: 'Enter test file name',
          value: defaultTestFileName,
          validateInput: (value) => {
            if (!value || !value.endsWith('.tsx')) {
              return "File name must end with '.tsx'"
            }
            return null
          }
        })

        if (!newFileName) {
          vscode.window.showWarningMessage('File generation cancelled')
          return
        }

        // Construct full path of test file
        const testFileUri = vscode.Uri.joinPath(
          vscode.Uri.file(path.dirname(currentFileUri.fsPath)),
          newFileName
        )

        // Write the edited test code to disk
        try {
          await fs.writeFile(testFileUri.fsPath, currentTestCode, 'utf-8')
          vscode.window.showInformationMessage(
            `Test file created: ${testFileUri.fsPath}`
          )
          panel.dispose()
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to write test file: ${error.message}`
          )
        }
      }
    })
  }

  // Modified command handler for 'extension.generateReactTests'
  let disposable = vscode.commands.registerCommand(
    'extension.generateReactTests',
    async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showErrorMessage('No active editor')
        return
      }

      if (editor.document.languageId !== 'typescriptreact') {
        vscode.window.showErrorMessage(
          'Please open a TypeScript React (.tsx) file'
        )
        return
      }

      const fileUri = editor.document.uri
      const fileContent = editor.document.getText()

      try {
        vscode.window.showInformationMessage(
          'Generating React tests via Ollama...'
        )
        const testCode = await generateTestsWithOllama(fileContent)

        // Clean testCode here if needed (strip markdown fences, etc.)

        openTestGenWebview(fileUri, testCode)
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to generate test: ${err.message}`
        )
      }
    }
  )

  context.subscriptions.push(disposable)
}

export function deactivate() {}
