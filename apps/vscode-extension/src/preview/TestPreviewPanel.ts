import * as vscode from "vscode";
import { BackendDiagnostic } from "../api/schema";

export interface PreviewState {
  title: string;
  tests: string;
  suggestedPaths: string[];
  diagnostics: BackendDiagnostic[];
  warnings: string[];
  metadata: Record<string, unknown>;
  dryRun: boolean;
  promptOverride?: string;
  selectionLabel?: string;
}

export type PreviewAction =
  | { type: "insert" }
  | { type: "copy" }
  | { type: "createFile" }
  | { type: "regenerate" }
  | { type: "editPrompt" }
  | { type: "toggleDryRun"; value: boolean };

export class TestPreviewPanel {
  private static current: TestPreviewPanel | undefined;

  static createOrShow(
    context: vscode.ExtensionContext,
    initialState: PreviewState,
    listener: (action: PreviewAction) => void,
  ) {
    if (TestPreviewPanel.current) {
      TestPreviewPanel.current.update(initialState);
      TestPreviewPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      return TestPreviewPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      "rtlTestPreview",
      initialState.title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    const instance = new TestPreviewPanel(panel, listener);
    instance.update(initialState);
    TestPreviewPanel.current = instance;
    panel.onDidDispose(() => {
      TestPreviewPanel.current = undefined;
    });
    return instance;
  }

  constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly listener: (action: PreviewAction) => void,
  ) {
    this.panel.webview.onDidReceiveMessage((message: any) => {
      if (!message || typeof message.type !== "string") return;
      switch (message.type) {
        case "ready":
          if (this.state) this.postState();
          break;
        case "insert":
          this.listener({ type: "insert" });
          break;
        case "copy":
          this.listener({ type: "copy" });
          break;
        case "createFile":
          this.listener({ type: "createFile" });
          break;
        case "regenerate":
          this.listener({ type: "regenerate" });
          break;
        case "editPrompt":
          this.listener({ type: "editPrompt" });
          break;
        case "toggleDryRun":
          if (typeof message.value === "boolean") {
            this.listener({ type: "toggleDryRun", value: message.value });
          }
          break;
        default:
          break;
      }
    });
  }

  private state: PreviewState | undefined;

  update(state: PreviewState) {
    this.state = state;
    this.panel.title = state.title;
    this.panel.webview.html = this.composeHtml();
    this.postState();
  }

  private postState() {
    if (!this.state) return;
    this.panel.webview.postMessage({ type: "state", state: this.state });
  }

  private composeHtml() {
    const nonce = String(Date.now());
    const styles = `
      <style>
        :root {
          color-scheme: var(--vscode-color-scheme);
        }
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
          padding: 0;
          margin: 0;
        }
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        h1 {
          font-size: 1rem;
          margin: 0;
        }
        .actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .actions button {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
        }
        .actions button.secondary {
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }
        .actions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .body {
          padding: 16px;
          display: grid;
          gap: 16px;
        }
        .badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .badge {
          background: var(--vscode-editorWidget-background);
          color: var(--vscode-editorWidget-foreground);
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 0.75rem;
        }
        .diagnostics, .warnings {
          border: 1px solid var(--vscode-input-border);
          padding: 12px;
          border-radius: 6px;
        }
        .diagnostics h2, .warnings h2 {
          margin: 0 0 8px 0;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        pre {
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-input-border);
          border-radius: 6px;
          padding: 16px;
          overflow-x: auto;
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
          line-height: 1.5;
        }
        .meta {
          font-size: 0.85rem;
          color: var(--vscode-descriptionForeground);
        }
        label.toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
        }
      </style>
    `;
    const script = `
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let state;
        const $ = (selector) => document.querySelector(selector);
        function render() {
          if (!state) return;
          const createButton = $('[data-action="createFile"]');
          if (createButton) {
            createButton.disabled = state.dryRun;
            createButton.title = state.dryRun ? 'Disable Dry Run to write files' : 'Create test file';
          }
          const dryRunToggle = document.getElementById('dry-run-toggle');
          if (dryRunToggle) {
            dryRunToggle.checked = !!state.dryRun;
          }
          const codeEl = document.getElementById('test-code');
          if (codeEl) {
            codeEl.textContent = state.tests;
          }
          const warningsEl = document.getElementById('warnings');
          if (warningsEl) {
            warningsEl.innerHTML = state.warnings.map(item => '<li>' + escapeHtml(item) + '</li>').join('');
            warningsEl.parentElement.style.display = state.warnings.length ? 'block' : 'none';
          }
          const diagEl = document.getElementById('diagnostics');
          if (diagEl) {
            diagEl.innerHTML = state.diagnostics.map(item => '<li><strong>' + item.type.toUpperCase() + ':</strong> ' + escapeHtml(item.message) + '</li>').join('');
            diagEl.parentElement.style.display = state.diagnostics.length ? 'block' : 'none';
          }
          const suggestions = document.getElementById('suggestions');
          if (suggestions) {
            suggestions.innerHTML = state.suggestedPaths.map(item => '<li><code>' + escapeHtml(item) + '</code></li>').join('');
          }
          const selection = document.getElementById('selection-label');
          if (selection) {
            selection.textContent = state.selectionLabel || '';
            selection.style.display = state.selectionLabel ? 'block' : 'none';
          }
          const meta = document.getElementById('meta');
          if (meta) {
            meta.innerHTML = Object.entries(state.metadata || {})
              .map(([key, value]) => '<li><code>' + escapeHtml(key) + '</code>: ' + escapeHtml(formatMetaValue(value)) + '</li>')
              .join('');
          }
        }
        function escapeHtml(value) {
          const str = String(value);
          return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        }
        function formatMetaValue(value) {
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') {
            try {
              return JSON.stringify(value);
            } catch (error) {
              return String(value);
            }
          }
          return String(value);
        }
        window.addEventListener('message', (event) => {
          if (event.data?.type === 'state') {
            state = event.data.state;
            render();
          }
        });
        document.addEventListener('click', (event) => {
          const button = event.target.closest('button[data-action]');
          if (!button) return;
          const action = button.dataset.action;
          if (!action) return;
          vscode.postMessage({ type: action });
        });
        document.addEventListener('change', (event) => {
          if (event.target?.id === 'dry-run-toggle') {
            vscode.postMessage({ type: 'toggleDryRun', value: !!event.target.checked });
          }
        });
        vscode.postMessage({ type: 'ready' });
      </script>
    `;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head>
      <body>
        <header>
          <div>
            <h1>RTL Test Preview</h1>
            <div id="selection-label" class="meta"></div>
          </div>
          <div class="actions">
            <label class="toggle">
              <input id="dry-run-toggle" type="checkbox"/>
              Dry run
            </label>
            <button data-action="insert">Insert into Editor</button>
            <button data-action="copy" class="secondary">Copy</button>
            <button data-action="createFile">Create Test File</button>
            <button data-action="regenerate" class="secondary">Regenerate</button>
            <button data-action="editPrompt" class="secondary">Edit prompt & Regenerate</button>
          </div>
        </header>
        <div class="body">
          <section>
            <div class="meta">
              <strong>Suggested paths</strong>
              <ul id="suggestions"></ul>
            </div>
          </section>
          <section class="warnings" style="display:none">
            <h2>Warnings</h2>
            <ul id="warnings"></ul>
          </section>
          <section class="diagnostics" style="display:none">
            <h2>Diagnostics</h2>
            <ul id="diagnostics"></ul>
          </section>
          <section>
            <pre id="test-code"></pre>
          </section>
          <section class="meta">
            <strong>Metadata</strong>
            <ul id="meta"></ul>
          </section>
        </div>
        ${script}
      </body></html>`;
  }
}
