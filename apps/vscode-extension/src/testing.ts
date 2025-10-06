// apps/vscode-extension/src/testing.ts
import * as vscode from "vscode";

export function registerTesting(context: vscode.ExtensionContext) {
  const ctrl = vscode.tests.createTestController("rtlTests", "RTL Tests");
  context.subscriptions.push(ctrl);

  ctrl.refreshHandler = async () => {
    // clear
    ctrl.items.forEach((item: any) => ctrl.items.delete(item.id));

    // locate test files
    const uris = await vscode.workspace.findFiles("**/__tests__/**/*.test.tsx");
    for (const uri of uris) {
      const label = uri.path.split("/").pop() || uri.toString();
      const item = ctrl.createTestItem(uri.toString(), label, uri);
      ctrl.items.add(item);
    }
  };

  // do an initial refresh on activation
  (async () => {
    try {
      await ctrl.refreshHandler?.(new vscode.CancellationTokenSource().token);
    } catch {
      /* ignore */
    }
  })();
}
