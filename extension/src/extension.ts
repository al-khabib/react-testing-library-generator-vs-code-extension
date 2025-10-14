import * as vscode from 'vscode';
import { detectReactComponent } from './providers/ComponentDetector';
import { SidebarProvider } from './providers/SidebarProvider';
import { ComponentInfo, GeneratedTest, ServiceStatus } from './types';
import { httpClient } from './utils/httpClient';
import { TestGenerationPanel } from './webview/TestGenerationPanel';

const validateDocument = async (uri?: vscode.Uri): Promise<vscode.TextDocument> => {
  if (uri) {
    return vscode.workspace.openTextDocument(uri);
  }

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document) {
    return activeEditor.document;
  }

  throw new Error('No active editor or file selected.');
};

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
  );

  const generateTestCommand = vscode.commands.registerCommand(
    'rtl-generator.generateTest',
    async (resource?: vscode.Uri) => {
      let document: vscode.TextDocument;

      try {
        document = await validateDocument(resource);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to read the selected file.';
        vscode.window.showErrorMessage(message);
        return;
      }

      const isReactFile =
        document.languageId === 'javascriptreact' ||
        document.languageId === 'typescriptreact' ||
        /\.tsx?$/.test(document.fileName) ||
        /\.jsx$/.test(document.fileName);

      if (!isReactFile) {
        vscode.window.showWarningMessage('Generate RTL Test supports only React component files.');
        return;
      }

      let componentInfo: ComponentInfo | null = null;

      try {
        componentInfo = await detectReactComponent(document);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to analyze the component.';
        vscode.window.showErrorMessage(message);
        return;
      }

      if (!componentInfo) {
        vscode.window.showWarningMessage(
          'No React component detected in the selected file.'
        );
        return;
      }

      if (componentInfo.hasTests) {
        const decision = await vscode.window.showInformationMessage(
          `Existing tests detected for ${componentInfo.name}. Generate a new test anyway?`,
          { modal: true },
          'Continue',
          'Cancel'
        );

        if (decision !== 'Continue') {
          return;
        }
      }

      const editor = vscode.window.activeTextEditor;
      const selection = editor && !editor.selection.isEmpty && editor.document === document
        ? document.getText(editor.selection)
        : null;

      const source: 'full' | 'selection' = selection ? 'selection' : 'full';
      const componentCode = selection ?? document.getText();

      const generationTarget: ComponentInfo = {
        ...componentInfo,
        code: componentCode,
        displayName: componentInfo.name,
        instructions: undefined,
        source
      };

      sidebarProvider.handleGenerationStart(generationTarget);

      let generatedTest: GeneratedTest | null = null;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Generating RTL test for ${generationTarget.displayName ?? generationTarget.name}`,
          cancellable: false
        },
        async (progress) => {
          progress.report({ message: 'Checking service availability…' });

          const status: ServiceStatus = await httpClient.checkHealth();
          await sidebarProvider.updateStatus(status);

          if (!status.healthy) {
            const message = status.message ?? 'API gateway is unavailable.';
            vscode.window.showErrorMessage(message);
            await sidebarProvider.handleGenerationError(generationTarget, message);
            return;
          }

          progress.report({ message: 'Sending component data…' });

          try {
            generatedTest = await httpClient.generateTest(generationTarget);
            progress.report({ message: 'Preparing test preview…' });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : httpClient.extractErrorMessage(error);
            vscode.window.showErrorMessage(message);
            await sidebarProvider.handleGenerationError(generationTarget, message);
          }
        }
      );

      if (!generatedTest) {
        return;
      }

      try {
        await TestGenerationPanel.create(context, generationTarget, generatedTest, sidebarProvider);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open test preview panel.';
        vscode.window.showErrorMessage(message);
      }
    }
  );

  context.subscriptions.push(generateTestCommand);
}

export function deactivate() {
  // Intentionally left blank.
}
