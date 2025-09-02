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

  // Check backend connection
  checkBackendConnection(statusBarItem);
}

async function checkBackendConnection(statusBarItem: vscode.StatusBarItem) {
  try {
    const response = await fetch("http://localhost:7070/health");
    if (response.ok) {
      statusBarItem.text = "$(beaker) RTL Ready";
      statusBarItem.tooltip = "RTL Test Generator is ready";
    } else {
      statusBarItem.text = "$(error) RTL Error";
      statusBarItem.tooltip = "Backend not responding";
    }
  } catch (error) {
    statusBarItem.text = "$(warning) RTL Offline";
    statusBarItem.tooltip = "Backend offline - make sure to run 'pnpm backend'";
  }
}

export function deactivate() {
  console.log("RTL Test Generator AI deactivated");
}

// streaming the test results
// tests are verified (linter look it up)
// next steps: fine tuning the model

// deployment
// database set up
// authentication (github token)
