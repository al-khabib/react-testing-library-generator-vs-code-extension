import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import { generateTestsWithOllama } from '../../llm-server/llmClient'
import { getWebviewContent } from '../../vscode-webview/webviewContent'

export function activate(context: vscode.ExtensionContext) {
  // 1. Command Palette: Old command
  let generateDisposable = vscode.commands.registerCommand(
    'extension.generateReactTests',
    async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showErrorMessage('No file open.')
        return
      }
      const filePath = editor.document.fileName
      const fileContent = editor.document.getText()

      try {
        vscode.window.showInformationMessage(
          'Generating React tests with Ollama...'
        )
        const testCode = await generateTestsWithOllama(fileContent)
        const dirname = path.dirname(filePath)
        const basename = path.basename(filePath, '.tsx')
        const testFilePath = path.join(dirname, `${basename}.test.tsx`)
        await fs.writeFile(testFilePath, testCode, 'utf-8')
        vscode.window.showInformationMessage(`Test created: ${testFilePath}`)
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to generate test: ${(err as Error).message}`
        )
      }
    }
  )

  // 2. Webview Panel: Rich UI
  let panelDisposable = vscode.commands.registerCommand(
    'extension.openTestGenPanel',
    async () => {
      const panel = vscode.window.createWebviewPanel(
        'testGenPanel',
        'React Test Generator',
        vscode.ViewColumn.One,
        { enableScripts: true }
      )

      // Track generated test for save operation
      let lastGenerated: {
        file?: string
        testCode?: string
      } = {}

      // Initial content
      panel.webview.html = getWebviewContent(
        panel.webview,
        context.extensionUri
      )

      // Listen for messages from UI
      panel.webview.onDidReceiveMessage(async (message) => {
        if (message.type === 'select') {
          // Load component source from file system
          try {
            const fileUri = vscode.Uri.file(
              path.join(vscode.workspace.rootPath || '', message.file)
            )
            const componentSource = (
              await vscode.workspace.fs.readFile(fileUri)
            ).toString()
            panel.webview.postMessage({
              type: 'status',
              status: 'Component loaded. Ready to generate test.'
            })
            lastGenerated.file = message.file
            lastGenerated.testCode = undefined
          } catch (err) {
            panel.webview.postMessage({
              type: 'status',
              status: 'Failed to load component.'
            })
          }
        } else if (message.type === 'generate') {
          // Find component, generate test
          try {
            const componentPath = path.join(
              vscode.workspace.rootPath || '',
              message.file
            )
            const componentContent = await fs.readFile(componentPath, 'utf-8')
            const testCode = await generateTestsWithOllama(componentContent)
            panel.webview.postMessage({
              type: 'preview',
              testContent: testCode,
              status: 'Test generated!'
            })
            lastGenerated.file = message.file
            lastGenerated.testCode = testCode
          } catch (err) {
            panel.webview.postMessage({
              type: 'status',
              status: 'Failed to generate test.'
            })
          }
        } else if (message.type === 'save') {
          // Save generated test
          if (lastGenerated.file && lastGenerated.testCode) {
            try {
              const dirname = path.dirname(lastGenerated.file)
              const basename = path.basename(lastGenerated.file, '.tsx')
              const testFilePath = path.join(
                vscode.workspace.rootPath || '',
                dirname,
                `${basename}.test.tsx`
              )
              await fs.writeFile(testFilePath, lastGenerated.testCode, 'utf-8')
              panel.webview.postMessage({
                type: 'status',
                status: `Test saved: ${testFilePath}`
              })
            } catch (err) {
              panel.webview.postMessage({
                type: 'status',
                status: 'Failed to save test.'
              })
            }
          } else {
            panel.webview.postMessage({
              type: 'status',
              status: 'Nothing to save.'
            })
          }
        }
      })
    }
  )

  context.subscriptions.push(generateDisposable, panelDisposable)
}

export function deactivate() {}
