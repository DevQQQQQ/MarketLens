import * as vscode from "vscode";
import { detectAvailableProxy } from "../services/network";
import { getSettingsWebviewHtml } from "./settingsHtml";
import { logger } from "../utils/logger";

const ALLOWED_CONFIG_KEYS = new Set([
  "autoRefresh",
  "refreshInterval",
  "maskMode",
  "colorNeutral",
  "statusBar.enabled",
  "aShare.enabled",
  "aShare.statusBar",
  "aShare.stopOnMarketClosed",
  "aShare.networkMode",
  "aShare.proxyUrl",
  "hkStock.enabled",
  "hkStock.statusBar",
  "hkStock.stopOnMarketClosed",
  "hkStock.networkMode",
  "hkStock.proxyUrl",
  "usStock.enabled",
  "usStock.statusBar",
  "usStock.stopOnMarketClosed",
  "usStock.networkMode",
  "usStock.proxyUrl",
  "binance.enabled",
  "binance.statusBar",
  "binance.networkMode",
  "binance.proxyUrl",
  "alpha.enabled",
  "alpha.statusBar",
  "alpha.networkMode",
  "alpha.proxyUrl",
]);

function isAllowedUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export class SettingsWebviewPanel {
  public static currentPanel: SettingsWebviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _version: string;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, version: string = "1.1.1") {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SettingsWebviewPanel.currentPanel) {
      SettingsWebviewPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "marketlensSettings",
      "MarketLens 设置",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    SettingsWebviewPanel.currentPanel = new SettingsWebviewPanel(panel, extensionUri, version);
  }

  private static _generateNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, version: string = "1.1.1") {
    this._panel = panel;
    this._version = version;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getHtmlForWebview();

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "getSettings":
            this.sendCurrentSettings();
            break;
          case "updateSetting":
            if (message.key && ALLOWED_CONFIG_KEYS.has(message.key)) {
              await vscode.workspace
                .getConfiguration("marketlens")
                .update(message.key, message.value, vscode.ConfigurationTarget.Global);
            } else {
              logger.warn(`拦截到未知或非法的设置项写入: ${message.key}`);
            }
            break;
          case "detectProxy": {
            const url = await detectAvailableProxy();
            this._panel.webview.postMessage({
              command: "proxyDetected",
              target: message.target,
              url,
            });
            break;
          }
          case "openKeybindings":
            await vscode.commands.executeCommand(
              "workbench.action.openGlobalKeybindings",
              message.query || "marketlens"
            );
            break;
          case "restoreDefaults":
            await SettingsWebviewPanel.restoreDefaults();
            break;
          case "clearWatchlist":
            await SettingsWebviewPanel.clearWatchlist();
            break;
          case "openExternal":
            if (message.url && isAllowedUrl(message.url)) {
              await vscode.env.openExternal(vscode.Uri.parse(message.url));
            } else {
              logger.warn(`拦截到非 HTTP/HTTPS 外部链接请求: ${message.url}`);
            }
            break;
          case "copyToClipboard":
            if (message.text) {
              await vscode.env.clipboard.writeText(message.text);
              vscode.window.showInformationMessage(`📋 已复制到剪贴板: ${message.text}`);
            }
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public static async restoreDefaults(): Promise<boolean> {
    const confirm = await vscode.window.showWarningMessage(
      "确定要将 MarketLens 恢复为出厂默认设置吗？\n所有自选标的列表将重置为初始预设（A股10只/港股6只/美股9只/Binance12个/Alpha12个），自定义配置也将还原。",
      { modal: true },
      "确认恢复",
      "取消"
    );
    if (confirm !== "确认恢复") {
      return false;
    }

    const cfg = vscode.workspace.getConfiguration("marketlens");
    // 先清空核心 watchlist
    await cfg.update("watchlist", undefined, vscode.ConfigurationTarget.Global);

    const keys = [
      "autoRefresh",
      "refreshInterval",
      "maskMode",
      "colorNeutral",
      "statusBar.enabled",
      "aShare.enabled",
      "aShare.statusBar",
      "aShare.networkMode",
      "aShare.proxyUrl",
      "aShare.stopOnMarketClosed",
      "hkStock.enabled",
      "hkStock.statusBar",
      "hkStock.networkMode",
      "hkStock.proxyUrl",
      "hkStock.stopOnMarketClosed",
      "usStock.enabled",
      "usStock.statusBar",
      "usStock.networkMode",
      "usStock.proxyUrl",
      "usStock.stopOnMarketClosed",
      "binance.enabled",
      "binance.statusBar",
      "binance.networkMode",
      "binance.proxyUrl",
      "alpha.enabled",
      "alpha.statusBar",
      "alpha.networkMode",
      "alpha.proxyUrl",
    ];

    for (const k of keys) {
      await cfg.update(k, undefined, vscode.ConfigurationTarget.Global);
    }

    if (SettingsWebviewPanel.currentPanel) {
      SettingsWebviewPanel.currentPanel.sendCurrentSettings();
    }

    // 触发全局强制刷新全部最新行情
    await vscode.commands.executeCommand("marketlens.refresh");

    vscode.window.showInformationMessage("✅ MarketLens 已成功恢复为出厂默认设置，并已刷新全部实时行情！");
    return true;
  }

  public static async clearWatchlist(): Promise<boolean> {
    const confirm = await vscode.window.showWarningMessage(
      "确定要一键清空当前所有自选标的吗？\n清空后自选列表将变为空白（保留板块分类），方便您从零开始自由添加喜欢的资产。\n（注：您后续仍可随时通过【恢复出厂默认设置】重新找回系统预设标的）",
      { modal: true },
      "确认清空",
      "取消"
    );
    if (confirm !== "确认清空") {
      return false;
    }

    const cfg = vscode.workspace.getConfiguration("marketlens");
    const currentWatchlist = cfg.get<Record<string, any>>("watchlist", {});
    const emptyWatchlist: Record<string, any[]> = {};
    for (const group of Object.keys(currentWatchlist)) {
      emptyWatchlist[group] = [];
    }
    if (!emptyWatchlist["A股"]) emptyWatchlist["A股"] = [];
    if (!emptyWatchlist["港股"]) emptyWatchlist["港股"] = [];
    if (!emptyWatchlist["美股"]) emptyWatchlist["美股"] = [];
    if (!emptyWatchlist["Binance"]) emptyWatchlist["Binance"] = [];
    if (!emptyWatchlist["Alpha"]) emptyWatchlist["Alpha"] = [];

    await cfg.update("watchlist", emptyWatchlist, vscode.ConfigurationTarget.Global);

    // 触发全局强制刷新
    await vscode.commands.executeCommand("marketlens.refresh");

    vscode.window.showInformationMessage("🗑️ 已成功清空所有自选标的！您可以点击自选栏顶部的加号 [+] 开始添加属于您的标的。");
    return true;
  }

  private sendCurrentSettings() {
    const cfg = vscode.workspace.getConfiguration("marketlens");
    const data = {
      autoRefresh:              cfg.get<boolean>("autoRefresh", true),
      refreshInterval:          cfg.get<number>("refreshInterval", 5000),
      maskMode:                 cfg.get<boolean>("maskMode", false),
      colorNeutral:             cfg.get<boolean>("colorNeutral", false),
      statusBarEnabled:         cfg.get<boolean>("statusBar.enabled", true),
      aShareEnabled:            cfg.get<boolean>("aShare.enabled", true),
      aShareStatusBar:          cfg.get<boolean>("aShare.statusBar", true),
      aShareStopOnMarketClosed: cfg.get<boolean>("aShare.stopOnMarketClosed", true),
      aShareNetworkMode:        cfg.get<string>("aShare.networkMode", "direct"),
      aShareProxyUrl:           cfg.get<string>("aShare.proxyUrl", "http://127.0.0.1:7890"),
      hkStockEnabled:           cfg.get<boolean>("hkStock.enabled", true),
      hkStockStatusBar:         cfg.get<boolean>("hkStock.statusBar", true),
      hkStockStopOnMarketClosed: cfg.get<boolean>("hkStock.stopOnMarketClosed", true),
      hkStockNetworkMode:       cfg.get<string>("hkStock.networkMode", "direct"),
      hkStockProxyUrl:          cfg.get<string>("hkStock.proxyUrl", "http://127.0.0.1:7890"),
      usStockEnabled:           cfg.get<boolean>("usStock.enabled", true),
      usStockStatusBar:         cfg.get<boolean>("usStock.statusBar", true),
      usStockStopOnMarketClosed: cfg.get<boolean>("usStock.stopOnMarketClosed", true),
      usStockNetworkMode:       cfg.get<string>("usStock.networkMode", "direct"),
      usStockProxyUrl:          cfg.get<string>("usStock.proxyUrl", "http://127.0.0.1:7890"),
      binanceEnabled:           cfg.get<boolean>("binance.enabled", true),
      binanceStatusBar:         cfg.get<boolean>("binance.statusBar", true),
      binanceNetworkMode:       cfg.get<string>("binance.networkMode", "proxy"),
      binanceProxyUrl:          cfg.get<string>("binance.proxyUrl", "http://127.0.0.1:7890"),
      alphaEnabled:             cfg.get<boolean>("alpha.enabled", true),
      alphaStatusBar:           cfg.get<boolean>("alpha.statusBar", true),
      alphaNetworkMode:         cfg.get<string>("alpha.networkMode", "proxy"),
      alphaProxyUrl:            cfg.get<string>("alpha.proxyUrl", "http://127.0.0.1:7890"),
    };
    this._panel.webview.postMessage({ command: "initSettings", data });
  }

  public dispose() {
    SettingsWebviewPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) { x.dispose(); }
    }
  }

  private _getHtmlForWebview(): string {
    const nonce = SettingsWebviewPanel._generateNonce();
    return getSettingsWebviewHtml(nonce, this._version);
  }
}
