import * as vscode from "vscode";

type LogLevel = "error" | "warn" | "info" | "debug";

type StylePreset = "strict-a11y" | "balanced" | "legacy";

export interface RtlGenSettings {
  model: string;
  backendUrl: string;
  apiKey: string;
  defaultTestDir: string;
  stylePreset: StylePreset;
  strictA11y: boolean;
  useUserEvent: boolean;
  timeoutMs: number;
  logLevel: LogLevel;
  batchMaxFiles: number;
  enableTelemetry: boolean;
  dryRun: boolean;
}

export function getSettings(): RtlGenSettings {
  const cfg = vscode.workspace.getConfiguration("rtlGen");
  return {
    model: cfg.get<string>("model", "deep-seek-rtl-gen"),
    backendUrl: cfg.get<string>("backendUrl", "http://localhost:7070"),
    apiKey: cfg.get<string>("apiKey", ""),
    defaultTestDir: cfg.get<string>("defaultTestDir", "__tests__"),
    stylePreset: cfg.get<StylePreset>("stylePreset", "strict-a11y"),
    strictA11y: cfg.get<boolean>("strictA11y", true),
    useUserEvent: cfg.get<boolean>("useUserEvent", true),
    timeoutMs: cfg.get<number>("timeoutMs", 45000),
    logLevel: cfg.get<LogLevel>("logLevel", "info"),
    batchMaxFiles: cfg.get<number>("batchMaxFiles", 20),
    enableTelemetry: cfg.get<boolean>("enableTelemetry", false),
    dryRun: cfg.get<boolean>("dryRun", false),
  };
}

export function onSettingsChange(cb: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event: any) => {
    if (event.affectsConfiguration("rtlGen")) cb();
  });
}

export type RuntimeStylePreset = {
  preset: StylePreset;
  strictA11y: boolean;
  useUserEvent: boolean;
};

export function runtimePresetFromSettings(settings: RtlGenSettings): RuntimeStylePreset {
  return {
    preset: settings.stylePreset,
    strictA11y: settings.strictA11y,
    useUserEvent: settings.useUserEvent,
  };
}
