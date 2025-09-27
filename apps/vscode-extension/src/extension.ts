import * as vscode from "vscode";
import { generateTests } from "./commands/generateTests";
import { loginWithGitHub, logout, ensureAuth } from "./auth";

export function activate(context: vscode.ExtensionContext) {
  console.log("🚀 RTL Test Generator AI activated");

  // ── Commands ──────────────────────────────────────────────────────────────
  const cmdGenerate = vscode.commands.registerCommand(
    "rtlTestGenerator.generateTests",
    async (uri?: vscode.Uri) => {
      // ensure there is a token (will open browser if needed)
      const token = await ensureAuth(context);
      if (!token) return; // user canceled
      await generateTests(context, uri);
    },
  );

  const cmdLogin = vscode.commands.registerCommand(
    "rtlTestGenerator.login",
    async () => {
      await loginWithGitHub(context);
    },
  );

  const cmdLogout = vscode.commands.registerCommand(
    "rtlTestGenerator.logout",
    async () => {
      await logout(context);
    },
  );

  // ── Status bar ────────────────────────────────────────────────────────────
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(beaker) RTL Ready";
  statusBarItem.tooltip = "RTL Test Generator is ready";
  statusBarItem.command = "rtlTestGenerator.generateTests";
  statusBarItem.show();

  context.subscriptions.push(cmdGenerate, cmdLogin, cmdLogout, statusBarItem);
}

export function deactivate() {
  console.log("RTL Test Generator AI deactivated");
}
