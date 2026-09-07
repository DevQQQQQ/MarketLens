// src/ui/settingsWebview.ts
import * as vscode from "vscode";
import { detectAvailableProxy } from "../services/network";

export class SettingsWebviewPanel {
  public static currentPanel: SettingsWebviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _version: string;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, version: string = "1.1.2") {
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

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, version: string = "1.1.2") {
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
            await vscode.workspace
              .getConfiguration("marketlens")
              .update(message.key, message.value, vscode.ConfigurationTarget.Global);
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
            if (message.url) {
              await vscode.env.openExternal(vscode.Uri.parse(message.url));
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
      aShareProxyUrl:           cfg.get<string>("aShare.proxyUrl", "http://127.0.0.1:10808"),
      hkStockEnabled:           cfg.get<boolean>("hkStock.enabled", true),
      hkStockStatusBar:         cfg.get<boolean>("hkStock.statusBar", true),
      hkStockStopOnMarketClosed: cfg.get<boolean>("hkStock.stopOnMarketClosed", true),
      hkStockNetworkMode:       cfg.get<string>("hkStock.networkMode", "direct"),
      hkStockProxyUrl:          cfg.get<string>("hkStock.proxyUrl", "http://127.0.0.1:10808"),
      usStockEnabled:           cfg.get<boolean>("usStock.enabled", true),
      usStockStatusBar:         cfg.get<boolean>("usStock.statusBar", true),
      usStockStopOnMarketClosed: cfg.get<boolean>("usStock.stopOnMarketClosed", true),
      usStockNetworkMode:       cfg.get<string>("usStock.networkMode", "direct"),
      usStockProxyUrl:          cfg.get<string>("usStock.proxyUrl", "http://127.0.0.1:10808"),
      binanceEnabled:           cfg.get<boolean>("binance.enabled", true),
      binanceStatusBar:         cfg.get<boolean>("binance.statusBar", true),
      binanceNetworkMode:       cfg.get<string>("binance.networkMode", "proxy"),
      binanceProxyUrl:          cfg.get<string>("binance.proxyUrl", "http://127.0.0.1:10808"),
      alphaEnabled:             cfg.get<boolean>("alpha.enabled", true),
      alphaStatusBar:           cfg.get<boolean>("alpha.statusBar", true),
      alphaNetworkMode:         cfg.get<string>("alpha.networkMode", "proxy"),
      alphaProxyUrl:            cfg.get<string>("alpha.proxyUrl", "http://127.0.0.1:10808"),
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
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>MarketLens 设置</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --card-bg: var(--vscode-sideBar-background, rgba(255,255,255,0.04));
      --card-border: var(--vscode-widget-border, rgba(255,255,255,0.08));
      --primary: var(--vscode-button-background, #007acc);
      --primary-fg: var(--vscode-button-foreground, #ffffff);
      --hover-bg: var(--vscode-list-hoverBackground, rgba(255,255,255,0.08));
      --active-bg: var(--vscode-list-activeSelectionBackground, #094771);
      --input-bg: var(--vscode-input-background, #252526);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --desc-fg: var(--vscode-descriptionForeground, #858585);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      font-size: 13px;
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    /* ── 左侧侧边导航 ── */
    .sidebar {
      width: 220px;
      border-right: 1px solid var(--card-border);
      padding: 20px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: var(--vscode-sideBar-background);
      user-select: none;
      flex-shrink: 0;
    }
    .brand {
      padding: 4px 10px 16px 10px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 10px;
    }
    .brand h2 { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .brand p { font-size: 11px; color: var(--desc-fg); margin-top: 4px; }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: 6px;
      cursor: pointer;
      color: var(--fg);
      transition: background 0.12s ease, color 0.12s ease;
      user-select: none;
    }
    .nav-item:hover { background: var(--hover-bg); }
    .nav-item.active {
      background: var(--active-bg);
      color: #fff;
      font-weight: 500;
    }
    .nav-item .icon { font-size: 15px; pointer-events: none; }
    .nav-item span { pointer-events: none; }

    /* ── 右侧主内容区 ── */
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 32px 48px;
    }
    .tab-pane {
      display: none;
    }
    .tab-pane.active {
      display: block;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .section-header { margin-bottom: 24px; }
    .section-header h1 { font-size: 20px; font-weight: 600; margin-bottom: 6px; }
    .section-header p { color: var(--desc-fg); font-size: 13px; }

    .card-list { display: flex; flex-direction: column; gap: 14px; max-width: 800px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 18px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .card.hidden-card { display: none !important; }
    .card-info { flex: 1; }
    .card-title { font-size: 14px; font-weight: 500; margin-bottom: 4px; }
    .card-desc { font-size: 12px; color: var(--desc-fg); line-height: 1.5; }

    /* Toggle Switch */
    .switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: var(--input-border); transition: .25s; border-radius: 24px;
    }
    .slider:before {
      position: absolute; content: "";
      height: 18px; width: 18px; left: 3px; bottom: 3px;
      background-color: white; transition: .25s; border-radius: 50%;
    }
    input:checked + .slider { background-color: var(--primary); }
    input:checked + .slider:before { transform: translateX(20px); }

    input[type="text"], input[type="number"] {
      background: var(--input-bg); color: var(--input-fg);
      border: 1px solid var(--input-border);
      padding: 7px 12px; border-radius: 4px; outline: none; font-size: 13px;
    }
    input[type="text"]:focus, input[type="number"]:focus { border-color: var(--primary); }

    .radio-group { display: flex; gap: 14px; align-items: center; }
    .radio-label { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }

    .btn-detect {
      background: var(--hover-bg); color: var(--fg);
      border: 1px solid var(--card-border);
      padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;
      display: inline-flex; align-items: center; gap: 6px; transition: background 0.15s;
    }
    .btn-detect:hover { background: var(--card-border); }
    .proxy-input-box { display: flex; align-items: center; gap: 10px; }

    .security-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #73c991; margin-top: 6px; }
    .direct-tag   { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #3794ff; margin-top: 6px; }

    .shortcut-tag {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--hover-bg);
      border: 1px solid var(--card-border);
      color: var(--desc-fg);
      font-family: monospace;
      font-weight: normal;
    }
    .btn-shortcut {
      background: var(--hover-bg);
      color: var(--fg);
      border: 1px solid var(--card-border);
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s;
    }
    .btn-shortcut:hover {
      background: var(--primary);
      color: var(--primary-fg);
      border-color: var(--primary);
    }
    .btn-restore {
      background: rgba(244, 135, 113, 0.12);
      color: var(--vscode-errorForeground, #f48771);
      border: 1px solid rgba(244, 135, 113, 0.35);
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .btn-restore:hover {
      background: rgba(244, 135, 113, 0.25);
      border-color: rgba(244, 135, 113, 0.6);
      color: #fff;
    }
    .btn-clear {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.35);
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .btn-clear:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: rgba(239, 68, 68, 0.6);
      color: #fff;
    }
    .btn-telegram {
      background: #0088cc;
      color: #ffffff;
      border: 1px solid #0088cc;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .btn-telegram:hover {
      background: #0077b5;
      border-color: #0077b5;
      color: #ffffff;
    }

    .toast {
      position: fixed; bottom: 24px; right: 24px;
      background: #333; color: #fff; padding: 10px 16px;
      border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-size: 12px; opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 999;
    }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>

  <!-- 侧边导航 -->
  <div class="sidebar">
    <div class="brand">
      <h2>📊 MarketLens</h2>
      <p>极客行情与摸鱼配置中心</p>
    </div>
    <div id="nav-general" class="nav-item active"><span class="icon">⚙️</span><span>通用设置</span></div>
    <div id="nav-ashare"  class="nav-item"><span class="icon">🇨🇳</span><span>A股板块</span></div>
    <div id="nav-hkstock" class="nav-item"><span class="icon">🇭🇰</span><span>港股板块</span></div>
    <div id="nav-usstock" class="nav-item"><span class="icon">🇺🇸</span><span>美股板块</span></div>
    <div id="nav-binance" class="nav-item"><span class="icon">🟡</span><span>Binance板块</span></div>
    <div id="nav-alpha"   class="nav-item"><span class="icon">🦄</span><span>Alpha板块</span></div>
    <div id="nav-about"   class="nav-item"><span class="icon">ℹ️</span><span>关于与帮助</span></div>
  </div>

  <!-- 内容区 -->
  <div class="content">

    <!-- 1. 通用设置 -->
    <div id="tab-general" class="tab-pane active">
      <div class="section-header">
        <h1>通用与全局设置</h1>
        <p>控制全局刷新调度、摸鱼模式与视觉脱敏</p>
      </div>
      <div class="card-list">
        <div class="card">
          <div class="card-info">
            <div class="card-title">恢复出厂默认设置</div>
            <div class="card-desc">将所有自选标的列表（A股、港股、美股、Binance、Alpha）恢复为首次安装时的初始预设，并还原所有配置项。</div>
          </div>
          <button class="btn-restore" id="btnRestoreDefaults">🔄 恢复默认设置</button>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">一键清空自选标的</div>
            <div class="card-desc">一键清空当前所有板块（A股、港股、美股、Binance、Alpha）的自选标的，保留板块分类，方便您从零开始自定义添加喜欢的资产。</div>
          </div>
          <button class="btn-clear" id="btnClearWatchlist">🗑️ 一键清空标的</button>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">全部标的参与底部轮播</div>
            <div class="card-desc">控制 VS Code 底部状态栏是否展示行情轮播。关闭后底部状态栏将完全隐藏自选行情。</div>
          </div>
          <label class="switch"><input type="checkbox" id="statusBarEnabled"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">定时自动刷新</div>
            <div class="card-desc">开启后后台周期轮询最新行情；关闭后彻底停止后台拉取，仅在点击刷新按钮时更新。</div>
          </div>
          <label class="switch"><input type="checkbox" id="autoRefresh"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">全局刷新频率 (毫秒)</div>
            <div class="card-desc">自动刷新时间间隔（推荐 3000 ~ 10000 毫秒）。</div>
          </div>
          <input type="number" id="refreshInterval" min="1000" step="500" style="width: 110px;">
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title" style="display: flex; align-items: center; gap: 8px;">
              <span>伪装摸鱼模式</span>
              <span class="shortcut-tag">Ctrl+Alt+K</span>
            </div>
            <div class="card-desc">开启后状态栏伪装为 Git 分支及构建日志（如 <code>git:(main) build: 65.2k</code>），彻底隐蔽。</div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <button class="btn-shortcut" id="btnKeybindMask" title="在 VS Code 中修改此快捷键">⌨️ 自定义快捷键</button>
            <label class="switch"><input type="checkbox" id="maskMode"><span class="slider"></span></label>
          </div>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title" style="display: flex; align-items: center; gap: 8px;">
              <span>颜色脱敏模式</span>
              <span class="shortcut-tag">Ctrl+Alt+C</span>
            </div>
            <div class="card-desc">开启后所有涨跌数值使用编辑器默认中性颜色，关闭红绿配色刺激，防止旁观者察觉。</div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <button class="btn-shortcut" id="btnKeybindColor" title="在 VS Code 中修改此快捷键">⌨️ 自定义快捷键</button>
            <label class="switch"><input type="checkbox" id="colorNeutral"><span class="slider"></span></label>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. A 股板块 -->
    <div id="tab-ashare" class="tab-pane">
      <div class="section-header">
        <h1>A股市场设置</h1>
        <p>配置沪深京全市场股票与指数的抓取策略</p>
      </div>
      <div class="card-list">
        <div class="card">
          <div class="card-info">
            <div class="card-title">启用 A 股分组</div>
            <div class="card-desc">是否在左侧看板展示 A 股相关自选分组。</div>
          </div>
          <label class="switch"><input type="checkbox" id="aShareEnabled"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">A股标的参与底部轮播</div>
            <div class="card-desc">控制 A 股自选标的是否在 VS Code 底部状态栏循环轮播展示。</div>
          </div>
          <label class="switch"><input type="checkbox" id="aShareStatusBar"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">A股闭市期间停止轮询</div>
            <div class="card-desc">开启后仅在 A 股交易时段（北京时间 9:15–11:30, 13:00–15:05）请求数据，休市与周末停止拉取。</div>
          </div>
          <label class="switch"><input type="checkbox" id="aShareStopOnMarketClosed"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">网络访问模式</div>
            <div class="card-desc">
              腾讯财经接口属于境内正规服务，推荐选择<b>直连</b>（零延迟）。
              <div id="aShareNetTag" class="direct-tag">⚡ 当前为境内直连（推荐）</div>
            </div>
          </div>
          <div class="radio-group">
            <label class="radio-label"><input type="radio" name="aShareNetwork" value="direct" id="aShareNetDirect"> 直连 (默认)</label>
            <label class="radio-label"><input type="radio" name="aShareNetwork" value="proxy"  id="aShareNetProxy"> 强制代理</label>
          </div>
        </div>

        <div class="card" id="aShareProxyCard">
          <div class="card-info">
            <div class="card-title">A股代理地址</div>
            <div class="card-desc">指定 A 股请求所使用的代理服务器。</div>
          </div>
          <div class="proxy-input-box">
            <input type="text" id="aShareProxyUrl" style="width: 220px;">
            <button class="btn-detect" id="btnDetectAshare">⚡ 探测代理</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 港股板块 -->
    <div id="tab-hkstock" class="tab-pane">
      <div class="section-header">
        <h1>港股市场设置 (HK Stocks)</h1>
        <p>配置港股市场（腾讯控股、美团、阿里巴巴等）的抓取策略</p>
      </div>
      <div class="card-list">
        <div class="card">
          <div class="card-info">
            <div class="card-title">启用港股分组</div>
            <div class="card-desc">是否在左侧看板展示港股相关自选分组。</div>
          </div>
          <label class="switch"><input type="checkbox" id="hkStockEnabled"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">港股标的参与底部轮播</div>
            <div class="card-desc">控制港股自选标的是否在 VS Code 底部状态栏循环轮播展示。</div>
          </div>
          <label class="switch"><input type="checkbox" id="hkStockStatusBar"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">港股闭市期间停止轮询</div>
            <div class="card-desc">开启后仅在港股交易时段（北京时间 9:30–12:00, 13:00–16:10）请求数据，休市与周末停止拉取。</div>
          </div>
          <label class="switch"><input type="checkbox" id="hkStockStopOnMarketClosed"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">网络访问模式</div>
            <div class="card-desc">
              腾讯财经港股行情源境内畅通，推荐选择<b>直连</b>（零延迟）。
              <div id="hkStockNetTag" class="direct-tag">⚡ 当前为境内直连（推荐）</div>
            </div>
          </div>
          <div class="radio-group">
            <label class="radio-label"><input type="radio" name="hkStockNetwork" value="direct" id="hkStockNetDirect"> 直连 (默认)</label>
            <label class="radio-label"><input type="radio" name="hkStockNetwork" value="proxy"  id="hkStockNetProxy"> 强制代理</label>
          </div>
        </div>

        <div class="card" id="hkStockProxyCard">
          <div class="card-info">
            <div class="card-title">港股代理地址</div>
            <div class="card-desc">指定港股请求所使用的代理服务器。</div>
          </div>
          <div class="proxy-input-box">
            <input type="text" id="hkStockProxyUrl" style="width: 220px;">
            <button class="btn-detect" id="btnDetectHkStock">⚡ 探测代理</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. 美股板块 -->
    <div id="tab-usstock" class="tab-pane">
      <div class="section-header">
        <h1>美股市场设置 (US Stocks)</h1>
        <p>配置美股纳斯达克、标普与道琼斯标的（苹果、英伟达、特斯拉等）的抓取策略</p>
      </div>
      <div class="card-list">
        <div class="card">
          <div class="card-info">
            <div class="card-title">启用美股分组</div>
            <div class="card-desc">是否在左侧看板展示美股相关自选分组。</div>
          </div>
          <label class="switch"><input type="checkbox" id="usStockEnabled"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">美股标的参与底部轮播</div>
            <div class="card-desc">控制美股自选标的是否在 VS Code 底部状态栏循环轮播展示。</div>
          </div>
          <label class="switch"><input type="checkbox" id="usStockStatusBar"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">美股闭市期间停止轮询</div>
            <div class="card-desc">开启后仅在美股交易时段（北京时间工作日 21:00 至次日凌晨 5:00）请求数据，非交易时段展示收盘价。</div>
          </div>
          <label class="switch"><input type="checkbox" id="usStockStopOnMarketClosed"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">网络访问模式</div>
            <div class="card-desc">
              腾讯财经美股行情源支持境内直连，亦支持强制走代理。
              <div id="usStockNetTag" class="direct-tag">⚡ 当前为直连访问</div>
            </div>
          </div>
          <div class="radio-group">
            <label class="radio-label"><input type="radio" name="usStockNetwork" value="direct" id="usStockNetDirect"> 直连 (默认)</label>
            <label class="radio-label"><input type="radio" name="usStockNetwork" value="proxy"  id="usStockNetProxy"> 强制代理</label>
          </div>
        </div>

        <div class="card" id="usStockProxyCard">
          <div class="card-info">
            <div class="card-title">美股代理地址</div>
            <div class="card-desc">指定美股请求所使用的代理服务器。</div>
          </div>
          <div class="proxy-input-box">
            <input type="text" id="usStockProxyUrl" style="width: 220px;">
            <button class="btn-detect" id="btnDetectUsStock">⚡ 探测代理</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Binance 板块 -->
    <div id="tab-binance" class="tab-pane">
      <div class="section-header">
        <h1>Binance 加密货币设置</h1>
        <p>配置币安主流代币的抓取与网络安全代理</p>
      </div>
      <div class="card-list">
        <div class="card">
          <div class="card-info">
            <div class="card-title">启用 Binance 分组</div>
            <div class="card-desc">是否在侧边栏显示主流加密货币行情（BTC、ETH 等）。</div>
          </div>
          <label class="switch"><input type="checkbox" id="binanceEnabled"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">Binance标的参与底部轮播</div>
            <div class="card-desc">控制 Binance 主流代币是否在 VS Code 底部状态栏循环轮播展示。</div>
          </div>
          <label class="switch"><input type="checkbox" id="binanceStatusBar"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">网络访问模式 (防公司审计)</div>
            <div class="card-desc">
              在公司网络下强烈建议保持<b>强制代理</b>，插件将绝对阻止直连包，杜绝网关产生访问记录。
              <div id="binanceNetTag" class="security-tag">🛡️ 已启用杜绝直连保护</div>
            </div>
          </div>
          <div class="radio-group">
            <label class="radio-label"><input type="radio" name="binanceNetwork" value="proxy"  id="binanceNetProxy"> 强制代理 (默认)</label>
            <label class="radio-label"><input type="radio" name="binanceNetwork" value="direct" id="binanceNetDirect"> 直连</label>
          </div>
        </div>

        <div class="card" id="binanceProxyCard">
          <div class="card-info">
            <div class="card-title">代理地址</div>
            <div class="card-desc">若使用 Clash/Verge (7890/7897) 或其他工具，可直接输入或点击按钮自动探测。</div>
          </div>
          <div class="proxy-input-box">
            <input type="text" id="binanceProxyUrl" style="width: 220px;">
            <button class="btn-detect" id="btnDetectBinance">⚡ 探测代理</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. Alpha 板块 -->
    <div id="tab-alpha" class="tab-pane">
      <div class="section-header">
        <h1>Alpha 链上 DEX 设置</h1>
        <p>配置全链新币（BSC、Solana、Base、以太坊等）与网络代理</p>
      </div>
      <div class="card-list">
        <div class="card">
          <div class="card-info">
            <div class="card-title">启用 Alpha 分组</div>
            <div class="card-desc">是否在侧边栏展示链上 DEX 代币行情。</div>
          </div>
          <label class="switch"><input type="checkbox" id="alphaEnabled"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">Alpha标的参与底部轮播</div>
            <div class="card-desc">控制 Alpha 链上代币是否在 VS Code 底部状态栏循环轮播展示。</div>
          </div>
          <label class="switch"><input type="checkbox" id="alphaStatusBar"><span class="slider"></span></label>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">网络访问模式 (防公司审计)</div>
            <div class="card-desc">
              访问 DexScreener 全球链上聚合接口。建议保持<b>强制代理</b>，防止公司网关检测。
              <div id="alphaNetTag" class="security-tag">🛡️ 已启用杜绝直连保护</div>
            </div>
          </div>
          <div class="radio-group">
            <label class="radio-label"><input type="radio" name="alphaNetwork" value="proxy"  id="alphaNetProxy"> 强制代理 (默认)</label>
            <label class="radio-label"><input type="radio" name="alphaNetwork" value="direct" id="alphaNetDirect"> 直连</label>
          </div>
        </div>

        <div class="card" id="alphaProxyCard">
          <div class="card-info">
            <div class="card-title">代理地址</div>
            <div class="card-desc">指定 Alpha 代币请求走哪一个代理端口。</div>
          </div>
          <div class="proxy-input-box">
            <input type="text" id="alphaProxyUrl" style="width: 220px;">
            <button class="btn-detect" id="btnDetectAlpha">⚡ 探测代理</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. 关于 -->
    <div id="tab-about" class="tab-pane">
      <div class="section-header">
        <h1>关于 MarketLens</h1>
        <p>极致摸鱼，从容盯盘</p>
      </div>
      <div class="card-list">
        <div class="card">
          <div class="card-info">
            <div class="card-title">快捷键提示</div>
            <div class="card-desc">
              • <b>老板键一键隐蔽/恢复</b>: <code>Ctrl + Alt + M</code> 或 <code>Alt + M</code> (Mac: <code>Cmd + Alt + M</code>)<br>
              • <b>伪装摸鱼模式开关</b>: <code>Ctrl + Alt + K</code> 或 <code>Alt + K</code> (Mac: <code>Cmd + Alt + K</code>)<br>
              • <b>颜色脱敏模式开关</b>: <code>Ctrl + Alt + C</code> 或 <code>Alt + C</code> (Mac: <code>Cmd + Alt + C</code>)<br>
              • <b>悬停详情卡片</b>: 鼠标放至任意资产上，即可查看今开、昨收、高低、涨跌与成交额。
            </div>
          </div>
          <button class="btn-shortcut" id="btnKeybindAll">⌨️ 打开全局快捷键设置</button>
        </div>
        <div class="card">
          <div class="card-info">
            <div class="card-title">问题反馈与社区交流</div>
            <div class="card-desc">遇到 Bug、行情数据异常或有新功能建议？欢迎加入官方 Telegram 交流群，或直接联系作者个人 TG 交流反馈。</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <button class="btn-telegram" id="btnJoinTelegram" style="width: 175px; justify-content: center;">✈️ 进入 Telegram 交流群</button>
              <button class="btn-shortcut" id="btnCopyTelegram" title="复制群链接到剪贴板">📋 复制链接</button>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button class="btn-telegram" id="btnJoinPersonalTelegram" style="width: 175px; justify-content: center; background: #2AABEE; border-color: #2AABEE;">💬 联系作者个人 TG</button>
              <button class="btn-shortcut" id="btnCopyPersonalTelegram" title="复制个人链接到剪贴板">📋 复制链接</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-info">
            <div class="card-title">版本信息</div>
            <div class="card-desc">MarketLens v${this._version.replace(/^v/i, "")} · 由 DevQQQQQ 打造</div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <div id="toast" class="toast"></div>

  <script nonce="${nonce}">
    (function() {
      var vscode = acquireVsCodeApi();

      // ── Tab 切换逻辑 ──
      var TABS = [
        { navId: 'nav-general', paneId: 'tab-general' },
        { navId: 'nav-ashare',  paneId: 'tab-ashare' },
        { navId: 'nav-hkstock', paneId: 'tab-hkstock' },
        { navId: 'nav-usstock', paneId: 'tab-usstock' },
        { navId: 'nav-binance', paneId: 'tab-binance' },
        { navId: 'nav-alpha',   paneId: 'tab-alpha' },
        { navId: 'nav-about',   paneId: 'tab-about' }
      ];

      function switchTab(targetPaneId) {
        for (var i = 0; i < TABS.length; i++) {
          var t = TABS[i];
          var navEl = document.getElementById(t.navId);
          var paneEl = document.getElementById(t.paneId);
          if (navEl) {
            if (t.paneId === targetPaneId) {
              navEl.classList.add('active');
            } else {
              navEl.classList.remove('active');
            }
          }
          if (paneEl) {
            if (t.paneId === targetPaneId) {
              paneEl.classList.add('active');
            } else {
              paneEl.classList.remove('active');
            }
          }
        }
      }

      for (var j = 0; j < TABS.length; j++) {
        (function(targetId) {
          var el = document.getElementById(targetId.navId);
          if (el) {
            el.addEventListener('click', function() {
              switchTab(targetId.paneId);
            });
          }
        })(TABS[j]);
      }

      // ── Toast 提示 ──
      function showToast(msg) {
        var t = document.getElementById('toast');
        if (!t) return;
        t.innerText = msg;
        t.classList.add('show');
        setTimeout(function() { t.classList.remove('show'); }, 2500);
      }

      // ── 通信函数 ──
      function sendUpdate(key, value) {
        vscode.postMessage({ command: 'updateSetting', key: key, value: value });
      }

      // ── 代理卡片显隐控制 ──
      function applyProxyCardVisibility(section, mode) {
        var card = document.getElementById(section + 'ProxyCard');
        var tag  = document.getElementById(section + 'NetTag');
        if (mode === 'direct') {
          if (card) card.classList.add('hidden-card');
          if (tag) {
            tag.className = 'direct-tag';
            tag.innerHTML = '⚡ 已切换为直连访问';
          }
        } else {
          if (card) card.classList.remove('hidden-card');
          if (tag) {
            tag.className = 'security-tag';
            tag.innerHTML = '🛡️ 已启用杜绝直连保护';
          }
        }
      }

      function handleNetChange(section, mode) {
        sendUpdate(section + '.networkMode', mode);
        applyProxyCardVisibility(section, mode);
      }

      // ── 事件绑定辅助 ──
      function on(id, evt, fn) {
        var el = document.getElementById(id);
        if (el) el.addEventListener(evt, fn);
      }

      // 通用
      on('btnRestoreDefaults', 'click', function() {
        vscode.postMessage({ command: 'restoreDefaults' });
      });
      on('btnClearWatchlist', 'click', function() {
        vscode.postMessage({ command: 'clearWatchlist' });
      });
      on('autoRefresh', 'change', function() { sendUpdate('autoRefresh', this.checked); });
      on('refreshInterval', 'change', function() {
        var val = parseInt(this.value, 10);
        if (!isNaN(val) && val >= 1000) sendUpdate('refreshInterval', val);
      });
      on('maskMode', 'change', function() { sendUpdate('maskMode', this.checked); });
      on('colorNeutral', 'change', function() { sendUpdate('colorNeutral', this.checked); });
      on('statusBarEnabled', 'change', function() { sendUpdate('statusBar.enabled', this.checked); });

      // 自定义快捷键跳转
      on('btnKeybindMask', 'click', function() {
        vscode.postMessage({ command: 'openKeybindings', query: 'marketlens.toggleMask' });
      });
      on('btnKeybindColor', 'click', function() {
        vscode.postMessage({ command: 'openKeybindings', query: 'marketlens.toggleColorNeutral' });
      });
      on('btnKeybindAll', 'click', function() {
        vscode.postMessage({ command: 'openKeybindings', query: 'marketlens' });
      });

      // Telegram 社区交流与反馈
      on('btnJoinTelegram', 'click', function() {
        vscode.postMessage({ command: 'openExternal', url: 'https://t.me/+-eZR0R--jyUwN2Nl' });
      });
      on('btnCopyTelegram', 'click', function() {
        vscode.postMessage({ command: 'copyToClipboard', text: 'https://t.me/+-eZR0R--jyUwN2Nl' });
        showToast('📋 已复制 Telegram 群链接');
      });
      on('btnJoinPersonalTelegram', 'click', function() {
        vscode.postMessage({ command: 'openExternal', url: 'https://t.me/Dev_QQQQQ' });
      });
      on('btnCopyPersonalTelegram', 'click', function() {
        vscode.postMessage({ command: 'copyToClipboard', text: 'https://t.me/Dev_QQQQQ' });
        showToast('📋 已复制作者个人 TG 链接');
      });

      // A股
      on('aShareEnabled', 'change', function() { sendUpdate('aShare.enabled', this.checked); });
      on('aShareStatusBar', 'change', function() { sendUpdate('aShare.statusBar', this.checked); });
      on('aShareStopOnMarketClosed', 'change', function() { sendUpdate('aShare.stopOnMarketClosed', this.checked); });
      on('aShareNetDirect', 'change', function() { handleNetChange('aShare', 'direct'); });
      on('aShareNetProxy', 'change', function() { handleNetChange('aShare', 'proxy'); });
      on('aShareProxyUrl', 'blur', function() { handleProxyBlur('aShare.proxyUrl', this); });
      on('btnDetectAshare', 'click', function() { triggerDetect('aShare'); });

      // 港股
      on('hkStockEnabled', 'change', function() { sendUpdate('hkStock.enabled', this.checked); });
      on('hkStockStatusBar', 'change', function() { sendUpdate('hkStock.statusBar', this.checked); });
      on('hkStockStopOnMarketClosed', 'change', function() { sendUpdate('hkStock.stopOnMarketClosed', this.checked); });
      on('hkStockNetDirect', 'change', function() { handleNetChange('hkStock', 'direct'); });
      on('hkStockNetProxy', 'change', function() { handleNetChange('hkStock', 'proxy'); });
      on('hkStockProxyUrl', 'blur', function() { handleProxyBlur('hkStock.proxyUrl', this); });
      on('btnDetectHkStock', 'click', function() { triggerDetect('hkStock'); });

      // 美股
      on('usStockEnabled', 'change', function() { sendUpdate('usStock.enabled', this.checked); });
      on('usStockStatusBar', 'change', function() { sendUpdate('usStock.statusBar', this.checked); });
      on('usStockStopOnMarketClosed', 'change', function() { sendUpdate('usStock.stopOnMarketClosed', this.checked); });
      on('usStockNetDirect', 'change', function() { handleNetChange('usStock', 'direct'); });
      on('usStockNetProxy', 'change', function() { handleNetChange('usStock', 'proxy'); });
      on('usStockProxyUrl', 'blur', function() { handleProxyBlur('usStock.proxyUrl', this); });
      on('btnDetectUsStock', 'click', function() { triggerDetect('usStock'); });

      // Binance
      on('binanceEnabled', 'change', function() { sendUpdate('binance.enabled', this.checked); });
      on('binanceStatusBar', 'change', function() { sendUpdate('binance.statusBar', this.checked); });
      on('binanceNetDirect', 'change', function() { handleNetChange('binance', 'direct'); });
      on('binanceNetProxy', 'change', function() { handleNetChange('binance', 'proxy'); });
      on('binanceProxyUrl', 'blur', function() { handleProxyBlur('binance.proxyUrl', this); });
      on('btnDetectBinance', 'click', function() { triggerDetect('binance'); });

      // Alpha
      on('alphaEnabled', 'change', function() { sendUpdate('alpha.enabled', this.checked); });
      on('alphaStatusBar', 'change', function() { sendUpdate('alpha.statusBar', this.checked); });
      on('alphaNetDirect', 'change', function() { handleNetChange('alpha', 'direct'); });
      on('alphaNetProxy', 'change', function() { handleNetChange('alpha', 'proxy'); });
      on('alphaProxyUrl', 'blur', function() { handleProxyBlur('alpha.proxyUrl', this); });
      on('btnDetectAlpha', 'click', function() { triggerDetect('alpha'); });

      function handleProxyBlur(key, input) {
        var val = input.value.trim();
        if (!val) {
          val = 'http://127.0.0.1:10808';
          input.value = val;
          showToast('⚠️ 代理地址不能为空，已恢复默认');
        } else if (val.indexOf('http://') !== 0 && val.indexOf('https://') !== 0) {
          val = 'http://' + val;
          input.value = val;
        }
        sendUpdate(key, val);
      }

      function triggerDetect(target) {
        showToast('正在探测本机活跃代理端口...');
        vscode.postMessage({ command: 'detectProxy', target: target });
      }

      // ── 接收数据同步 ──
      window.addEventListener('message', function(event) {
        var msg = event.data;
        if (!msg) return;

        if (msg.command === 'initSettings') {
          var d = msg.data;
          if (!d) return;

          function setChecked(id, val) { var el = document.getElementById(id); if (el) el.checked = !!val; }
          function setValue(id, val)   { var el = document.getElementById(id); if (el) el.value = val; }

          setChecked('autoRefresh',      d.autoRefresh);
          setValue('refreshInterval',    d.refreshInterval);
          setChecked('maskMode',         d.maskMode);
          setChecked('colorNeutral',     d.colorNeutral);
          setChecked('statusBarEnabled', d.statusBarEnabled);

          // A股
          setChecked('aShareEnabled',            d.aShareEnabled);
          setChecked('aShareStatusBar',          d.aShareStatusBar);
          setChecked('aShareStopOnMarketClosed',  d.aShareStopOnMarketClosed);
          if (d.aShareNetworkMode === 'proxy') {
            setChecked('aShareNetProxy', true);
            applyProxyCardVisibility('aShare', 'proxy');
          } else {
            setChecked('aShareNetDirect', true);
            applyProxyCardVisibility('aShare', 'direct');
          }
          setValue('aShareProxyUrl', d.aShareProxyUrl);

          // 港股
          setChecked('hkStockEnabled',            d.hkStockEnabled);
          setChecked('hkStockStatusBar',          d.hkStockStatusBar);
          setChecked('hkStockStopOnMarketClosed',  d.hkStockStopOnMarketClosed);
          if (d.hkStockNetworkMode === 'proxy') {
            setChecked('hkStockNetProxy', true);
            applyProxyCardVisibility('hkStock', 'proxy');
          } else {
            setChecked('hkStockNetDirect', true);
            applyProxyCardVisibility('hkStock', 'direct');
          }
          setValue('hkStockProxyUrl', d.hkStockProxyUrl);

          // 美股
          setChecked('usStockEnabled',            d.usStockEnabled);
          setChecked('usStockStatusBar',          d.usStockStatusBar);
          setChecked('usStockStopOnMarketClosed',  d.usStockStopOnMarketClosed);
          if (d.usStockNetworkMode === 'proxy') {
            setChecked('usStockNetProxy', true);
            applyProxyCardVisibility('usStock', 'proxy');
          } else {
            setChecked('usStockNetDirect', true);
            applyProxyCardVisibility('usStock', 'direct');
          }
          setValue('usStockProxyUrl', d.usStockProxyUrl);

          // Binance
          setChecked('binanceEnabled',   d.binanceEnabled);
          setChecked('binanceStatusBar', d.binanceStatusBar);
          if (d.binanceNetworkMode === 'proxy') {
            setChecked('binanceNetProxy', true);
            applyProxyCardVisibility('binance', 'proxy');
          } else {
            setChecked('binanceNetDirect', true);
            applyProxyCardVisibility('binance', 'direct');
          }
          setValue('binanceProxyUrl', d.binanceProxyUrl);

          // Alpha
          setChecked('alphaEnabled',   d.alphaEnabled);
          setChecked('alphaStatusBar', d.alphaStatusBar);
          if (d.alphaNetworkMode === 'proxy') {
            setChecked('alphaNetProxy', true);
            applyProxyCardVisibility('alpha', 'proxy');
          } else {
            setChecked('alphaNetDirect', true);
            applyProxyCardVisibility('alpha', 'direct');
          }
          setValue('alphaProxyUrl', d.alphaProxyUrl);

        } else if (msg.command === 'proxyDetected') {
          if (msg.url) {
            var input = document.getElementById(msg.target + 'ProxyUrl');
            if (input) {
              input.value = msg.url;
              sendUpdate(msg.target + '.proxyUrl', msg.url);
            }
            showToast('✅ 成功匹配可用代理端口: ' + msg.url);
          } else {
            showToast('❌ 未探测到活跃代理');
          }
        }
      });

      // 发起数据获取
      vscode.postMessage({ command: 'getSettings' });
    })();
  </script>
</body>
</html>`;
  }
}