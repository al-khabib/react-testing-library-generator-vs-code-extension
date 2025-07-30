import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import { generateTestsStreamWithOllama } from '../../llm-server/llmClient'
import { getWebviewContent } from '../../vscode-webview/webviewContent'

export function activate(context: vscode.ExtensionContext) {
  // Register command to generate tests with streaming UI
  const disposable = vscode.commands.registerCommand(
    'extension.generateReactTests',
    async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found')
        return
      }
      if (editor.document.languageId !== 'typescriptreact') {
        vscode.window.showErrorMessage(
          'Please open a TypeScript React (.tsx) file'
        )
        return
      }

      const componentUri = editor.document.uri
      const componentSource = editor.document.getText()

      // Create & show the webview immediately with empty initial content
      const panel = vscode.window.createWebviewPanel(
        'testGenWebview',
        `Generate Test: ${path.basename(componentUri.fsPath)}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
      )

      panel.webview.html = getWebviewContent(
        panel.webview,
        context.extensionUri,
        ''
      )

      // Store current edited test code
      let currentTestCode = ''

      // Handle messages from Webview (user edits / generate file)
      panel.webview.onDidReceiveMessage(async (message) => {
        if (message.type === 'updateTestCode') {
          currentTestCode = message.testCode
        } else if (message.type === 'generateFile') {
          const defaultName = `${path.basename(
            componentUri.fsPath,
            '.tsx'
          )}.test.tsx`

          const filename = await vscode.window.showInputBox({
            prompt: 'Test file name',
            value: defaultName,
            validateInput: (value) => {
              if (!value) return 'File name must not be empty'
              if (!value.endsWith('.tsx')) return 'File name must end with .tsx'
              return null
            }
          })

          if (!filename) {
            vscode.window.showWarningMessage('File generation cancelled')
            return
          }

          const testFileUri = vscode.Uri.joinPath(
            vscode.Uri.file(path.dirname(componentUri.fsPath)),
            filename
          )

          try {
            await fs.writeFile(testFileUri.fsPath, currentTestCode, 'utf-8')
            vscode.window.showInformationMessage(
              `Test file saved: ${testFileUri.fsPath}`
            )
            panel.dispose()
          } catch (err: any) {
            vscode.window.showErrorMessage(
              `Failed to save file: ${err.message}`
            )
          }
        }
      })

      // Stream generation, send partial chunks to Webview as received
      try {
        for await (const chunk of generateTestsStreamWithOllama(
          componentSource
        )) {
          panel.webview.postMessage({ type: 'stream', content: chunk })
          currentTestCode += chunk
        }
        panel.webview.postMessage({ type: 'stream-end', content: null })
      } catch (err: any) {
        panel.webview.postMessage({ type: 'error', message: err.message })
      }
    }
  )

  context.subscriptions.push(disposable)
}

export function deactivate() {}
