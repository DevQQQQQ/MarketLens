// src/utils/logger.ts
import * as vscode from "vscode";

class LoggerService {
  private channel: vscode.OutputChannel | undefined;

  public init(context: vscode.ExtensionContext): vscode.OutputChannel {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel("MarketLens");
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
