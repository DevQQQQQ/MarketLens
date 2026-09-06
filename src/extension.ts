// src/extension.ts
import * as vscode from "vscode";
import { MarketManager } from "./services/marketManager";
import { WatchlistProvider, GroupItem } from "./ui/watchlistProvider";
import { StatusBar } from "./ui/statusBar";
import { MarketLensConfig, MarketItem } from "./types";

// ── 模块级句柄：让 deactivate() 可以显式清理，防止热重载内存泄漏 ──
let _timer: ReturnType<typeof setInterval> | undefined;
let _statusBar: StatusBar | undefined;

// ────────────────────────────────────────────────────────────────
//  配置读取
// ────────────────────────────────────────────────────────────────

function readConfig(): MarketLensConfig & { colorNeutral: boolean } {
  const cfg = vscode.workspace.getConfiguration("marketlens");
  return {
    refreshInterval:  cfg.get<number>("refreshInterval", 5000),
    maskMode:         cfg.get<boolean>("maskMode", false),
    colorNeutral:     cfg.get<boolean>("colorNeutral", false),
    cryptoProxyMode:  cfg.get<"proxy" | "direct">("cryptoProxyMode", "proxy"),
    cryptoProxyUrl:   cfg.get<string>("cryptoProxyUrl", "http://127.0.0.1:10808"),
    watchlist:        cfg.get("watchlist", {}),
  };
}

function isContractAddress(str: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(str) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str);
}

/**
 * 将 watchlist 配置分类为三种抓取目标
 */
function extractTargets(
  config: MarketLensConfig,
  specificGroupName?: string
) {
  const aShares: string[] = [];
  const cryptos:  string[] = [];
  const bscTokens: string[] = [];

  for (const [groupName, items] of Object.entries(config.watchlist)) {
    if (specificGroupName && groupName !== specificGroupName) { continue; }

    for (const item of items ?? []) {
      const sym  = item.symbol;
      const type = item.type;
      if (!sym) { continue; }

      if (
        type === "A_SHARE" ||
        groupName.includes("A股") ||
        /^(sh|sz|bj|\d{6})/i.test(sym)
      ) {
        aShares.push(sym);
      } else if (
        type === "ALPHA_TOKEN" ||
        type === "BSC_TOKEN" ||
        groupName.toLowerCase().includes("alpha") ||
        groupName.toLowerCase().includes("bsc") ||
        isContractAddress(sym)
      ) {
        bscTokens.push(sym);
      } else if (
        type === "CRYPTO" ||
        groupName.toLowerCase().includes("binance") ||
        groupName.toLowerCase().includes("crypto")
      ) {
        cryptos.push(sym);
      } else {
        if (isContractAddress(sym))    { bscTokens.push(sym); }
        else if (/^\d{6}$/.test(sym))  { aShares.push(sym); }
        else                           { cryptos.push(sym); }
      }
    }
  }

  return {
    aShares:   [...new Set(aShares)],
    cryptos:   [...new Set(cryptos)],
    bscTokens: [...new Set(bscTokens)],
  };
}

// ────────────────────────────────────────────────────────────────
//  activate
// ────────────────────────────────────────────────────────────────

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  let config = readConfig();

  const marketManager = new MarketManager();
  const treeProvider  = new WatchlistProvider(config.maskMode);
  const statusBar     = new StatusBar({
    maskMode:     config.maskMode,
    colorNeutral: config.colorNeutral,
  });

  // 绑定到模块级变量，使 deactivate() 可以显式清理
  _statusBar = statusBar;

  const treeView = vscode.window.createTreeView("marketlens.watchlist", {
    treeDataProvider: treeProvider,
    showCollapseAll:  true,
  });

  const quoteCache = new Map<string, MarketItem>();
  let isRefreshing  = false; // 防止定时器并发触发多次 doRefresh

  // ── 全量刷新 ────────────────────────────────────────────────────

  async function doRefresh(): Promise<void> {
    if (isRefreshing) { return; } // 上一次还没完成，跳过本次，避免竞争
    isRefreshing = true;
    try {
      const targets = extractTargets(config);
      const quotes  = await marketManager.pollAll(targets, {
        mode: config.cryptoProxyMode,
        proxyUrl: config.cryptoProxyUrl,
      });

      for (const q of quotes) {
        if (q.id)     { quoteCache.set(q.id.toLowerCase(), q); }
        if (q.symbol) { quoteCache.set(q.symbol.toLowerCase(), q); }
      }

      if (treeProvider.isEmpty()) {
        treeProvider.buildTree(config.watchlist, quoteCache);
      } else {
        treeProvider.applyQuotes(quotes);
      }

      statusBar.setQuotes(quotes);
    } catch (err) {
      // 静默降级：仅写日志，绝不弹窗打断用户编码
      console.error("[MarketLens] refresh error:", err);
    } finally {
      isRefreshing = false;
    }
  }

  // ── 分类刷新 ────────────────────────────────────────────────────

  async function doRefreshGroup(group: GroupItem): Promise<void> {
    try {
      const targets = extractTargets(config, group.groupName);
      const quotes  = await marketManager.pollAll(targets, {
        mode: config.cryptoProxyMode,
        proxyUrl: config.cryptoProxyUrl,
      });

      for (const q of quotes) {
        if (q.id)     { quoteCache.set(q.id.toLowerCase(), q); }
        if (q.symbol) { quoteCache.set(q.symbol.toLowerCase(), q); }
      }

      treeProvider.applyQuotes(quotes);
    } catch (err) {
      console.error(`[MarketLens] refresh group '${group.groupName}' error:`, err);
    }
  }

  // ── 定时器 ──────────────────────────────────────────────────────

  function startTimer(): void {
    stopTimer();
    void doRefresh();
    _timer = setInterval(() => void doRefresh(), config.refreshInterval);
  }

  function stopTimer(): void {
    if (_timer !== undefined) {
      clearInterval(_timer);
      _timer = undefined;
    }
  }

  // ── 命令注册 ────────────────────────────────────────────────────

  context.subscriptions.push(
    // 全量刷新
    vscode.commands.registerCommand("marketlens.refresh", () => {
      void doRefresh();
    }),

    // 分类刷新（分组节点 inline 按钮）
    vscode.commands.registerCommand(
      "marketlens.refreshGroup",
      async (group: GroupItem) => {
        if (group) { await doRefreshGroup(group); }
      }
    ),

    // 老板键 — 一键隐藏 / 恢复状态栏行情
    vscode.commands.registerCommand("marketlens.toggleBossKey", () => {
      statusBar.toggleBossKey();
    }),

    // 伪装模式开关
    vscode.commands.registerCommand("marketlens.toggleMask", async () => {
      await vscode.workspace
        .getConfiguration("marketlens")
        .update("maskMode", !config.maskMode, vscode.ConfigurationTarget.Global);
    }),

    // 添加自选（真实实现）
    vscode.commands.registerCommand("marketlens.addItem", async () => {
      // ── Step 1: 获取用户输入 ──────────────────────────────────────
      const input = await vscode.window.showInputBox({
        prompt: "输入股票代码 / 币对 / 合约地址",
        placeHolder: "如：600519 / ETCUSDT / 0x73b84f7e3901f39fc29f3704a03126d317ab4444",
        validateInput: (v) => v.trim() ? undefined : "不能为空",
      });
      if (!input) { return; }
      const sym = input.trim();

      // ── Step 2: 自动识别类型 ──────────────────────────────────────
      function detectType(s: string): { type: "A_SHARE" | "CRYPTO" | "ALPHA_TOKEN"; defaultGroup: string } {
        // EVM 兼容链地址 (0x...) 或 Solana Mint 地址 (Base58 32~44位)
        if (isContractAddress(s)) {
          return { type: "ALPHA_TOKEN", defaultGroup: "Alpha" };
        }
        if (/^(sh|sz|bj)?\d{6}$/i.test(s)) {
          return { type: "A_SHARE", defaultGroup: "A股" };
        }
        // 默认视为 Binance 币对（如 ETCUSDT / SOLUSDT）
        return { type: "CRYPTO", defaultGroup: "Binance" };
      }
      const detected = detectType(sym);

      // ── Step 3: 读取当前 watchlist，让用户选择目标分组 ───────────
      const watchlist: Record<string, any[]> =
        vscode.workspace.getConfiguration("marketlens").get("watchlist", {});

      const existingGroups = Object.keys(watchlist);
      // 把自动推断的分组排在最前方
      const sortedGroups = [
        detected.defaultGroup,
        ...existingGroups.filter((g) => g !== detected.defaultGroup),
        "➕ 新建分组…",
      ];

      const pickedGroup = await vscode.window.showQuickPick(sortedGroups, {
        title: `添加 "${sym}" 到哪个分组？`,
        placeHolder: `自动推断：${detected.defaultGroup}（按 Enter 确认）`,
      });
      if (!pickedGroup) { return; }

      let targetGroup = pickedGroup;
      if (pickedGroup === "➕ 新建分组…") {
        const newGroup = await vscode.window.showInputBox({
          prompt: "输入新分组名称",
          placeHolder: "如：海外股票",
          validateInput: (v) => v.trim() ? undefined : "不能为空",
        });
        if (!newGroup) { return; }
        targetGroup = newGroup.trim();
      }

      // ── Step 4: 检查是否已存在（去重）───────────────────────────
      const groupItems: any[] = watchlist[targetGroup] ?? [];
      const alreadyExists = groupItems.some(
        (item) => item.symbol?.toLowerCase() === sym.toLowerCase()
      );
      if (alreadyExists) {
        vscode.window.showWarningMessage(
          `MarketLens: "${sym}" 已在分组 "${targetGroup}" 中`
        );
        return;
      }

      // ── Step 5: 写入 settings.json ───────────────────────────────
      const updated = {
        ...watchlist,
        [targetGroup]: [
          ...groupItems,
          { symbol: sym, name: sym, type: detected.type },
        ],
      };

      await vscode.workspace
        .getConfiguration("marketlens")
        .update("watchlist", updated, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(
        `✅ 已添加 "${sym}" 到 ${targetGroup}`
      );
    }),

    // 配置变更监听
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("marketlens")) {
        config = readConfig();
        treeProvider.setMaskMode(config.maskMode);
        statusBar.setMaskMode(config.maskMode);
        statusBar.setColorNeutral(config.colorNeutral);
        treeProvider.buildTree(config.watchlist, quoteCache);
        startTimer();
      }
    })
  );

  context.subscriptions.push(statusBar, treeView, { dispose: stopTimer });

  startTimer();
  console.log("[MarketLens] activated ✓");
}

export function deactivate(): void {
  // 显式清理轮询定时器（防止热重载时遗留 setInterval 泄漏）
  if (_timer !== undefined) {
    clearInterval(_timer);
    _timer = undefined;
  }
  // 显式清理状态栏轮播定时器
  _statusBar?.dispose();
  _statusBar = undefined;
  console.log("[MarketLens] deactivated");
}