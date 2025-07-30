export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  // Optionally bundle and serve React UI (for this, just use static HTML/JS for example)
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>React Test Generator</title>
      <style>
        body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 0; margin: 0; }
        .container { display: flex; height: 100vh; }
        .sidebar { width: 220px; background: var(--vscode-sideBar-background); border-right: 1px solid var(--vscode-editorWidget-border); padding: 1em; }
        .content { flex: 1; padding: 2em; }
        textarea { width: 100%; height: 70vh; }
        button { margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="sidebar">
          <h3>Components</h3>
          <ul id="component-list">
            <li><button onclick="selectComponent('MyComponent.tsx')">MyComponent.tsx</button></li>
            <!-- List would be dynamically generated -->
          </ul>
        </div>
        <div class="content">
          <h2 id="selected-component">Select a component</h2>
          <textarea id="test-preview" readonly placeholder="Generated test will appear here..."></textarea>
          <div>
            <button id="generate-btn">Generate Test</button>
            <button id="save-btn" disabled>Save Test</button>
          </div>
          <p id="status"></p>
        </div>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        let selectedComponent = null;

        document.getElementById('generate-btn').onclick = function() {
          if (!selectedComponent) {
            document.getElementById('status').textContent = 'Please select a component.';
            return;
          }
          document.getElementById('status').textContent = 'Generating...';
          vscode.postMessage({ type: 'generate', file: selectedComponent });
        };

        document.getElementById('save-btn').onclick = function() {
          vscode.postMessage({ type: 'save' });
        };

        function selectComponent(file) {
          selectedComponent = file;
          document.getElementById('selected-component').textContent = file;
          document.getElementById('test-preview').value = '';
          document.getElementById('save-btn').disabled = true;
          document.getElementById('status').textContent = '';
          vscode.postMessage({ type: 'select', file });
        }
        window.addEventListener('message', event => {
          const { type, testContent, status } = event.data;
          if (type === 'preview') {
            document.getElementById('test-preview').value = testContent;
            document.getElementById('save-btn').disabled = false;
            document.getElementById('status').textContent = status || '';
          }
          if (type === 'status') {
            document.getElementById('status').textContent = status;
          }
        });
      </script>
    </body>
    </html>
  `
}
