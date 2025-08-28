import * as vscode from "vscode";
import * as path from "path";

export async function generateTests(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  const document = editor.document;
  const componentCode = document.getText();
  const filePath = document.fileName;

  // Validate React component file
  if (![".jsx", ".tsx"].includes(path.extname(filePath))) {
    vscode.window.showErrorMessage(
      "Please open a React component (.jsx or .tsx)",
    );
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Generating RTL tests...",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0, message: "Sending to AI..." });

        // Call backend API
        const response = await fetch(
          "http://localhost:7070/api/generate-tests",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              componentCode,
              filePath,
              testStyle: "comprehensive",
            }),
          },
        );

        progress.report({ increment: 50, message: "Processing response..." });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = (await response.json()) as {
          success: boolean;
          error?: string;
          testCode?: string;
        };

        if (!data.success) {
          throw new Error(data.error || "Unknown error");
        }

        progress.report({ increment: 100, message: "Creating test file..." });

        // Create test file
        const testFilePath = getTestFilePath(filePath);
        const testUri = vscode.Uri.file(testFilePath);

        await vscode.workspace.fs.writeFile(
          testUri,
          new TextEncoder().encode(data.testCode),
        );

        // Open the test file
        const testDocument = await vscode.workspace.openTextDocument(testUri);
        await vscode.window.showTextDocument(testDocument);

        vscode.window.showInformationMessage(
          "RTL tests generated successfully!",
        );
      },
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to generate tests: ${error}`);
  }
}

function getTestFilePath(componentPath: string): string {
  const ext = path.extname(componentPath);
  const baseName = path.basename(componentPath, ext);
  const dir = path.dirname(componentPath);
  return path.join(dir, `${baseName}.test${ext}`);
}
