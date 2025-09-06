import * as vscode from "vscode";
import { generateTests } from "./commands/generateTests";

export function activate(context: vscode.ExtensionContext) {
  console.log("🚀 RTL Test Generator AI activated");

  // Register main command
  const generateCommand = vscode.commands.registerCommand(
    "rtlTestGenerator.generateTests",
    async (uri?: vscode.Uri) => {
      await generateTests(uri);
    },
  );

  // Simple status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(beaker) RTL Ready";
  statusBarItem.tooltip = "RTL Test Generator is ready";
  statusBarItem.show();

  context.subscriptions.push(generateCommand, statusBarItem);
}

export function deactivate() {
  console.log("RTL Test Generator AI deactivated");
}

// get the extension on different machine
// fine tune it
//
