"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebviewContent = getWebviewContent;
function getWebviewContent(webview, extensionUri, initialTestCode) {
    // Escape HTML entities for safe insertion
    const escapedCode = initialTestCode
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>React Test Generator</title>
    <style>
      body {
        font-family: var(--vscode-editor-font-family);
        background-color: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        margin: 0;
        padding: 1em;
      }
      textarea {
        width: 100%;
        height: 70vh;
        font-family: monospace;
        font-size: 14px;
        white-space: pre;
        resize: vertical;
        padding: 1em;
        box-sizing: border-box;
      }
      button {
        margin-top: 1em;
        padding: 6px 12px;
        font-size: 14px;
      }
      #status {
        margin-top: 0.5em;
        font-style: italic;
        color: var(--vscode-editor-foreground);
      }
    </style>
  </head>
  <body>
    <h2>Generated Test Code Preview</h2>
    <textarea id="testCode" spellcheck="false">${escapedCode}</textarea>
    <br/>
    <button id="saveBtn" disabled>Generate File</button>
    <p id="status">Waiting for generation to start...</p>

    <script>
      const vscode = acquireVsCodeApi()
      const textarea = document.getElementById('testCode')
      const saveBtn = document.getElementById('saveBtn')
      const status = document.getElementById('status')

      // Flag to check if streaming ended
      let streamingEnded = false

      // Append streamed content
      window.addEventListener('message', event => {
        const message = event.data
        switch(message.type) {
          case 'stream':
            textarea.value += message.content
            textarea.scrollTop = textarea.scrollHeight
            status.textContent = 'Generating...'
            break
          case 'stream-end':
            streamingEnded = true
            status.textContent = 'Generation complete. You can edit and save the test now.'
            saveBtn.disabled = false
            break
          case 'error':
            status.textContent = 'Error: ' + message.message
            saveBtn.disabled = true
            break
        }
      })

      // User edits code: notify extension
      textarea.addEventListener('input', () => {
        vscode.postMessage({ type: 'updateTestCode', testCode: textarea.value })
      })

      // Save button clicked
      saveBtn.addEventListener('click', () => {
        if (!streamingEnded) {
          status.textContent = 'Please wait until generation completes.'
          return
        }
        vscode.postMessage({ type: 'generateFile' })
      })
    </script>
  </body>
  </html>
  `;
}
//# sourceMappingURL=webviewContent.js.map