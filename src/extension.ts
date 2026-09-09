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

// ── 模块级句柄：让 deactivate() 可以显式清理，防止热重载内存泄漏 ──
let _scheduler: RefreshScheduler | undefined;
let _statusBar: StatusBar | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.init(context);
  logger.info("MarketLens 正在激活...");

  let config = readConfig();

  const marketManager = new MarketManager();
  const treeProvider  = new WatchlistProvider(config.maskMode, config.colorNeutral);
  const statusBar     = new StatusBar({
    maskMode:     config.maskMode,
    colorNeutral: config.colorNeutral,
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
  });

  const scheduler = new RefreshScheduler({
    marketManager,
    treeProvider,
    statusBar,
    treeView,
  });
  _scheduler = scheduler;

  const watchlistOps = new WatchlistOps({
    quoteCache: scheduler.quoteCache,
    rebuildTree: (customWatchlist) => scheduler.rebuildTree(customWatchlist),
  });

  // 绑定拖拽排序回调
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

  // 配置变更监听
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("marketlens")) {
        const prevFingerprint = getWatchlistFingerprint(config.watchlist);
        config = readConfig();

        const isBossActive = statusBar.isBossKeyActive();
        treeProvider.setBossKey(isBossActive);
        treeProvider.setMaskMode(config.maskMode);
        treeProvider.setColorNeutral(config.colorNeutral);
        statusBar.setMaskMode(config.maskMode);
        statusBar.setColorNeutral(config.colorNeutral);

        if (config.statusBar?.enabled === false) {
          statusBar.hide();
        } else {
          statusBar.show();
        }

        scheduler.rebuildTree();

        // 仅在网络/轮询周期/板块开关变动，或自选列表发生实际标的增删时才重启定时器并触发网络拉取
        // 纯 UI 配置（如 maskMode, colorNeutral, statusBar）或同组拖拽、跨组移动完全不重复打全量网络（标的报价已在内存缓存中）
        const affectsNetwork =
          e.affectsConfiguration("marketlens.autoRefresh") ||
          e.affectsConfiguration("marketlens.refreshInterval") ||
          e.affectsConfiguration("marketlens.aShare") ||
          e.affectsConfiguration("marketlens.hkStock") ||
          e.affectsConfiguration("marketlens.usStock") ||
          e.affectsConfiguration("marketlens.binance") ||
          e.affectsConfiguration("marketlens.alpha");

        const watchlistContentChanged = prevFingerprint !== getWatchlistFingerprint(config.watchlist);

        if (affectsNetwork || watchlistContentChanged) {
          resetProxyCache();
          marketManager.clearBinanceInvalidCache();
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
  _scheduler?.dispose();
  _scheduler = undefined;

  _statusBar?.dispose();
  _statusBar = undefined;

  logger.info("deactivated");
}