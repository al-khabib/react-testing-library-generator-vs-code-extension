// apps/vscode-extension/src/quickFix.ts
import * as vscode from "vscode";

/**
 * Shows a Quick Fix ("lightbulb") in TSX files to add a generated RTL test.
 * This does not analyze the AST yet — it’s a convenient entry point.
 */
export class AddRtlTestQuickFix implements vscode.CodeActionProvider {
  static readonly kind = vscode.CodeActionKind.QuickFix;

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
  ): vscode.CodeAction[] {
    if (document.languageId !== "typescriptreact") return [];

    const action = new vscode.CodeAction(
      "Add RTL Test (LLM)",
      AddRtlTestQuickFix.kind,
    );
    action.command = {
      command: "rtlTestGenerator.generateInline", // <- change if needed
      title: "Add RTL Test (LLM)",
    };
    return [action];
  }

  // Show the lightbulb for all TSX files.
  // If you later want to be smarter, add diagnostics or pattern checks.
  public static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [AddRtlTestQuickFix.kind],
  };
}
