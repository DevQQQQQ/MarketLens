import * as vscode from "vscode";
import { detectAvailablePort, getCachedWorkingPort, resetProxyCache } from "../services/network";
import { getSettingsWebviewHtml } from "./settingsHtml";
import { logger } from "../utils/logger";
import { MarketItem } from "../types";
import { normalizeSymbolKey, resolveItemDisplayName } from "../utils/symbolHelper";
import { readConfig } from "../utils/config";

const ALLOWED_CONFIG_KEYS = new Set([
  "proxyPort",
  "proxyUrl",
  "autoRefresh",
  "refreshInterval",
  "maskMode",
  "colorNeutral",
  "colorScheme",
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
  "alerts",
  "alertNotificationMode",
  "alertCooldownMinutes",
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
  public static getQuoteCache?: () => Map<string, MarketItem>;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _version: string;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, version?: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SettingsWebviewPanel.currentPanel) {
      SettingsWebviewPanel.currentPanel._panel.reveal(column);
      SettingsWebviewPanel.currentPanel.sendCurrentSettings();
      return;
    }

    const resolvedVersion =
      version ||
      vscode.extensions.getExtension("devqqqqq.marketlens")?.packageJSON?.version ||
      "";

    const panel = vscode.window.createWebviewPanel(
      "marketlensSettings",
      "MarketLens 设置",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    SettingsWebviewPanel.currentPanel = new SettingsWebviewPanel(panel, extensionUri, resolvedVersion);
  }

  private static _generateNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, version: string = "") {
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
                } else if (message.key === "colorScheme") {
                  await Promise.all([
                    cfg.update("colorScheme", message.value, vscode.ConfigurationTarget.Global),
                    cfg.update("colorNeutral", false, vscode.ConfigurationTarget.Global),
                  ]);
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
          case "showLogs":
            logger.show();
            break;
          case "clearWatchlist":
            await SettingsWebviewPanel.clearWatchlist();
            break;
          case "clearAllAlerts": {
            const confirm = await vscode.window.showWarningMessage(
              "确定要清空当前所有自选标的的价格预警规则吗？",
              { modal: true },
              "确认清空",
              "取消"
            );
            if (confirm === "确认清空") {
              try {
                SettingsWebviewPanel.onDidUpdateSetting?.("alerts", {});
              } catch (_) {}
              const cfg = vscode.workspace.getConfiguration("marketlens");
              await cfg.update("alerts", {}, vscode.ConfigurationTarget.Global);
              this.sendCurrentSettings();
              vscode.window.showInformationMessage("✅ 已清空所有价格预警规则");
            }
            break;
          }
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
      "确定要将 MarketLens 恢复为出厂默认设置吗？\n所有自选标的列表将重置为初始预设（A股10只/港股6只/美股9只/Binance12个/Alpha12个），所有价格预警规则与自定义配置也将全部还原。",
      { modal: true },
      "确认恢复",
      "取消"
    );
    if (confirm !== "确认恢复") {
      return false;
    }

    // 1. 立即同步重置内存状态（0延迟清空树节点 🔔 图标与状态栏预警）
    try {
      SettingsWebviewPanel.onDidUpdateSetting?.("restoreDefaults", true);
    } catch (_) {}

    const cfg = vscode.workspace.getConfiguration("marketlens");
    // 先清空核心 watchlist 与价格预警 alerts
    await cfg.update("watchlist", undefined, vscode.ConfigurationTarget.Global);
    await cfg.update("alerts", undefined, vscode.ConfigurationTarget.Global);

    const keys = [
      "alerts",
      "alertNotificationMode",
      "alertCooldownMinutes",
      "proxyPort",
      "proxyUrl",
      "autoRefresh",
      "refreshInterval",
      "maskMode",
      "colorNeutral",
      "colorScheme",
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

    vscode.window.showInformationMessage("✅ MarketLens 已成功恢复为出厂默认设置（价格预警与自选列表均已还原初始状态）！");
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
    const config = readConfig();

    // 解析当前生效的统一代理端口与地址
    const cachedPort = getCachedWorkingPort();
    const effectivePort = cachedPort || config.proxyPort || 10808;
    const proxyUrl = cachedPort ? `http://127.0.0.1:${cachedPort}` : config.proxyUrl;

    return {
      autoRefresh:              config.autoRefresh,
      refreshInterval:          config.refreshInterval,
      maskMode:                 config.maskMode,
      colorNeutral:             config.colorNeutral,
      colorScheme:              config.colorScheme,
      // 总控开关直接采用全局 statusBar.enabled 语义（未显式关闭即为开启）。
      // 此前用五个板块 statusBar 的逻辑与判定，会导致「只关掉 A 股轮播」时总控开关被误显示为关闭。
      statusBarEnabled:         config.statusBar.enabled,
      proxyPort:                effectivePort,
      proxyUrl:                 proxyUrl,
      aShareEnabled:            config.aShare.enabled,
      aShareStatusBar:          config.aShare.statusBar,
      aShareStopOnMarketClosed: config.aShare.stopOnMarketClosed,
      aShareNetworkMode:        config.aShare.networkMode,
      aShareProxyUrl:           config.aShare.proxyUrl || proxyUrl,
      hkStockEnabled:           config.hkStock.enabled,
      hkStockStatusBar:         config.hkStock.statusBar,
      hkStockStopOnMarketClosed: config.hkStock.stopOnMarketClosed,
      hkStockNetworkMode:       config.hkStock.networkMode,
      hkStockProxyUrl:          config.hkStock.proxyUrl || proxyUrl,
      usStockEnabled:           config.usStock.enabled,
      usStockStatusBar:         config.usStock.statusBar,
      usStockStopOnMarketClosed: config.usStock.stopOnMarketClosed,
      usStockNetworkMode:       config.usStock.networkMode,
      usStockProxyUrl:          config.usStock.proxyUrl || proxyUrl,
      binanceEnabled:           config.binance.enabled,
      binanceStatusBar:         config.binance.statusBar,
      binanceNetworkMode:       config.binance.networkMode,
      binanceProxyUrl:          config.binance.proxyUrl || proxyUrl,
      alphaEnabled:             config.alpha.enabled,
      alphaStatusBar:           config.alpha.statusBar,
      alphaNetworkMode:         config.alpha.networkMode,
      alphaProxyUrl:            config.alpha.proxyUrl || proxyUrl,
      alerts:                   config.alerts || {},
      alertNotificationMode:    config.alertNotificationMode,
      alertCooldownMinutes:     config.alertCooldownMinutes,
      watchlist:                (() => {
        const rawWatchlist = config.watchlist || {};
        const quoteCache = SettingsWebviewPanel.getQuoteCache?.();
        const resolvedWatchlist: Record<string, any[]> = {};

        for (const [grp, items] of Object.entries(rawWatchlist)) {
          resolvedWatchlist[grp] = (items || []).map((it) => {
            if (!it) return it;
            const sym = typeof it === "string" ? it : it.symbol;
            const confName = typeof it === "object" ? it.name : undefined;
            let cached: MarketItem | undefined;
            if (quoteCache && sym) {
              const normKey = normalizeSymbolKey(sym);
              const rawTicker = sym.toLowerCase().replace(/^(us|hk|sh|sz|bj)[\._\-]?/i, "");
              cached =
                quoteCache.get(normKey) ||
                quoteCache.get(sym) ||
                quoteCache.get(sym.toLowerCase()) ||
                quoteCache.get(rawTicker);
            }
            const finalName = resolveItemDisplayName(confName, sym, cached);
            return typeof it === "object"
              ? { ...it, name: finalName }
              : { symbol: sym, name: finalName };
          });
        }
        return resolvedWatchlist;
      })(),
    };
  }

  public sendCurrentSettings(): void {
    if (this._panel && this._panel.webview) {
      const data = this._getCurrentSettingsData();
      this._panel.webview.postMessage({ command: "initSettings", data });
    }
  }

  public static syncSettings(): void {
    if (SettingsWebviewPanel.currentPanel) {
      SettingsWebviewPanel.currentPanel.sendCurrentSettings();
    }
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
