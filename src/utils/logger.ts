// src/utils/logger.ts
import type * as vscodeTypes from "vscode";

let vscodeModule: typeof vscodeTypes | undefined;
try {
  vscodeModule = require("vscode");
} catch (_) {}

class LoggerService {
  private channel: vscodeTypes.OutputChannel | undefined;

  public init(context: vscodeTypes.ExtensionContext): vscodeTypes.OutputChannel | undefined {
    if (!this.channel && vscodeModule?.window) {
      this.channel = vscodeModule.window.createOutputChannel("MarketLens");
      context.subscriptions.push(this.channel);
    }
    return this.channel;
  }

  public info(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] [INFO] ${message}`;
    this.channel?.appendLine(line);
    console.log(`[MarketLens] ${message}`);
  }

  public warn(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] [WARN] ${message}`;
    this.channel?.appendLine(line);
    console.warn(`[MarketLens] ${message}`);
  }

  public error(message: string, error?: any): void {
    const timestamp = new Date().toLocaleTimeString();
    const errDetail = error ? ` => ${error?.stack || error?.message || error}` : "";
    const line = `[${timestamp}] [ERROR] ${message}${errDetail}`;
    this.channel?.appendLine(line);
    console.error(`[MarketLens] ${message}`, error ?? "");
  }

  public show(): void {
    this.channel?.show(true);
  }
}

export const logger = new LoggerService();
