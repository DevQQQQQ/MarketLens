// src/ui/statusBarManager.ts
import * as vscode from "vscode";
import { MarketItem } from "../types";

export class StatusBarManager implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private maskMode = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.command = "marketlens.refresh";
    this.item.tooltip = "点击立即刷新 MarketLens 行情";
    this.item.text = "$(graph-line) MarketLens 加载中…";
    this.item.show();
  }

  /** 展示第一只关注资产的行情摘要 */
  update(quote: MarketItem): void {
    if (this.maskMode) {
      this.item.text = "$(graph-line) ****  **";
      return;
    }
    const arrow = quote.changePercent >= 0 ? "▲" : "▼";
    const sign = quote.changePercent >= 0 ? "+" : "";
    const priceStr =
      quote.price < 1 && quote.price > 0
        ? quote.price.toFixed(4)
        : quote.price.toFixed(2);

    this.item.text =
      `$(graph-line) ${quote.name} ` +
      `$${priceStr} ` +
      `${arrow} ${sign}${quote.changePercent.toFixed(2)}%`;

    this.item.backgroundColor =
      quote.changePercent >= 0
        ? undefined
        : new vscode.ThemeColor("statusBarItem.errorBackground");
  }

  setMaskMode(enabled: boolean): void {
    this.maskMode = enabled;
  }

  dispose(): void {
    this.item.dispose();
  }
}