import * as vscode from "vscode";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BackendClient, BackendError, GenerateRequest } from "../api/client";
import { GenerateResponse } from "../api/schema";
import { TestPreviewPanel, PreviewState, PreviewAction } from "./TestPreviewPanel";
import { getSettings } from "../config";
import { logger } from "../logger";

interface PreviewSession {
  uri: vscode.Uri;
  request: GenerateRequest;
  response: GenerateResponse;
  suggestedPaths: string[];
  selectionLabel?: string;
}

const DRY_RUN_KEY = "rtlGen.dryRunOverride";

export class TestPreviewManager {
  private panel: TestPreviewPanel | undefined;
  private session: PreviewSession | undefined;
  private dryRun: boolean;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: BackendClient,
  ) {
    const settings = getSettings();
    this.dryRun = this.context.globalState.get<boolean>(DRY_RUN_KEY, settings.dryRun);
  }

  getDryRun() {
    return this.dryRun;
  }

  async setDryRun(next: boolean) {
    this.dryRun = next;
    await this.context.globalState.update(DRY_RUN_KEY, next);
    this.pushState();
    vscode.window.showInformationMessage(
      next ? "RTL Dry Run enabled. Files will not be written." : "RTL Dry Run disabled. File writes enabled.",
    );
  }

  async previewComponent(uri: vscode.Uri, source: string, imports: string[]) {
    const request: GenerateRequest = {
      filePath: uri.fsPath,
      source,
      imports,
      metadata: {
        kind: "file",
        relativePath: getRelative(uri),
      },
    };
    await this.runGeneration(uri, request);
  }

  async previewSelection(
    uri: vscode.Uri,
    source: string,
    selection: vscode.Selection,
    selectionText: string,
    imports: string[],
  ) {
    const request: GenerateRequest = {
      filePath: uri.fsPath,
      source,
      selection: {
        text: selectionText,
        start: { line: selection.start.line, character: selection.start.character },
        end: { line: selection.end.line, character: selection.end.character },
      },
      imports,
      metadata: {
        kind: "selection",
        relativePath: getRelative(uri),
      },
    };
    await this.runGeneration(uri, request, selection);
  }

  async regenerate(promptOverride?: string) {
    if (!this.session) {
      vscode.window.showWarningMessage("No previous generation to regenerate.");
      return;
    }
    const request = { ...this.session.request, promptOverride: promptOverride || this.session.request.promptOverride };
    await this.runGeneration(this.session.uri, request);
  }

  async applyEditedPrompt() {
    if (!this.session) return;
    const lastPrompt = this.session.request.promptOverride ?? "";
    const input = await vscode.window.showInputBox({
      prompt: "Custom prompt additions",
      placeHolder: "Add specific instructions for the generator...",
      value: lastPrompt,
      validateInput: (value: string) => (value.length > 5000 ? "Prompt too long" : undefined),
    });
    if (typeof input === "undefined") return;
    await this.runGeneration(this.session.uri, { ...this.session.request, promptOverride: input || undefined });
  }

  async insertIntoEditor() {
    if (!this.session) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("Open an editor to insert the generated test.");
      return;
    }
    await editor.edit((builder: any) => {
      const target = editor.selection.isEmpty ? editor.selection.start : editor.selection;
      if (target instanceof vscode.Position) {
        builder.insert(target, this.session!.response.tests + "\n");
      } else {
        builder.replace(target, this.session!.response.tests);
      }
    });
  }

  async copyToClipboard() {
    if (!this.session) return;
    await vscode.env.clipboard.writeText(this.session.response.tests);
    vscode.window.showInformationMessage("Copied generated test to clipboard.");
  }

  async openPreviewFromContent(tests: string, origin?: vscode.Uri) {
    const fallbackFolder =
      vscode.workspace.workspaceFolders?.[0]?.uri ??
      vscode.Uri.file(join(tmpdir(), "rtlgen"));
    const targetUri =
      origin ||
      this.session?.uri ||
      vscode.window.activeTextEditor?.document.uri ||
      vscode.Uri.joinPath(fallbackFolder, "__generated__/Component.tsx");
    const settings = getSettings();
    const response: GenerateResponse = {
      tests,
      metadata: {
        warnings: [],
        diagnostics: [],
        model: "chat",
      },
    };
    const suggestedPaths = suggestPaths(targetUri.fsPath, settings.defaultTestDir);
    this.session = {
      uri: targetUri,
      request: { filePath: targetUri.fsPath, source: "" },
      response,
      suggestedPaths,
    };
    this.openPanel();
  }

  async createFileFromPreview() {
    if (!this.session) return;
    if (this.dryRun) {
      vscode.window.showWarningMessage("Dry Run enabled. Disable to create files.");
      return;
    }
    const suggestion = this.session.suggestedPaths[0];
    const defaultUri = suggestion
      ? vscode.Uri.file(suggestion)
      : vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0].uri ?? vscode.Uri.file("."), "__tests__/Component.test.tsx");
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { TypeScript: ["tsx", "ts"] },
      title: "Save generated RTL test",
      saveLabel: "Create",
    });
    if (!saveUri) return;

    let exists = false;
    try {
      await vscode.workspace.fs.stat(saveUri);
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) {
      const overwrite = await vscode.window.showWarningMessage(
        `${saveUri.fsPath} already exists. Overwrite?`,
        "Overwrite",
        "Cancel",
      );
      if (overwrite !== "Overwrite") return;
    }

    const encoder = new TextEncoder();
    const content = encoder.encode(this.session.response.tests);
    await vscode.workspace.fs.writeFile(saveUri, content);
    vscode.window.showInformationMessage(`Saved generated test to ${saveUri.fsPath}`);
    await vscode.window.showTextDocument(saveUri, { preview: false });
  }

  handleSettingsChanged() {
    const settings = getSettings();
    if (!this.context.globalState.get(DRY_RUN_KEY)) {
      this.dryRun = settings.dryRun;
    }
    this.pushState();
  }

  private async runGeneration(
    uri: vscode.Uri,
    request: GenerateRequest,
    selection?: vscode.Selection,
  ) {
    const settings = getSettings();
    const suggestions = suggestPaths(uri.fsPath, settings.defaultTestDir);
    const label = selection ? describeSelection(selection) : undefined;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Generating RTL tests",
        cancellable: false,
      },
      async () => {
        try {
          const response = request.selection
            ? await this.client.generateSelection(request)
            : await this.client.generate(request);
          const merged = mergeSuggestedPaths(suggestions, response.metadata);
          this.session = { uri, request, response, suggestedPaths: merged, selectionLabel: label };
          this.openPanel();
        } catch (error) {
          if (error instanceof BackendError) {
            logger.warn("Generation failed", { status: error.status, message: error.message });
            vscode.window.showErrorMessage(`Generation failed: ${error.message}`);
          } else if (error instanceof Error) {
            logger.error("Generation crashed", error);
            vscode.window.showErrorMessage(`Generation failed: ${error.message}`);
          } else {
            vscode.window.showErrorMessage("Unknown error during generation");
          }
        }
      },
    );
  }

  private openPanel() {
    if (!this.session) return;
    const { response, suggestedPaths, selectionLabel } = this.session;
    const state: PreviewState = {
      title: "RTL Test Preview",
      tests: response.tests,
      suggestedPaths,
      diagnostics: response.metadata.diagnostics ?? [],
      warnings: response.metadata.warnings ?? [],
      metadata: {
        model: response.metadata.model ?? "unknown",
        promptTokens: response.metadata.promptTokens ?? "?",
        completionTokens: response.metadata.completionTokens ?? "?",
      },
      dryRun: this.dryRun,
      promptOverride: this.session.request.promptOverride,
      selectionLabel,
    };
    this.panel = TestPreviewPanel.createOrShow(this.context, state, (action) => this.handlePanelAction(action));
  }

  private pushState() {
    if (!this.session || !this.panel) return;
    const state: PreviewState = {
      title: "RTL Test Preview",
      tests: this.session.response.tests,
      suggestedPaths: this.session.suggestedPaths,
      diagnostics: this.session.response.metadata.diagnostics ?? [],
      warnings: this.session.response.metadata.warnings ?? [],
      metadata: {
        model: this.session.response.metadata.model ?? "unknown",
        promptTokens: this.session.response.metadata.promptTokens ?? "?",
        completionTokens: this.session.response.metadata.completionTokens ?? "?",
      },
      dryRun: this.dryRun,
      promptOverride: this.session.request.promptOverride,
      selectionLabel: this.session.selectionLabel,
    };
    this.panel.update(state);
  }

  private async handlePanelAction(action: PreviewAction) {
    switch (action.type) {
      case "insert":
        await this.insertIntoEditor();
        break;
      case "copy":
        await this.copyToClipboard();
        break;
      case "createFile":
        await this.createFileFromPreview();
        break;
      case "regenerate":
        await this.regenerate();
        break;
      case "editPrompt":
        await this.applyEditedPrompt();
        break;
      case "toggleDryRun":
        await this.setDryRun(action.value);
        break;
      default:
        break;
    }
  }
}

function suggestPaths(componentFsPath: string, defaultTestDir: string): string[] {
  const suggestions: string[] = [];
  const normalized = componentFsPath.replace(/\\/g, "/");
  const baseNameMatch = normalized.match(/([^/]+)\.(tsx|ts|jsx|js)$/i);
  const baseName = baseNameMatch ? baseNameMatch[1] : "Component";
  const dir = normalized.substring(0, normalized.lastIndexOf("/"));
  suggestions.push(`${dir}/${baseName}.test.tsx`);
  suggestions.push(`${dir}/${defaultTestDir}/${baseName}.test.tsx`);
  const srcIndex = normalized.indexOf("/src/");
  if (srcIndex !== -1) {
    const srcRoot = normalized.substring(0, srcIndex + 5);
    suggestions.push(`${srcRoot}__tests__/${baseName}.test.tsx`);
  }
  return Array.from(new Set(suggestions));
}

function mergeSuggestedPaths(
  baseline: string[],
  metadata: GenerateResponse["metadata"],
): string[] {
  const combined = [...baseline];
  const candidate = metadata && (metadata as any).suggestedPath;
  if (typeof candidate === "string") combined.unshift(candidate);
  return Array.from(new Set(combined));
}

function describeSelection(selection: vscode.Selection): string {
  const start = selection.start.line + 1;
  const end = selection.end.line + 1;
  return `Selection lines ${start}-${end}`;
}

function getRelative(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return uri.fsPath;
  return uri.fsPath.substring(folder.uri.fsPath.length + 1).replace(/\\/g, "/");
}
