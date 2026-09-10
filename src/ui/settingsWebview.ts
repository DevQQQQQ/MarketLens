import * as vscode from "vscode";
import { detectAvailablePort, getCachedWorkingPort, resetProxyCache } from "../services/network";
import { getSettingsWebviewHtml } from "./settingsHtml";
import { logger } from "../utils/logger";

const ALLOWED_CONFIG_KEYS = new Set([
  "proxyPort",
  "proxyUrl",
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
  public static onDidUpdateSetting?: (key: string, value: any) => void;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _version: string;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, version: string = "1.1.2") {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SettingsWebviewPanel.currentPanel) {
      SettingsWebviewPanel.currentPanel._panel.reveal(column);
      SettingsWebviewPanel.currentPanel.sendCurrentSettings();
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

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, version: string = "1.1.2") {
    this._panel = panel;
    this._version = version;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // 1. 先注册消息接收器，避免 webview 加载时发出的 getSettings 信号丢失
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "getSettings":
            this.sendCurrentSettings();
            // 自动静默异步探测本机真实活跃代理端口：若探测到了真实活跃端口，立即精准通知并更新界面！
            detectAvailablePort().then((detectedPort) => {
              if (detectedPort) {
                this._panel.webview.postMessage({
                  command: "portDetected",
                  port: detectedPort,
                  url: `http://127.0.0.1:${detectedPort}`,
                });
              }
            }).catch(() => {});
            break;
          case "updateSetting":
            if (message.key && ALLOWED_CONFIG_KEYS.has(message.key)) {
              // 1. 立即同步触发内存配置更新（0ms 响应，立即刷新状态栏与看板，无需等待磁盘写入）
              try {
                SettingsWebviewPanel.onDidUpdateSetting?.(message.key, message.value);
              } catch (syncErr) {
                logger.error(`即时内存配置更新异常: ${message.key}`, syncErr);
              }

              // 2. 异步持久化配置到 VS Code 配置（磁盘 I/O）
              try {
                const cfg = vscode.workspace.getConfiguration("marketlens");
                if (message.key === "proxyPort") {
                  resetProxyCache();
                  const port = parseInt(message.value, 10);
                  if (port >= 1 && port <= 65535) {
                    const pUrl = `http://127.0.0.1:${port}`;
                    await Promise.all([
                      cfg.update("proxyPort", port, vscode.ConfigurationTarget.Global),
                      cfg.update("proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                      cfg.update("aShare.proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                      cfg.update("hkStock.proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                      cfg.update("usStock.proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                      cfg.update("binance.proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                      cfg.update("alpha.proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                    ]);
                    this.sendCurrentSettings();
                  }
                } else if (message.key === "proxyUrl") {
                  resetProxyCache();
                  const pUrl = message.value || "http://127.0.0.1:10808";
                  let port = 10808;
                  try {
                    const u = new URL(pUrl);
                    if (u.port) port = parseInt(u.port, 10);
                  } catch (_) {}
                  await Promise.all([
                    cfg.update("proxyPort", port, vscode.ConfigurationTarget.Global),
                    cfg.update("proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                    cfg.update("aShare.proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                    cfg.update("hkStock.proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                    cfg.update("usStock.proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                    cfg.update("binance.proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                    cfg.update("alpha.proxyUrl", pUrl, vscode.ConfigurationTarget.Global),
                  ]);
                  this.sendCurrentSettings();
                } else if (message.key === "statusBar.enabled") {
                  const enableAll = !!message.value;
                  await Promise.all([
                    cfg.update("statusBar.enabled", enableAll, vscode.ConfigurationTarget.Global),
                    cfg.update("aShare.statusBar", enableAll, vscode.ConfigurationTarget.Global),
                    cfg.update("hkStock.statusBar", enableAll, vscode.ConfigurationTarget.Global),
                    cfg.update("usStock.statusBar", enableAll, vscode.ConfigurationTarget.Global),
                    cfg.update("binance.statusBar", enableAll, vscode.ConfigurationTarget.Global),
                    cfg.update("alpha.statusBar", enableAll, vscode.ConfigurationTarget.Global),
                  ]);
                  this.sendCurrentSettings();
                } else if (
                  message.key === "aShare.statusBar" ||
                  message.key === "hkStock.statusBar" ||
                  message.key === "usStock.statusBar" ||
                  message.key === "binance.statusBar" ||
                  message.key === "alpha.statusBar"
                ) {
                  await cfg.update(message.key, message.value, vscode.ConfigurationTarget.Global);

                  const aShareSB  = message.key === "aShare.statusBar"  ? !!message.value : (cfg.get<boolean>("aShare.statusBar") ?? true);
                  const hkStockSB = message.key === "hkStock.statusBar" ? !!message.value : (cfg.get<boolean>("hkStock.statusBar") ?? true);
                  const usStockSB = message.key === "usStock.statusBar" ? !!message.value : (cfg.get<boolean>("usStock.statusBar") ?? true);
                  const binanceSB = message.key === "binance.statusBar" ? !!message.value : (cfg.get<boolean>("binance.statusBar") ?? true);
                  const alphaSB   = message.key === "alpha.statusBar"   ? !!message.value : (cfg.get<boolean>("alpha.statusBar") ?? true);

                  const anyActive = aShareSB || hkStockSB || usStockSB || binanceSB || alphaSB;
                  await cfg.update("statusBar.enabled", anyActive, vscode.ConfigurationTarget.Global);
                  this.sendCurrentSettings();
                } else {
                  await cfg.update(message.key, message.value, vscode.ConfigurationTarget.Global);
                }
              } catch (err) {
                logger.error(`更新设置项失败: ${message.key}`, err);
              }
            } else {
              logger.warn(`拦截到未知或非法的设置项写入: ${message.key}`);
            }
            break;
          case "detectProxy": {
            const port = await detectAvailablePort();
            const url = port ? `http://127.0.0.1:${port}` : null;
            if (port && url) {
              const cfg = vscode.workspace.getConfiguration("marketlens");
              await Promise.all([
                cfg.update("proxyPort", port, vscode.ConfigurationTarget.Global),
                cfg.update("proxyUrl", url, vscode.ConfigurationTarget.Global),
                cfg.update("aShare.proxyUrl", url, vscode.ConfigurationTarget.Global),
                cfg.update("hkStock.proxyUrl", url, vscode.ConfigurationTarget.Global),
                cfg.update("usStock.proxyUrl", url, vscode.ConfigurationTarget.Global),
                cfg.update("binance.proxyUrl", url, vscode.ConfigurationTarget.Global),
                cfg.update("alpha.proxyUrl", url, vscode.ConfigurationTarget.Global),
              ]);
              try {
                SettingsWebviewPanel.onDidUpdateSetting?.("proxyPort", port);
                SettingsWebviewPanel.onDidUpdateSetting?.("proxyUrl", url);
              } catch (_) {}
            }
            this._panel.webview.postMessage({
              command: "proxyDetected",
              target: message.target,
              port,
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

    // 2. 监听 panel 视图可见性状态改变，切回前台时自动重新同步配置
    this._panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible) {
          this.sendCurrentSettings();
        }
      },
      null,
      this._disposables
    );

    // 3. 赋值 webview HTML
    this._panel.webview.html = this._getHtmlForWebview();

    // 4. 主动推一次配置（双向握手保障）
    this.sendCurrentSettings();
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
      "proxyPort",
      "proxyUrl",
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

    // 立即通知重置内存状态
    try {
      SettingsWebviewPanel.onDidUpdateSetting?.("restoreDefaults", true);
    } catch (_) {}

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

    // 立即同步清空内存列表，状态栏立刻清空并隐藏
    try {
      SettingsWebviewPanel.onDidUpdateSetting?.("watchlist", emptyWatchlist);
    } catch (_) {}

    await cfg.update("watchlist", emptyWatchlist, vscode.ConfigurationTarget.Global);

    // 触发全局强制刷新
    await vscode.commands.executeCommand("marketlens.refresh");

    vscode.window.showInformationMessage("🗑️ 已成功清空所有自选标的！您可以点击自选栏顶部的加号 [+] 开始添加属于您的标的。");
    return true;
  }

  private _getCurrentSettingsData() {
    const cfg = vscode.workspace.getConfiguration("marketlens");
    const aShareSB  = cfg.get<boolean>("aShare.statusBar") ?? (cfg.get<any>("aShare")?.statusBar ?? true);
    const hkStockSB = cfg.get<boolean>("hkStock.statusBar") ?? (cfg.get<any>("hkStock")?.statusBar ?? true);
    const usStockSB = cfg.get<boolean>("usStock.statusBar") ?? (cfg.get<any>("usStock")?.statusBar ?? true);
    const binanceSB = cfg.get<boolean>("binance.statusBar") ?? (cfg.get<any>("binance")?.statusBar ?? true);
    const alphaSB   = cfg.get<boolean>("alpha.statusBar") ?? (cfg.get<any>("alpha")?.statusBar ?? true);
    const allActive = aShareSB && hkStockSB && usStockSB && binanceSB && alphaSB;

    // 解析当前生效的统一代理端口与地址
    const cachedPort = getCachedWorkingPort();
    let configuredPort = cfg.get<number>("proxyPort");
    if (!configuredPort) {
      const pUrl = cfg.get<string>("proxyUrl") || cfg.get<string>("binance.proxyUrl") || cfg.get<string>("alpha.proxyUrl");
      if (pUrl) {
        try {
          const u = new URL(pUrl);
          if (u.port) configuredPort = parseInt(u.port, 10);
        } catch (_) {}
      }
    }
    // 优先级：真实探测工作中的端口 > 用户配置端口 > 10808
    const effectivePort = cachedPort || configuredPort || 10808;
    const proxyUrl = `http://127.0.0.1:${effectivePort}`;

    return {
      autoRefresh:              cfg.get<boolean>("autoRefresh", true),
      refreshInterval:          cfg.get<number>("refreshInterval", 5000),
      maskMode:                 cfg.get<boolean>("maskMode", false),
      colorNeutral:             cfg.get<boolean>("colorNeutral", false),
      statusBarEnabled:         allActive,
      proxyPort:                effectivePort,
      proxyUrl:                 proxyUrl,
      aShareEnabled:            cfg.get<boolean>("aShare.enabled", true),
      aShareStatusBar:          aShareSB,
      aShareStopOnMarketClosed: cfg.get<boolean>("aShare.stopOnMarketClosed", true),
      aShareNetworkMode:        cfg.get<string>("aShare.networkMode", "direct"),
      aShareProxyUrl:           proxyUrl,
      hkStockEnabled:           cfg.get<boolean>("hkStock.enabled", true),
      hkStockStatusBar:         hkStockSB,
      hkStockStopOnMarketClosed: cfg.get<boolean>("hkStock.stopOnMarketClosed", true),
      hkStockNetworkMode:       cfg.get<string>("hkStock.networkMode", "direct"),
      hkStockProxyUrl:          proxyUrl,
      usStockEnabled:           cfg.get<boolean>("usStock.enabled", true),
      usStockStatusBar:         usStockSB,
      usStockStopOnMarketClosed: cfg.get<boolean>("usStock.stopOnMarketClosed", true),
      usStockNetworkMode:       cfg.get<string>("usStock.networkMode", "direct"),
      usStockProxyUrl:          proxyUrl,
      binanceEnabled:           cfg.get<boolean>("binance.enabled", true),
      binanceStatusBar:         binanceSB,
      binanceNetworkMode:       cfg.get<string>("binance.networkMode", "proxy"),
      binanceProxyUrl:          proxyUrl,
      alphaEnabled:             cfg.get<boolean>("alpha.enabled", true),
      alphaStatusBar:           alphaSB,
      alphaNetworkMode:         cfg.get<string>("alpha.networkMode", "proxy"),
      alphaProxyUrl:            proxyUrl,
    };
  }

  private sendCurrentSettings() {
    const data = this._getCurrentSettingsData();
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
    const currentData = this._getCurrentSettingsData();
    return getSettingsWebviewHtml(nonce, this._version, this._panel.webview.cspSource, currentData);
  }
}
