import * as vscode from "vscode";
import { generateTests } from "./commands/generateTests";

export function activate(context: vscode.ExtensionContext) {
  console.log("RTL Test Generator AI activated");

  const disposable = vscode.commands.registerCommand(
    "rtlTestGenerator.generateTests",
    generateTests,
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
