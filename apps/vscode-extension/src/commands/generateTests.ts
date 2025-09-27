import * as vscode from "vscode";
import * as path from "path";
import { ensureAuth, getToken } from "../auth";

type BackendApiResponse = {
  success: boolean;
  testCode: string;
  error?: string;
};

const CONFIG_SECTION = "rtlTestGeneratorAI";
const DEFAULT_API = "http://localhost:7070";

export async function generateTests(
  context: vscode.ExtensionContext,
  uri?: vscode.Uri,
): Promise<void> {
  try {
    // Ensure auth (will open browser if needed)
    const token = await ensureAuth(context);
    if (!token) return; // user canceled

    // Active file / selected file
    const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) {
      vscode.window.showErrorMessage("No file selected");
      return;
    }

    // Validate extension
    const ext = path.extname(targetUri.fsPath);
    if (![".js", ".jsx", ".ts", ".tsx"].includes(ext)) {
      vscode.window.showErrorMessage(
        "Please select a React component file (.js, .jsx, .ts, .tsx)",
      );
      return;
    }

    // Skip test files
    if (
      targetUri.fsPath.includes(".test.") ||
      targetUri.fsPath.includes(".spec.")
    ) {
      vscode.window.showErrorMessage("Cannot generate tests for test files");
      return;
    }

    // Read component code
    const document = await vscode.workspace.openTextDocument(targetUri);
    const componentCode = document.getText().trim();
    if (!componentCode) {
      vscode.window.showErrorMessage("File is empty");
      return;
    }

    const componentName = path.basename(targetUri.fsPath, ext);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `RTL Test Generator`,
        cancellable: true,
      },
      async (progress, tokenCancel) => {
        progress.report({
          increment: 0,
          message: `Analyzing ${componentName}...`,
        });
        if (tokenCancel.isCancellationRequested) return;

        // Call backend (non-stream for file creation flow)
        progress.report({
          increment: 25,
          message: "Connecting to AI service...",
        });

        const apiResponse = await callBackendAPI(
          context,
          componentCode,
          targetUri.fsPath,
          "comprehensive", // default
        );

        if (tokenCancel.isCancellationRequested) return;

        progress.report({ increment: 75, message: "Processing test code..." });

        if (!apiResponse.success) {
          throw new Error(apiResponse.error || "Unknown error from backend");
        }

        const cleaned = stripFences(apiResponse.testCode);

        progress.report({ increment: 90, message: "Creating test file..." });

        const testFilePath = getTestFilePath(targetUri.fsPath);
        await createTestFile(testFilePath, cleaned);

        progress.report({ increment: 100, message: "Done!" });

        const action = await vscode.window.showInformationMessage(
          `✅ RTL tests generated for ${componentName}!`,
          "Open Test File",
          "Generate Different Style",
          "Copy to Clipboard",
        );

        if (action === "Open Test File") {
          const testUri = vscode.Uri.file(testFilePath);
          const testDocument = await vscode.workspace.openTextDocument(testUri);
          await vscode.window.showTextDocument(
            testDocument,
            vscode.ViewColumn.Beside,
          );
        } else if (action === "Generate Different Style") {
          await showStylePicker(
            context,
            componentCode,
            targetUri.fsPath,
            componentName,
          );
        } else if (action === "Copy to Clipboard") {
          await vscode.env.clipboard.writeText(cleaned);
          vscode.window.showInformationMessage(
            "Test code copied to clipboard!",
          );
        }
      },
    );
  } catch (error: any) {
    console.error("Error generating tests:", error);
    vscode.window.showErrorMessage(
      `Failed to generate tests: ${error?.message ?? error}`,
    );
  }
}

async function callBackendAPI(
  context: vscode.ExtensionContext,
  componentCode: string,
  filePath: string,
  testStyle: "minimal" | "comprehensive" | "accessibility",
): Promise<BackendApiResponse> {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const apiUrl = cfg.get<string>("apiUrl", DEFAULT_API);

  // Ensure token (extra safety; extension.ts should already ensureAuth)
  const token = await getToken(context);
  if (!token)
    throw new Error("Not authenticated. Please run: RTL: Login with GitHub");

  // Map "accessibility" to "comprehensive" so backend accepts it
  const styleMapped =
    testStyle === "accessibility" ? "comprehensive" : testStyle;

  const response = await fetch(`${apiUrl}/api/generate-tests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      componentCode,
      filePath,
      testStyle: styleMapped,
      // stream: false (default on backend)
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `API request failed: ${response.status} ${response.statusText} ${text}`,
    );
  }

  return (await response.json()) as BackendApiResponse;
}

async function createTestFile(
  testFilePath: string,
  testCode: string,
): Promise<void> {
  const testUri = vscode.Uri.file(testFilePath);

  // If exists, confirm overwrite
  try {
    await vscode.workspace.fs.stat(testUri);
    const overwrite = await vscode.window.showWarningMessage(
      "Test file already exists. Do you want to overwrite it?",
      "Overwrite",
      "Cancel",
    );
    if (overwrite !== "Overwrite") return;
  } catch {
    // Not found — OK
  }

  await vscode.workspace.fs.writeFile(
    testUri,
    new TextEncoder().encode(testCode),
  );
}

async function showStylePicker(
  context: vscode.ExtensionContext,
  componentCode: string,
  filePath: string,
  componentName: string,
) {
  const style = await vscode.window.showQuickPick(
    [
      {
        label: "⚡ Minimal",
        description: "Basic rendering and simple interaction tests",
        detail: "Fast generation, covers essential functionality",
        value: "minimal",
      },
      {
        label: "📋 Comprehensive",
        description: "Full test coverage with edge cases",
        detail: "Thorough testing, includes error handling",
        value: "comprehensive",
      },
      {
        label: "♿ Accessibility Focused",
        description: "Enhanced accessibility testing",
        detail: "ARIA labels, keyboard navigation, screen readers",
        value: "accessibility",
      },
    ],
    {
      placeHolder: "Choose test generation style",
      title: `Generate tests for ${componentName}`,
    },
  );

  if (style) {
    const apiResponse = await callBackendAPI(
      context,
      componentCode,
      filePath,
      style.value as "minimal" | "comprehensive" | "accessibility",
    );

    if (apiResponse.success) {
      const cleaned = stripFences(apiResponse.testCode);
      const testFilePath = getTestFilePath(filePath);
      await createTestFile(testFilePath, cleaned);
      vscode.window.showInformationMessage(
        `✅ ${style.label} tests generated!`,
      );
    }
  }
}

function getTestFilePath(componentPath: string): string {
  const ext = path.extname(componentPath);
  const baseName = path.basename(componentPath, ext);
  const dir = path.dirname(componentPath);
  return path.join(dir, `${baseName}.test${ext}`);
}

function stripFences(s: string) {
  return s
    .replace(/^\s*```[a-z]*\s*/i, "")
    .replace(/```+$/i, "")
    .replace(/```/g, "");
}
