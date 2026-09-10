// src/scheduler.ts
import * as vscode from "vscode";
import { MarketManager } from "./services/marketManager";
import { WatchlistProvider, GroupItem } from "./ui/watchlistProvider";
import { StatusBar } from "./ui/statusBar";
import { MarketLensConfig, MarketItem } from "./types";
import { normalizeSymbolKey } from "./utils/symbolHelper";
import { logger } from "./utils/logger";
import { isAShareMarketOpen, isHKMarketOpen, isUSMarketOpen } from "./utils/marketHours";
import { readConfig } from "./utils/config";

import { extractTargetsFromWatchlist, extractStatusBarQuotes } from "./utils/symbolHelper";

export interface SchedulerContext {
  marketManager: MarketManager;
  treeProvider: WatchlistProvider;
  statusBar: StatusBar;
  treeView: vscode.TreeView<any>;
}

export class RefreshScheduler implements vscode.Disposable {
  private timer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryCount = 0;
  private readonly MAX_RETRY_COUNT = 2;
  private hasLoadedInitialQuotes = false;
  private isRefreshing = false;

  public readonly quoteCache = new Map<string, MarketItem>();

  private readonly marketManager: MarketManager;
  private readonly treeProvider: WatchlistProvider;
  private readonly statusBar: StatusBar;
  private readonly treeView: vscode.TreeView<any>;

  constructor(context: SchedulerContext) {
    this.marketManager = context.marketManager;
    this.treeProvider = context.treeProvider;
    this.statusBar = context.statusBar;
    this.treeView = context.treeView;
  }

  /**
   * 将 watchlist 配置分类为五种抓取目标（受板块启用状态控制）
   */
  public extractTargets(
    config: MarketLensConfig,
    specificGroupName?: string,
    forceAll: boolean = false
  ) {
    const skipHK = !!(config.hkStock.stopOnMarketClosed && !isHKMarketOpen() && this.hasLoadedInitialQuotes && !forceAll && !specificGroupName);
    const skipUS = !!(config.usStock.stopOnMarketClosed && !isUSMarketOpen() && this.hasLoadedInitialQuotes && !forceAll && !specificGroupName);
    const skipA = !!(config.aShare.stopOnMarketClosed && !isAShareMarketOpen() && this.hasLoadedInitialQuotes && !forceAll && !specificGroupName);

    return extractTargetsFromWatchlist(config.watchlist, {
      aShareEnabled: config.aShare.enabled,
      hkStockEnabled: config.hkStock.enabled,
      usStockEnabled: config.usStock.enabled,
      binanceEnabled: config.binance.enabled,
      alphaEnabled: config.alpha.enabled,
      specificGroupName,
      skipAShare: skipA,
      skipHKStock: skipHK,
      skipUSStock: skipUS,
    });
  }

  public saveToQuoteCache(q: MarketItem): void {
    const normSym = normalizeSymbolKey(q.symbol);
    const normId = normalizeSymbolKey(q.id);
    if (normSym) this.quoteCache.set(normSym, q);
    if (normId && normId !== normSym) this.quoteCache.set(normId, q);
    if (q.symbol) this.quoteCache.set(q.symbol, q);
    if (q.id && q.id !== q.symbol) this.quoteCache.set(q.id, q);
  }

  /**
   * 统一收口树视图构建，避免多处重复传递相同的 enabledSections 参数
   */
  public rebuildTree(customWatchlist?: Record<string, any[]>): void {
    const currentCfg = readConfig();
    this.treeProvider.buildTree(customWatchlist || currentCfg.watchlist, this.quoteCache, {
      aShare: currentCfg.aShare.enabled,
      hkStock: currentCfg.hkStock.enabled,
      usStock: currentCfg.usStock.enabled,
      binance: currentCfg.binance.enabled,
      alpha: currentCfg.alpha.enabled,
    });
  }

  /**
   * 统一更新底部状态栏行情与轮播展示
   * 聚合所有启用且开启轮播的板块标的，优先使用内存中的最新报价（含已闭市标的的收盘报价），
   * 确保闭市时状态栏不会丢失已缓存的收盘行情，并在配置开关变动时立即生效。
   */
  public updateStatusBar(currentConfig?: MarketLensConfig): void {
    const config = currentConfig || readConfig();
    const statusBarQuotes = extractStatusBarQuotes(config.watchlist, this.quoteCache, {
      statusBarEnabled: config.statusBar?.enabled,
      aShare: config.aShare,
      hkStock: config.hkStock,
      usStock: config.usStock,
      binance: config.binance,
      alpha: config.alpha,
    });

    this.statusBar.setQuotes(statusBarQuotes);
    if (statusBarQuotes.length > 0) {
      this.statusBar.show();
    } else {
      this.statusBar.hide();
    }
  }

  // ── 全量刷新 ────────────────────────────────────────────────────

  public async refresh(forceRefreshAll: boolean = false): Promise<void> {
    const config = readConfig();
    // 资源节流控制：若状态栏未开启且侧边栏视图不可见，且非显式强制唤醒刷新，暂停后台打网
    const isStatusBarActive = config.statusBar?.enabled !== false;
    const isTreeViewActive = this.treeView.visible;
    if (!isStatusBarActive && !isTreeViewActive && !forceRefreshAll) {
      return;
    }

    if (this.isRefreshing) {
      if (forceRefreshAll && !this.retryTimer && this.retryCount < this.MAX_RETRY_COUNT) {
        this.retryCount++;
        // 若当前已有刷新在执行，且未排队重试，延迟 300ms 再次触发一次强制刷新
        this.retryTimer = setTimeout(() => {
          this.retryTimer = undefined;
          void this.refresh(true);
        }, 300);
      }
      return;
    }

    // 成功进入执行，重置重试计数
    this.retryCount = 0;
    this.isRefreshing = true;
    try {
      // 首次加载或明确要求强制刷新时，确保必定拉取
      const forceAll = forceRefreshAll || !this.hasLoadedInitialQuotes;
      const targets = this.extractTargets(config, undefined, forceAll);
      const quotes  = await this.marketManager.pollAll(
        targets,
        { mode: config.aShare.networkMode, proxyUrl: config.aShare.proxyUrl },
        { mode: config.hkStock.networkMode, proxyUrl: config.hkStock.proxyUrl },
        { mode: config.usStock.networkMode, proxyUrl: config.usStock.proxyUrl },
        { mode: config.binance.networkMode, proxyUrl: config.binance.proxyUrl },
        { mode: config.alpha.networkMode, proxyUrl: config.alpha.proxyUrl }
      );

      const totalTargetsCount =
        targets.aShares.length +
        targets.hkStocks.length +
        targets.usStocks.length +
        targets.cryptos.length +
        targets.bscTokens.length;

      if (totalTargetsCount === 0) {
        this.quoteCache.clear();
      }

      for (const q of quotes) {
        this.saveToQuoteCache(q);
      }

      const wasFirstLoad = !this.hasLoadedInitialQuotes;
      if (quotes.length > 0 || this.hasLoadedInitialQuotes) {
        this.hasLoadedInitialQuotes = true;
      }

      if (this.treeProvider.isEmpty() || wasFirstLoad || forceRefreshAll) {
        this.rebuildTree();
      } else {
        this.treeProvider.applyQuotes(quotes);
      }

      this.updateStatusBar(config);
    } catch (err) {
      // 静默降级：仅写日志到 OutputChannel，绝不弹窗打断用户编码
      logger.error("全量刷新失败", err);
    } finally {
      this.isRefreshing = false;
    }
  }

  // ── 分类刷新 ────────────────────────────────────────────────────

  public async refreshGroup(group: GroupItem): Promise<void> {
    if (this.isRefreshing) {
      // 若当前已有全量或分组刷新在执行，避免并发重叠打网
      return;
    }
    this.isRefreshing = true;
    try {
      const config = readConfig();
      const targets = this.extractTargets(config, group.groupName);
      const quotes  = await this.marketManager.pollAll(
        targets,
        { mode: config.aShare.networkMode, proxyUrl: config.aShare.proxyUrl },
        { mode: config.hkStock.networkMode, proxyUrl: config.hkStock.proxyUrl },
        { mode: config.usStock.networkMode, proxyUrl: config.usStock.proxyUrl },
        { mode: config.binance.networkMode, proxyUrl: config.binance.proxyUrl },
        { mode: config.alpha.networkMode, proxyUrl: config.alpha.proxyUrl }
      );

      for (const q of quotes) {
        this.saveToQuoteCache(q);
      }

      this.treeProvider.applyQuotes(quotes);
      this.updateStatusBar(config);
    } catch (err) {
      logger.error(`分组 '${group.groupName}' 刷新失败`, err);
    } finally {
      this.isRefreshing = false;
    }
  }

  // ── 定时器生命周期 ──────────────────────────────────────────────

  public start(): void {
    this.stop();
    // 首次启动时无条件强制刷新一次，确保即使处于闭市/休市/周末也能看到最新收盘数据
    void this.refresh(true);

    const config = readConfig();
    // 如果关闭了自动刷新，则不挂载 setInterval
    if (!config.autoRefresh) {
      return;
    }

    const interval = Math.max(1000, config.refreshInterval || 5000);
    this.timer = setInterval(() => void this.refresh(), interval);
  }

  public stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    this.retryCount = 0;
  }

  public dispose(): void {
    this.stop();
  }
}
