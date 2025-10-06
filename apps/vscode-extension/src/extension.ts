import * as vscode from "vscode";
import { BackendClient } from "./api/client";
import { TestPreviewManager } from "./preview/TestPreviewManager";
import { TestAssistantView } from "./panels/TestAssistantView";
import { getSettings, onSettingsChange } from "./config";
import { logger } from "./logger";
import { getImports, getSelection, getWorkspaceRelativePath } from "./utils/document";
import { AddRtlTestQuickFix } from "./quickFix";
import { registerTesting } from "./testing";
import { generateTests } from "./commands/generateTests";
import { ensureAuth, loginWithGitHub, logout } from "./auth";

let previewManager: TestPreviewManager;
let assistantView: TestAssistantView;
let backendClient: BackendClient;

export async function activate(context: vscode.ExtensionContext) {
  logger.info("Activating RTL Test Generator extension");

  backendClient = new BackendClient(context);
  previewManager = new TestPreviewManager(context, backendClient);
  assistantView = new TestAssistantView(context, backendClient, previewManager);

  logger.setLevel(getSettings().logLevel);

  const disposables: vscode.Disposable[] = [];

  const assistantProvider = vscode.window.registerWebviewViewProvider(
    "rtlTestAssistant.chat",
    assistantView,
  );
  disposables.push(assistantProvider);

  disposables.push(registerGenerateCommand(context));
  disposables.push(registerGenerateSelectionCommand());
  disposables.push(registerBatchCommand());
  disposables.push(registerAssistantCommand());
  disposables.push(registerDryRunToggle());
  disposables.push(registerReviewCommand(context));
  disposables.push(registerLegacyGenerate(context));
  disposables.push(registerAuthCommands(context));

  const quickFix = vscode.languages.registerCodeActionsProvider(
    { language: "typescriptreact", scheme: "file" },
    new AddRtlTestQuickFix(),
    { providedCodeActionKinds: [AddRtlTestQuickFix.kind] },
  );
  disposables.push(quickFix);

  registerTesting(context);

  const codeLens = vscode.languages.registerCodeLensProvider(
    { language: "typescriptreact", scheme: "file" },
    new RtlCodeLens(),
  );
  disposables.push(codeLens);

  const healthStatus = new HealthStatus();
  disposables.push(healthStatus);

  const settingsWatcher = onSettingsChange(() => {
    const settings = getSettings();
    logger.setLevel(settings.logLevel);
    previewManager.handleSettingsChanged();
    assistantView.refreshFromSettings();
  });
  disposables.push(settingsWatcher);

  context.subscriptions.push(...disposables);
}

export function deactivate() {
  logger.info("Deactivating RTL Test Generator extension");
}

class RtlCodeLens implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.languageId !== "typescriptreact") return [];
    const first = document.lineAt(0);
    const range = new vscode.Range(0, 0, 0, first.text.length);
    return [
      new vscode.CodeLens(range, {
        title: "Preview RTL Tests",
        command: "rtlTestGenerator.generateInline",
      }),
    ];
  }
}

class HealthStatus {
  private readonly item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99,
  );
  private timer: NodeJS.Timeout | undefined;

  constructor() {
    this.item.text = "$(pulse) RTL Backend";
    this.item.tooltip = "Checking backend health";
    this.item.command = "rtlTestGenerator.openTestAssistant";
    this.item.show();
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 30000);
  }

  async refresh() {
    try {
      const health = await backendClient.health();
      if (health.ollama?.reachable) {
        this.item.text = "$(check) RTL Backend";
        this.item.tooltip = `Ollama connected • Models: ${(health.ollama?.models || []).join(", ")}`;
      } else {
        this.item.text = "$(warning) RTL Backend";
        this.item.tooltip = "Ollama unreachable";
      }
    } catch (error) {
      this.item.text = "$(error) RTL Backend";
      this.item.tooltip =
        error instanceof Error ? error.message : "Health check failed";
    }
  }

  dispose() {
    this.item.dispose();
    if (this.timer) clearInterval(this.timer);
  }
}

function registerGenerateCommand(context: vscode.ExtensionContext) {
  return vscode.commands.registerCommand(
    "rtlTestGenerator.generateInline",
    async (uri?: vscode.Uri) => {
      const document = await resolveTargetDocument(uri);
      if (!document) return;
      const imports = getImports(document);
      await previewManager.previewComponent(
        document.uri,
        document.getText(),
        imports,
      );
    },
  );
}

function registerGenerateSelectionCommand() {
  return vscode.commands.registerCommand(
    "rtlTestGenerator.generateSelection",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "typescriptreact") {
        vscode.window.showWarningMessage(
          "Select a region inside a .tsx component to generate tests.",
        );
        return;
      }
      const selectionInfo = getSelection(editor.document);
      if (!selectionInfo) {
        vscode.window.showWarningMessage("Highlight component code to generate tests for the selection.");
        return;
      }
      const imports = getImports(editor.document);
      await previewManager.previewSelection(
        editor.document.uri,
        editor.document.getText(),
        selectionInfo.selection,
        selectionInfo.text,
        imports,
      );
    },
  );
}

function registerBatchCommand() {
  return vscode.commands.registerCommand(
    "rtlTestGenerator.generateWorkspace",
    async () => {
      const settings = getSettings();
      const glob = await vscode.window.showInputBox({
        prompt: "Glob of components to generate tests for",
        placeHolder: "src/components/**/*.tsx",
      });
      if (!glob) return;
      const files = await vscode.workspace.findFiles(glob, "**/*.test.tsx", settings.batchMaxFiles);
      if (!files.length) {
        vscode.window.showInformationMessage("No files matched the provided glob.");
        return;
      }
      let acceptAll = false;
      for (const file of files) {
        const document = await vscode.workspace.openTextDocument(file);
        const imports = getImports(document);
        await previewManager.previewComponent(file, document.getText(), imports);
        if (acceptAll) {
          await previewManager.createFileFromPreview();
          continue;
        }
        const action = await vscode.window.showInformationMessage(
          `Generated preview for ${getWorkspaceRelativePath(file) ?? file.fsPath}.`,
          "Create File",
          "Accept All Remaining",
          "Skip",
          "Stop",
        );
        if (action === "Create File") {
          await previewManager.createFileFromPreview();
        } else if (action === "Accept All Remaining") {
          acceptAll = true;
          await previewManager.createFileFromPreview();
        } else if (action === "Stop") {
          break;
        }
      }
    },
  );
}

function registerAssistantCommand() {
  return vscode.commands.registerCommand(
    "rtlTestGenerator.openTestAssistant",
    async () => {
      await vscode.commands.executeCommand("workbench.view.extension.rtlTestSuite");
    },
  );
}

function registerDryRunToggle() {
  return vscode.commands.registerCommand(
    "rtlTestGenerator.toggleDryRun",
    async () => {
      const current = previewManager.getDryRun();
      await previewManager.setDryRun(!current);
    },
  );
}

function registerReviewCommand(context: vscode.ExtensionContext) {
  return vscode.commands.registerCommand(
    "rtlTestGenerator.reviewTest",
    async () => {
      const text = await vscode.window.showInputBox({
        prompt: "Paste an RTL test to review",
        placeHolder: "Paste test code here…",
      });
      if (!text) return;
      try {
        const client = backendClient;
        const review = await client.chat({
          messages: [
            {
              role: "system",
              content: "You are an RTL reviewer. Provide actionable feedback.",
            },
            { role: "user", content: text },
          ],
        });
        const doc = await vscode.workspace.openTextDocument({
          language: "markdown",
          content: review.lastMessage.content,
        });
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (error) {
        vscode.window.showErrorMessage(
          error instanceof Error ? error.message : "Review failed",
        );
      }
    },
  );
}

function registerLegacyGenerate(context: vscode.ExtensionContext) {
  return vscode.commands.registerCommand(
    "rtlTestGenerator.generateTests",
    async (uri?: vscode.Uri) => {
      const token = await ensureAuth(context);
      if (!token) return;
      await generateTests(context, uri);
    },
  );
}

function registerAuthCommands(context: vscode.ExtensionContext) {
  const loginCommand = vscode.commands.registerCommand(
    "rtlTestGenerator.login",
    async () => {
      await loginWithGitHub(context);
    },
  );
  const logoutCommand = vscode.commands.registerCommand(
    "rtlTestGenerator.logout",
    async () => {
      await logout(context);
    },
  );
  return vscode.Disposable.from(loginCommand, logoutCommand);
}

async function resolveTargetDocument(uri?: vscode.Uri) {
  if (uri) {
    const document = await vscode.workspace.openTextDocument(uri);
    if (document.languageId !== "typescriptreact") {
      vscode.window.showWarningMessage("Open a .tsx component to generate tests.");
      return undefined;
    }
    return document;
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "typescriptreact") {
    vscode.window.showWarningMessage("Open a .tsx component to generate tests.");
    return undefined;
  }
  return editor.document;
}
