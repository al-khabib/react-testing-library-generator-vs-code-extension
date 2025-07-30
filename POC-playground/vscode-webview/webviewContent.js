"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebviewContent = getWebviewContent;
function getWebviewContent(webview, extensionUri, testCode) {
    const escapedCode = testCode
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Test Generator</title>
    <style>
      body {
        font-family: var(--vscode-editor-font-family);
        background-color: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        margin: 0; padding: 1em;
      }
      textarea {
        width: 100%;
        height: 70vh;
        font-family: monospace;
        font-size: 14px;
        padding: 1em;
        box-sizing: border-box;
        white-space: pre;
      }
      button {
        margin-top: 1em;
        padding: 0.5em 1em;
        font-size: 14px;
      }
      #status {
        margin-top: 0.5em;
        font-style: italic;
      }
    </style>
  </head>
  <body>
    <h2>Review and edit test code</h2>
    <textarea id="testCode">${escapedCode}</textarea>
    <br/>
    <button id="generateFileBtn">Generate File</button>
    <p id="status"></p>

    <script>
      const vscode = acquireVsCodeApi();
      const textarea = document.getElementById('testCode');
      const status = document.getElementById('status');
      const generateBtn = document.getElementById('generateFileBtn');

      textarea.addEventListener('input', () => {
        vscode.postMessage({
          type: 'updateTestCode',
          testCode: textarea.value
        });
      });

      generateBtn.addEventListener('click', () => {
        vscode.postMessage({
          type: 'generateFile'
        });
      });

      window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'status') {
          status.textContent = message.status;
        }
      });
    </script>
  </body>
  </html>`;
}
//# sourceMappingURL=webviewContent.js.map