// src/extension.ts
import * as vscode from "vscode";
import { MarketManager } from "./services/marketManager";
import { WatchlistProvider } from "./ui/watchlistProvider";
import { StatusBar } from "./ui/statusBar";
import { logger } from "./utils/logger";
import { resetProxyCache } from "./services/network";
import { readConfig, getWatchlistFingerprint } from "./utils/config";
import { RefreshScheduler } from "./scheduler";
import { WatchlistOps } from "./watchlistOps";
import { registerCommands } from "./commands";
import { SettingsWebviewPanel } from "./ui/settingsWebview";
import { MarketLensConfig } from "./types";

// ── 模块级句柄：让 deactivate() 可以显式清理，防止热重载内存泄漏 ──
let _scheduler: RefreshScheduler | undefined;
let _statusBar: StatusBar | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.init(context);
  logger.info("MarketLens 正在激活...");

  let config = readConfig();

  const marketManager = new MarketManager();
  const treeProvider  = new WatchlistProvider(config.maskMode, config.colorNeutral, config.colorScheme);
  const statusBar     = new StatusBar({
    maskMode:     config.maskMode,
    colorNeutral: config.colorNeutral,
    colorScheme:  config.colorScheme,
  });
  if (config.statusBar?.enabled === false) {
    statusBar.hide();
  }

  // 绑定到模块级变量，使 deactivate() 可以显式清理
  _statusBar = statusBar;

  const treeView = vscode.window.createTreeView("marketlens.watchlist", {
    treeDataProvider: treeProvider,
    dragAndDropController: treeProvider,
    showCollapseAll: true,
    canSelectMany: true,
  });

  const scheduler = new RefreshScheduler({
    marketManager,
    treeProvider,
    statusBar,
    treeView,
  });
  _scheduler = scheduler;
  SettingsWebviewPanel.getQuoteCache = () => scheduler.quoteCache;

  const watchlistOps = new WatchlistOps({
    quoteCache: scheduler.quoteCache,
    rebuildTree: (customWatchlist) => scheduler.rebuildTree(customWatchlist),
  });

  // 恢复持久化的各分组排序模式并监听变更
  const savedSortModes = context.globalState.get<Record<string, import("./types").GroupSortMode>>(
    "marketlens.groupSortModes",
    {}
  );
  treeProvider.setAllGroupSortModes(savedSortModes);
  treeProvider.onGroupSortModeChangeCallback = async () => {
    await context.globalState.update(
      "marketlens.groupSortModes",
      treeProvider.getAllGroupSortModes()
    );
  };

  // 绑定拖拽排序回调（支持多选原子批量重排与单项兼容）
  treeProvider.onBatchReorderCallback = (items, targetGroup, targetSymbol) =>
    watchlistOps.handleBatchReorder(items, targetGroup, targetSymbol);
  treeProvider.onReorderCallback = (sourceGroup, sourceSymbol, targetGroup, targetSymbol) =>
    watchlistOps.handleReorder(sourceGroup, sourceSymbol, targetGroup, targetSymbol);

  // 立即构建初版树骨架（展示配置中的所有分组和标的，无需等待首次网络请求返回）
  scheduler.rebuildTree();

  // 当用户展开侧边栏视图时，立即唤醒刷新一次保证最新数据
  context.subscriptions.push(
    treeView.onDidChangeVisibility((e) => {
      if (e.visible) {
        void scheduler.refresh(true);
      }
    })
  );

  // 注册所有命令
  registerCommands(context, {
    scheduler,
    watchlistOps,
    statusBar,
    treeProvider,
  });

  function applyStatusBarToAllSections(cfg: MarketLensConfig, enabled: boolean): void {
    cfg.statusBar.enabled = enabled;
    cfg.aShare.statusBar = enabled;
    cfg.hkStock.statusBar = enabled;
    cfg.usStock.statusBar = enabled;
    cfg.binance.statusBar = enabled;
    cfg.alpha.statusBar = enabled;
  }

  function applyProxyToAllSections(cfg: MarketLensConfig, proxyUrl: string, port?: number): void {
    if (port !== undefined) {
      cfg.proxyPort = port;
    } else {
      try {
        const u = new URL(proxyUrl);
        if (u.port) {
          cfg.proxyPort = parseInt(u.port, 10);
        }
      } catch (_) {}
    }
    cfg.proxyUrl = proxyUrl;
    cfg.aShare.proxyUrl = proxyUrl;
    cfg.hkStock.proxyUrl = proxyUrl;
    cfg.usStock.proxyUrl = proxyUrl;
    cfg.binance.proxyUrl = proxyUrl;
    cfg.alpha.proxyUrl = proxyUrl;
  }

  // 监听 Webview 设置面板即时操作（0延迟同步更新内存，无需等待异步磁盘 I/O）
  SettingsWebviewPanel.onDidUpdateSetting = (key: string, value: any) => {
    if (key === "restoreDefaults") {
      config = readConfig();
      config.alerts = {};
      scheduler.alertManager.resetCooldown();
      treeProvider.setAlerts({});
      treeProvider.setAllGroupSortModes({});
      void context.globalState.update("marketlens.groupSortModes", {});
      scheduler.updateStatusBar(config);
      scheduler.rebuildTree(undefined, config);
      SettingsWebviewPanel.syncSettings();
      return;
    }

    if (key === "alerts") {
      config.alerts = value || {};
      treeProvider.setAlerts(config.alerts);
      scheduler.rebuildTree(undefined, config);
      SettingsWebviewPanel.syncSettings();
      return;
    }

    if (key === "watchlist") {
      config.watchlist = value;
      scheduler.updateStatusBar(config);
      scheduler.rebuildTree(value, config);
      return;
    }

    if (key === "statusBar.enabled") {
      applyStatusBarToAllSections(config, !!value);
    } else if (key === "maskMode") {
      config.maskMode = !!value;
      statusBar.setMaskMode(config.maskMode);
      treeProvider.setMaskMode(config.maskMode);
    } else if (key === "colorNeutral") {
      config.colorNeutral = !!value;
      statusBar.setColorNeutral(config.colorNeutral);
      treeProvider.setColorNeutral(config.colorNeutral);
    } else if (key === "colorScheme") {
      config.colorScheme = value || "greenUpRedDown";
      config.colorNeutral = false;
      statusBar.setColorNeutral(false);
      treeProvider.setColorNeutral(false);
      statusBar.setColorScheme(config.colorScheme);
      treeProvider.setColorScheme(config.colorScheme);
    } else if (key === "autoRefresh") {
      config.autoRefresh = !!value;
      if (!config.autoRefresh) {
        scheduler.stop();
      }
    } else if (key === "refreshInterval") {
      config.refreshInterval = Number(value) || 5000;
    } else if (key === "proxyPort") {
      const port = Number(value) || 10808;
      applyProxyToAllSections(config, `http://127.0.0.1:${port}`, port);
      resetProxyCache();
    } else if (key === "proxyUrl") {
      const pUrl = String(value || "http://127.0.0.1:10808");
      applyProxyToAllSections(config, pUrl);
      resetProxyCache();
    } else if (key === "alertNotificationMode") {
      config.alertNotificationMode = value || "notification";
    } else if (key === "alertCooldownMinutes") {
      config.alertCooldownMinutes = Number(value) || 15;
    }

    const dotIndex = key.indexOf(".");
    if (dotIndex > 0) {
      const section = key.slice(0, dotIndex) as "aShare" | "hkStock" | "usStock" | "binance" | "alpha";
      const field = key.slice(dotIndex + 1);
      if (config[section] && field in config[section]) {
        (config[section] as any)[field] = value;
        if (field === "statusBar") {
          const anyActive =
            config.aShare.statusBar !== false ||
            config.hkStock.statusBar !== false ||
            config.usStock.statusBar !== false ||
            config.binance.statusBar !== false ||
            config.alpha.statusBar !== false;
          config.statusBar.enabled = anyActive;
        }
      }
    }

    scheduler.updateStatusBar(config);
    scheduler.rebuildTree(undefined, config);
  };

  // 配置变更监听
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("marketlens")) {
        const prevFingerprint = getWatchlistFingerprint(config.watchlist);
        config = readConfig();

        if (e.affectsConfiguration("marketlens.colorScheme") && !e.affectsConfiguration("marketlens.colorNeutral")) {
          const cfg = vscode.workspace.getConfiguration("marketlens");
          if (cfg.get<boolean>("colorNeutral")) {
            void cfg.update("colorNeutral", false, vscode.ConfigurationTarget.Global);
            config.colorNeutral = false;
          }
        }

        const isBossActive = statusBar.isBossKeyActive();
        treeProvider.setBossKey(isBossActive);
        treeProvider.setMaskMode(config.maskMode);
        treeProvider.setColorNeutral(config.colorNeutral);
        treeProvider.setColorScheme(config.colorScheme);
        treeProvider.setAlerts(config.alerts || {});
        statusBar.setMaskMode(config.maskMode);
        statusBar.setColorNeutral(config.colorNeutral);
        statusBar.setColorScheme(config.colorScheme);

        scheduler.updateStatusBar(config);
        scheduler.rebuildTree();
        SettingsWebviewPanel.syncSettings();

        // 仅在网络/轮询周期/板块开关变动，或自选列表发生实际标的增删时才重启定时器并触发网络拉取
        // 纯 UI 配置（如 maskMode, colorNeutral, statusBar）或同组拖拽、跨组移动完全不重复打全量网络（标的报价已在内存缓存中）
        const affectsNetwork =
          e.affectsConfiguration("marketlens.proxyPort") ||
          e.affectsConfiguration("marketlens.proxyUrl") ||
          e.affectsConfiguration("marketlens.autoRefresh") ||
          e.affectsConfiguration("marketlens.refreshInterval") ||
          e.affectsConfiguration("marketlens.aShare.enabled") ||
          e.affectsConfiguration("marketlens.aShare.networkMode") ||
          e.affectsConfiguration("marketlens.aShare.proxyUrl") ||
          e.affectsConfiguration("marketlens.aShare.stopOnMarketClosed") ||
          e.affectsConfiguration("marketlens.hkStock.enabled") ||
          e.affectsConfiguration("marketlens.hkStock.networkMode") ||
          e.affectsConfiguration("marketlens.hkStock.proxyUrl") ||
          e.affectsConfiguration("marketlens.hkStock.stopOnMarketClosed") ||
          e.affectsConfiguration("marketlens.usStock.enabled") ||
          e.affectsConfiguration("marketlens.usStock.networkMode") ||
          e.affectsConfiguration("marketlens.usStock.proxyUrl") ||
          e.affectsConfiguration("marketlens.usStock.stopOnMarketClosed") ||
          e.affectsConfiguration("marketlens.binance.enabled") ||
          e.affectsConfiguration("marketlens.binance.networkMode") ||
          e.affectsConfiguration("marketlens.binance.proxyUrl") ||
          e.affectsConfiguration("marketlens.alpha.enabled") ||
          e.affectsConfiguration("marketlens.alpha.networkMode") ||
          e.affectsConfiguration("marketlens.alpha.proxyUrl");

        const watchlistContentChanged = prevFingerprint !== getWatchlistFingerprint(config.watchlist);

        if (affectsNetwork || watchlistContentChanged) {
          resetProxyCache();
          marketManager.clearInvalidCache();
          scheduler.start();
        }
      }
    })
  );

  // 注册生命周期清理：statusBar, treeView, treeProvider, 调度器释放
  context.subscriptions.push(statusBar, treeView, treeProvider, scheduler);

  scheduler.start();
  logger.info("activated ✓");
}

export function deactivate(): void {
  SettingsWebviewPanel.onDidUpdateSetting = undefined;
  SettingsWebviewPanel.getQuoteCache = undefined;

  _scheduler?.dispose();
  _scheduler = undefined;

  _statusBar?.dispose();
  _statusBar = undefined;

  logger.info("deactivated");
}