import * as vscode from "vscode";

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LevelName = keyof typeof levels;

export class ExtensionLogger {
  private channel = vscode.window.createOutputChannel("RTL Test Generator");
  private level: LevelName = "info";

  setLevel(next: LevelName) {
    this.level = next;
  }

  error(message: string, ...args: unknown[]) {
    this.log("error", message, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    this.log("warn", message, ...args);
  }

  info(message: string, ...args: unknown[]) {
    this.log("info", message, ...args);
  }

  debug(message: string, ...args: unknown[]) {
    this.log("debug", message, ...args);
  }

  private log(level: LevelName, message: string, ...args: unknown[]) {
    if (levels[level] > levels[this.level]) return;
    const timestamp = new Date().toISOString();
    const suffix = args.length ? ` ${args.map(formatArg).join(" ")}` : "";
    this.channel.appendLine(`[${timestamp}] [${level.toUpperCase()}] ${message}${suffix}`);
  }
}

function formatArg(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
}

export const logger = new ExtensionLogger();
