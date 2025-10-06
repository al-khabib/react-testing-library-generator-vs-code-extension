import * as vscode from "vscode";
import { BackendClient, ChatRequest } from "../api/client";
import { ChatMessagePayload } from "../api/schema";
import { TestPreviewManager } from "../preview/TestPreviewManager";
import { getSettings, runtimePresetFromSettings } from "../config";
import { logger } from "../logger";
import { getImports, getWorkspaceRelativePath } from "../utils/document";

interface ChatViewState {
  stylePreset: "strict-a11y" | "balanced" | "legacy";
  strictA11y: boolean;
  useUserEvent: boolean;
  timeoutMs: number;
  applyToWorkspace: boolean;
  targetFile?: string;
  messages: ChatMessagePayload[];
  busy: boolean;
}

export class TestAssistantView implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private state: ChatViewState;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: BackendClient,
    private readonly preview: TestPreviewManager,
  ) {
    const settings = getSettings();
    const preset = runtimePresetFromSettings(settings);
    this.state = {
      stylePreset: preset.preset,
      strictA11y: preset.strictA11y,
      useUserEvent: preset.useUserEvent,
      timeoutMs: settings.timeoutMs,
      applyToWorkspace: false,
      targetFile: undefined,
      messages: [],
      busy: false,
    };
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      retainContextWhenHidden: true,
    };
    webviewView.webview.html = this.renderHtml();
    webviewView.webview.onDidReceiveMessage(async (message: any) => {
      switch (message?.type) {
        case "ready":
          this.pushState();
          break;
        case "updateToolbar":
          this.updateToolbar(message);
          break;
        case "send":
          await this.handleSend(String(message.prompt || ""));
          break;
        case "insert":
          await this.insertIntoEditor(String(message.payload || ""));
          break;
        case "preview":
          await this.previewFromChat(String(message.payload || ""));
          break;
        case "create":
          await this.previewFromChat(String(message.payload || ""), true);
          break;
        case "useActive":
          this.bindActiveEditor();
          break;
        default:
          break;
      }
    });
  }

  refreshFromSettings() {
    const settings = getSettings();
    const preset = runtimePresetFromSettings(settings);
    this.state.stylePreset = preset.preset;
    this.state.strictA11y = preset.strictA11y;
    this.state.useUserEvent = preset.useUserEvent;
    this.state.timeoutMs = settings.timeoutMs;
    this.pushState();
  }

  private async handleSend(prompt: string) {
    if (!prompt.trim()) return;
    const document = vscode.window.activeTextEditor?.document;
    const source = document?.getText();
    const filePath = document?.uri.fsPath;
    const imports = document ? getImports(document) : [];
    const workspaceRelative = document ? getWorkspaceRelativePath(document.uri) : undefined;

    const userMessage: ChatMessagePayload = { role: "user", content: prompt };
    this.state.messages = [...this.state.messages, userMessage];
    this.state.busy = true;
    this.pushState();

    const request: ChatRequest = {
      messages: this.state.messages,
      filePath,
      source,
      stylePreset: this.state.stylePreset,
      runtime: {
        strictA11y: this.state.strictA11y,
        useUserEvent: this.state.useUserEvent,
        timeoutMs: this.state.timeoutMs,
        applyToWorkspace: this.state.applyToWorkspace,
        targetFile: this.state.targetFile ?? workspaceRelative,
        imports,
      },
    };

    try {
      const response = await this.client.chat(request);
      this.state.messages = response.messages;
    } catch (error) {
      logger.error("Chat error", error);
      vscode.window.showErrorMessage(
        error instanceof Error ? error.message : "Chat request failed",
      );
    } finally {
      this.state.busy = false;
      this.pushState();
    }
  }

  private updateToolbar(message: any) {
    const timeoutInput = Number(message.timeoutMs);
    const timeoutMs = Number.isFinite(timeoutInput) && timeoutInput > 0 ? timeoutInput : this.state.timeoutMs;
    this.state = {
      ...this.state,
      stylePreset: message.stylePreset ?? this.state.stylePreset,
      strictA11y: !!message.strictA11y,
      useUserEvent: !!message.useUserEvent,
      timeoutMs,
      applyToWorkspace: !!message.applyToWorkspace,
      targetFile: message.targetFile || this.state.targetFile,
    };
    this.pushState();
  }

  private bindActiveEditor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor found.");
      return;
    }
    const rel = getWorkspaceRelativePath(editor.document.uri);
    this.state.targetFile = rel ?? editor.document.uri.fsPath;
    this.pushState();
  }

  private async previewFromChat(content: string, createFile = false) {
    const editor = vscode.window.activeTextEditor;
    const origin = editor?.document.uri;
    await this.preview.openPreviewFromContent(content, origin);
    if (createFile) {
      await this.preview.createFileFromPreview();
    }
  }

  private async insertIntoEditor(content: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("Open an editor to insert content.");
      return;
    }
    await editor.edit((builder: any) => {
      const selection = editor.selection;
      if (selection.isEmpty) {
        builder.insert(selection.active, `${content}\n`);
      } else {
        builder.replace(selection, content);
      }
    });
  }

  private pushState() {
    if (!this.view) return;
    this.view.webview.postMessage({ type: "state", state: this.state });
  }

  private renderHtml(): string {
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    :root { color-scheme: var(--vscode-color-scheme); }
    body {
      font-family: var(--vscode-font-family);
      margin: 0;
      padding: 0;
      background: var(--vscode-sideBar-background);
      color: var(--vscode-foreground);
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    header {
      padding: 12px;
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
      display: grid;
      gap: 8px;
    }
    header .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    header label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.85rem;
    }
    main {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      border-radius: 6px;
      padding: 12px;
    }
    .message.user {
      background: rgba(0,0,0,0.05);
      align-self: flex-end;
    }
    .message.assistant {
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
    }
    .actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .actions button {
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .input-area {
      padding: 12px;
      border-top: 1px solid var(--vscode-sideBarSectionHeader-border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    textarea {
      width: 100%;
      min-height: 80px;
      resize: vertical;
      border-radius: 4px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 8px;
      font-family: var(--vscode-editor-font-family);
    }
    button.send {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
    }
    .badge {
      background: var(--vscode-editorInfo-foreground);
      color: var(--vscode-sideBar-background);
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 0.75rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="row">
      <label>Style preset
        <select id="preset">
          <option value="strict-a11y">Strict a11y</option>
          <option value="balanced">Balanced</option>
          <option value="legacy">Legacy</option>
        </select>
      </label>
      <label><input type="checkbox" id="strict" /> Strict a11y</label>
      <label><input type="checkbox" id="userEvent" /> Use userEvent</label>
      <label><input type="checkbox" id="apply" /> Apply to workspace</label>
    </div>
    <div class="row">
      <label>Timeout (ms) <input id="timeout" type="number" min="1000" step="500" style="width:120px" /></label>
      <label>Target file <span id="target" class="badge"></span></label>
      <button id="useActive" type="button">Use active editor</button>
    </div>
  </header>
  <main id="messages"></main>
  <footer class="input-area">
    <textarea id="prompt" placeholder="Ask the Test Assistant..."></textarea>
    <button class="send" id="send">Send</button>
  </footer>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state;
    const $ = (sel) => document.querySelector(sel);

    function escapeHtml(value) {
      const str = String(value);
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function render() {
      if (!state) return;
      $('#preset').value = state.stylePreset;
      $('#strict').checked = !!state.strictA11y;
      $('#userEvent').checked = !!state.useUserEvent;
      $('#apply').checked = !!state.applyToWorkspace;
      $('#timeout').value = state.timeoutMs;
      $('#target').textContent = state.targetFile || 'active file';
      const container = $('#messages');
      container.innerHTML = state.messages.map((msg, index) => {
        const body = escapeHtml(msg.content).replace(/\n/g, '<br/>');
        let actions = '';
        if (msg.role === 'assistant') {
          actions = '<div class="actions">'
            + '<button data-action="insert" data-index="' + index + '">Insert</button>'
            + '<button data-action="preview" data-index="' + index + '">Open Preview</button>'
            + '<button data-action="create" data-index="' + index + '">Create File</button>'
            + '</div>';
        }
        return '<article class="message ' + msg.role + '">'
          + '<div>' + body + '</div>'
          + actions
          + '</article>';
      }).join('');
      $('#send').disabled = state.busy;
      $('#prompt').disabled = state.busy;
    }

    document.addEventListener('change', (event) => {
      if (!state) return;
      if (event.target.matches('#preset, #strict, #userEvent, #apply, #timeout')) {
        vscode.postMessage({
          type: 'updateToolbar',
          stylePreset: $('#preset').value,
          strictA11y: $('#strict').checked,
          useUserEvent: $('#userEvent').checked,
          applyToWorkspace: $('#apply').checked,
          timeoutMs: Number($('#timeout').value),
          targetFile: state.targetFile,
        });
      }
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.id === 'send') {
        vscode.postMessage({ type: 'send', prompt: $('#prompt').value });
        $('#prompt').value = '';
        return;
      }
      if (button.id === 'useActive') {
        vscode.postMessage({ type: 'useActive' });
        return;
      }
      if (button.dataset.action) {
        const message = state.messages[Number(button.dataset.index)]?.content || '';
        vscode.postMessage({ type: button.dataset.action, payload: message });
      }
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') {
        state = event.data.state;
        render();
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
