import * as vscode from "vscode";

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.command = "rtlTestGenerator.showPreview";
  }

  public show() {
    this.statusBarItem.show();
  }

  public setReady() {
    this.statusBarItem.text = "$(beaker) RTL Ready";
    this.statusBarItem.tooltip = "RTL Test Generator is ready";
    this.statusBarItem.backgroundColor = undefined;
  }

  public setGenerating() {
    this.statusBarItem.text = "$(loading~spin) RTL Generating...";
    this.statusBarItem.tooltip = "Generating RTL tests...";
  }

  public setError(message: string) {
    this.statusBarItem.text = "$(error) RTL Error";
    this.statusBarItem.tooltip = `RTL Test Generator: ${message}`;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground",
    );
  }

  public dispose() {
    this.statusBarItem.dispose();
  }
}
