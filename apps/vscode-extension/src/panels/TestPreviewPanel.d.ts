import * as vscode from "vscode";
export declare class TestPreviewPanel {
    private readonly context;
    private static currentPanel;
    private readonly panel;
    private disposables;
    constructor(context: vscode.ExtensionContext);
    static show(context: vscode.ExtensionContext): TestPreviewPanel;
    updateTestCode(testCode: string, componentName: string): void;
    show(): void;
    private setupWebviewContent;
    private getWebviewContent;
    private saveTestToFile;
    private regenerateTest;
    private dispose;
}
//# sourceMappingURL=TestPreviewPanel.d.ts.map