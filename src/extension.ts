// src/extension.ts
import * as vscode from "vscode";
import { MarketManager } from "./services/marketManager";
import { WatchlistProvider, GroupItem } from "./ui/watchlistProvider";
import { StatusBar } from "./ui/statusBar";
import { SettingsWebviewPanel } from "./ui/settingsWebview";
import { MarketLensConfig, MarketItem } from "./types";

// ── 模块级句柄：让 deactivate() 可以显式清理，防止热重载内存泄漏 ──
let _timer: ReturnType<typeof setInterval> | undefined;
let _statusBar: StatusBar | undefined;
let hasLoadedInitialAShare = false;

// ────────────────────────────────────────────────────────────────
//  配置读取
// ────────────────────────────────────────────────────────────────

function readConfig(): MarketLensConfig {
  const cfg = vscode.workspace.getConfiguration("marketlens");
  const legacyProxyMode = cfg.get<"proxy" | "direct">("cryptoProxyMode", "proxy");
  const legacyProxyUrl  = cfg.get<string>("cryptoProxyUrl", "http://127.0.0.1:10808");

  return {
    autoRefresh:     cfg.get<boolean>("autoRefresh", true),
    refreshInterval: cfg.get<number>("refreshInterval", 5000),
    maskMode:        cfg.get<boolean>("maskMode", false),
    colorNeutral:    cfg.get<boolean>("colorNeutral", false),

    aShare: {
      enabled:            cfg.get<boolean>("aShare.enabled", true),
      networkMode:        cfg.get<"proxy" | "direct">("aShare.networkMode", "direct"),
      proxyUrl:           cfg.get<string>("aShare.proxyUrl", "http://127.0.0.1:10808"),
      stopOnMarketClosed: cfg.get<boolean>("aShare.stopOnMarketClosed", true),
    },
    binance: {
      enabled:     cfg.get<boolean>("binance.enabled", true),
      networkMode: cfg.get<"proxy" | "direct">("binance.networkMode", legacyProxyMode),
      proxyUrl:    cfg.get<string>("binance.proxyUrl", legacyProxyUrl),
    },
    alpha: {
      enabled:     cfg.get<boolean>("alpha.enabled", true),
      networkMode: cfg.get<"proxy" | "direct">("alpha.networkMode", legacyProxyMode),
      proxyUrl:    cfg.get<string>("alpha.proxyUrl", legacyProxyUrl),
    },

    watchlist: cfg.get("watchlist", {}),
  };
}

/**
 * 校验当前是否处于 A 股交易时段：
 * - 必须为周一至周五（排除周六周日）
 * - 包含早盘集合竞价与连续竞价：9:15 ~ 11:30
 * - 下午连续竞价至收盘：13:00 ~ 15:05
 */
export function isAShareMarketOpen(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) {
    return false;
  }
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const isMorning   = totalMinutes >= 9 * 60 + 15 && totalMinutes <= 11 * 60 + 30;
  const isAfternoon = totalMinutes >= 13 * 60 && totalMinutes <= 15 * 60 + 5;
  return isMorning || isAfternoon;
}

function isContractAddress(str: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(str) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str);
}

/**
 * 将 watchlist 配置分类为三种抓取目标（受板块启用状态控制）
 */
function extractTargets(
  config: MarketLensConfig,
  specificGroupName?: string,
  forceAShare: boolean = false
) {
  const aShares: string[] = [];
  const cryptos:  string[] = [];
  const bscTokens: string[] = [];

  for (const [groupName, items] of Object.entries(config.watchlist)) {
    if (specificGroupName && groupName !== specificGroupName) { continue; }

    const lowerGroup = groupName.toLowerCase();

    for (const item of items ?? []) {
      const sym  = item.symbol;
      const type = item.type;
      if (!sym) { continue; }

      const isAShare =
        type === "A_SHARE" ||
        groupName.includes("A股") ||
        /^(sh|sz|bj|\d{6})/i.test(sym);

      const isAlpha =
        type === "ALPHA_TOKEN" ||
        type === "BSC_TOKEN" ||
        lowerGroup.includes("alpha") ||
        lowerGroup.includes("bsc") ||
        isContractAddress(sym);

      const isCrypto =
        type === "CRYPTO" ||
        lowerGroup.includes("binance") ||
        lowerGroup.includes("crypto");

      if (isAShare) {
        // 核心规则：首次打开、手动强制刷新、或单独刷新分组时，绝不跳过；
        // 仅在已成功拉取过初始行情、且处于自动周期轮询、非交易时段时才跳过轮询
        const canSkipByMarketClosed = config.aShare.stopOnMarketClosed && !isAShareMarketOpen() && hasLoadedInitialAShare && !forceAShare && !specificGroupName;
        if (config.aShare.enabled && !canSkipByMarketClosed) {
          aShares.push(sym);
        }
      } else if (isAlpha) {
        if (config.alpha.enabled) { bscTokens.push(sym); }
      } else if (isCrypto) {
        if (config.binance.enabled) { cryptos.push(sym); }
      } else {
        if (isContractAddress(sym) && config.alpha.enabled) {
          bscTokens.push(sym);
        } else if (/^\d{6}$/.test(sym) && config.aShare.enabled) {
          const canSkipByMarketClosed = config.aShare.stopOnMarketClosed && !isAShareMarketOpen() && hasLoadedInitialAShare && !forceAShare && !specificGroupName;
          if (!canSkipByMarketClosed) { aShares.push(sym); }
        } else if (config.binance.enabled) {
          cryptos.push(sym);
        }
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
  const treeProvider  = new WatchlistProvider(config.maskMode, config.colorNeutral);
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

  async function doRefresh(forceRefreshAShare: boolean = false): Promise<void> {
    if (isRefreshing) { return; } // 上一次还没完成，跳过本次，避免竞争
    isRefreshing = true;
    try {
      // 首次加载或明确要求强制刷新时，确保 A 股必定拉取
      const forceAShare = forceRefreshAShare || !hasLoadedInitialAShare;
      const targets = extractTargets(config, undefined, forceAShare);
      const quotes  = await marketManager.pollAll(
        targets,
        { mode: config.aShare.networkMode, proxyUrl: config.aShare.proxyUrl },
        { mode: config.binance.networkMode, proxyUrl: config.binance.proxyUrl },
        { mode: config.alpha.networkMode, proxyUrl: config.alpha.proxyUrl }
      );

      for (const q of quotes) {
        if (q.id)     { quoteCache.set(q.id.toLowerCase(), q); }
        if (q.symbol) { quoteCache.set(q.symbol.toLowerCase(), q); }
        if ((q.type === "A_SHARE" || /^\d{6}$/.test(q.symbol)) && q.price > 0) {
          hasLoadedInitialAShare = true;
        }
      }

      if (treeProvider.isEmpty()) {
        treeProvider.buildTree(config.watchlist, quoteCache, {
          aShare: config.aShare.enabled,
          binance: config.binance.enabled,
          alpha: config.alpha.enabled,
        });
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
      const quotes  = await marketManager.pollAll(
        targets,
        { mode: config.aShare.networkMode, proxyUrl: config.aShare.proxyUrl },
        { mode: config.binance.networkMode, proxyUrl: config.binance.proxyUrl },
        { mode: config.alpha.networkMode, proxyUrl: config.alpha.proxyUrl }
      );

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
    // 首次启动时无条件强制刷新一次，确保即使处于闭市/休市/周末也能看到最新收盘数据
    void doRefresh(true);

    // 如果关闭了自动刷新，则不挂载 setInterval
    if (!config.autoRefresh) {
      return;
    }

    const interval = Math.max(1000, config.refreshInterval || 5000);
    _timer = setInterval(() => void doRefresh(), interval);
  }

  function stopTimer(): void {
    if (_timer !== undefined) {
      clearInterval(_timer);
      _timer = undefined;
    }
  }

  // ── 格式校验与智能识别函数 ────────────────────────────────────
  interface ParsedItemInput {
    symbol: string;
    type: "A_SHARE" | "CRYPTO" | "ALPHA_TOKEN";
    defaultGroup: string;
    hint: string;
  }

  function validateAndParseInput(input: string): { error?: string; parsed?: ParsedItemInput } {
    const trimmed = input.trim();
    if (!trimmed) {
      return { error: "代码不能为空" };
    }

    // 1. 链上 DEX / Alpha 合约地址 (EVM 0x... 42位, 或 Solana Mint 32~44位)
    if (isContractAddress(trimmed)) {
      return {
        parsed: {
          symbol: trimmed,
          type: "ALPHA_TOKEN",
          defaultGroup: "Alpha",
          hint: "链上 DEX / Alpha 合约",
        },
      };
    }

    // 2. A 股代码校验 (支持 6 位数字，如 600519，或带前缀 sh600519 / sz000001 / bj830001)
    const aShareMatch = trimmed.match(/^(sh|sz|bj)?(\d{6})$/i);
    if (aShareMatch) {
      const code = aShareMatch[2];
      return {
        parsed: {
          symbol: code,
          type: "A_SHARE",
          defaultGroup: "A股",
          hint: `A股代码 (${code})`,
        },
      };
    }

    // 如果纯数字但不是 6 位，明确报错拦截
    if (/^\d+$/.test(trimmed)) {
      return {
        error: `⚠️ 纯数字仅支持 6 位 A 股股票代码（如 600519），当前输入为 ${trimmed.length} 位数字`,
      };
    }

    // 3. 加密货币币对 (如 BTCUSDT, ETH/USDT, SOL-USDT, BTC, DOGE 等)
    // 必须全部为字母（中间可含 / 或 -），至少 2 位
    const cryptoMatch = trimmed.match(/^([a-zA-Z]{2,10})([\/\-_]?([a-zA-Z]{2,10}))?$/);
    if (cryptoMatch) {
      let cleanSym = trimmed.toUpperCase().replace(/[\/\-_]/g, "");
      // 若只输入了单币名且未含计价货币，默认补齐 USDT 方便拉取
      if (!cryptoMatch[3] && !cleanSym.endsWith("USDT") && !cleanSym.endsWith("USD") && !cleanSym.endsWith("BUSD")) {
        cleanSym = `${cleanSym}USDT`;
      }
      return {
        parsed: {
          symbol: cleanSym,
          type: "CRYPTO",
          defaultGroup: "Binance",
          hint: `加密货币币对 (${cleanSym})`,
        },
      };
    }

    return {
      error: "⚠️ 格式不合法！请输入：A股6位代码(如 600519)、币对(如 BTCUSDT) 或 链上合约地址(0x...)",
    };
  }

  // ── 命令注册 ────────────────────────────────────────────────────

  context.subscriptions.push(
    // 打开设置界面（专属 Webview 控制台面板）
    vscode.commands.registerCommand("marketlens.openSettings", () => {
      SettingsWebviewPanel.createOrShow(context.extensionUri);
    }),

    // 全量刷新（手动点击无论是否闭市都重新获取最新收盘/盘中数据）
    vscode.commands.registerCommand("marketlens.refresh", () => {
      void doRefresh(true);
    }),

    // 分类刷新（分组节点 inline 按钮）
    vscode.commands.registerCommand(
      "marketlens.refreshGroup",
      async (group: GroupItem) => {
        if (group) { await doRefreshGroup(group); }
      }
    ),

    // 老板键 — 一键隐藏 / 恢复（侧边栏、状态栏、设置窗口联动）
    vscode.commands.registerCommand("marketlens.toggleBossKey", async () => {
      const isHidden = statusBar.toggleBossKey();

      if (isHidden) {
        // 1. 关闭左侧侧边栏（如果处于开启状态）
        try {
          await vscode.commands.executeCommand("workbench.action.closeSidebar");
        } catch (_) {}

        // 2. 将自选树视图打码脱敏
        treeProvider.setMaskMode(true);

        // 3. 关闭正在打开的设置 Webview
        SettingsWebviewPanel.currentPanel?.dispose();

        // 4. 底部微弱状态提示
        vscode.window.setStatusBarMessage("$(eye-closed) MarketLens 已隐蔽 (再次按下快捷键恢复)", 3500);
      } else {
        // 1. 恢复自选树视图原配置
        treeProvider.setMaskMode(config.maskMode);

        // 2. 重新唤醒并展开左侧自选侧边栏
        try {
          await vscode.commands.executeCommand("workbench.view.extension.marketlens-container");
        } catch (_) {}

        // 3. 底部状态提示
        vscode.window.setStatusBarMessage("$(eye) MarketLens 行情已恢复", 3000);
      }
    }),

    // 伪装摸鱼模式开关
    vscode.commands.registerCommand("marketlens.toggleMask", async () => {
      const next = !config.maskMode;
      await vscode.workspace
        .getConfiguration("marketlens")
        .update("maskMode", next, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(
        next ? "$(git-branch) MarketLens: 伪装摸鱼模式已开启" : "$(eye) MarketLens: 伪装摸鱼模式已关闭",
        2500
      );
    }),

    // 颜色脱敏开关
    vscode.commands.registerCommand("marketlens.toggleColorNeutral", async () => {
      const next = !config.colorNeutral;
      await vscode.workspace
        .getConfiguration("marketlens")
        .update("colorNeutral", next, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(
        next ? "$(paintcan) MarketLens: 颜色脱敏已开启 (无红绿视觉刺激)" : "$(paintcan) MarketLens: 颜色脱敏已关闭 (恢复红绿涨跌)",
        2500
      );
    }),

    // 自定义快捷键
    vscode.commands.registerCommand("marketlens.openKeybindings", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openGlobalKeybindings",
        "marketlens"
      );
    }),

    // 添加自选（带实时严格校验）
    vscode.commands.registerCommand("marketlens.addItem", async () => {
      // ── Step 1: 获取用户输入并实时校验 ────────────────────────────
      const input = await vscode.window.showInputBox({
        prompt: "输入股票代码 / 币对 / 合约地址",
        placeHolder: "如：600519 / BTCUSDT / 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        validateInput: (v) => {
          const res = validateAndParseInput(v);
          return res.error ? res.error : undefined;
        },
      });
      if (!input) { return; }

      const validation = validateAndParseInput(input);
      if (validation.error || !validation.parsed) {
        vscode.window.showErrorMessage(validation.error || "输入格式不合法");
        return;
      }
      const detected = validation.parsed;
      const sym = detected.symbol;

      // ── Step 2: 读取当前 watchlist，让用户选择目标分组 ───────────
      const watchlist: Record<string, any[]> =
        vscode.workspace.getConfiguration("marketlens").get("watchlist", {});

      const existingGroups = Object.keys(watchlist);
      const sortedGroups = [
        detected.defaultGroup,
        ...existingGroups.filter((g) => g !== detected.defaultGroup),
        "➕ 新建分组…",
      ];

      const pickedGroup = await vscode.window.showQuickPick(sortedGroups, {
        title: `添加 "${sym}" (${detected.hint}) 到哪个分组？`,
        placeHolder: `自动识别：${detected.defaultGroup}（按 Enter 确认）`,
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

      // ── Step 3: 检查是否已存在（去重）───────────────────────────
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

      // ── Step 4: 写入 settings.json ───────────────────────────────
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
      void doRefresh();
    }),

    // 删除自选（点击垃圾桶图标或命令触发）
    vscode.commands.registerCommand(
      "marketlens.removeItem",
      async (node?: StockItem) => {
        const cfg = readConfig();
        const watchlist = { ...cfg.watchlist };

        let targetSymbol: string | undefined;
        let targetGroup: string | undefined;
        let targetName: string | undefined;

        if (node && node.item) {
          targetSymbol = node.item.symbol || node.item.id;
          targetName   = node.item.name || targetSymbol;
        } else {
          // 未传 node 时弹窗供用户选择
          const allItems: { label: string; description: string; group: string; symbol: string }[] = [];
          for (const [grp, items] of Object.entries(watchlist)) {
            for (const it of items ?? []) {
              allItems.push({
                label: it.name || it.symbol,
                description: `分组: ${grp} · 代码: ${it.symbol}`,
                group: grp,
                symbol: it.symbol,
              });
            }
          }

          if (allItems.length === 0) {
            vscode.window.showInformationMessage("MarketLens: 当前自选列表为空");
            return;
          }

          const picked = await vscode.window.showQuickPick(allItems, {
            title: "选择要删除的自选项目",
            placeHolder: "搜索股票、币对或合约地址",
          });
          if (!picked) { return; }
          targetSymbol = picked.symbol;
          targetGroup  = picked.group;
          targetName   = picked.label;
        }

        if (!targetSymbol) { return; }

        // 二次确认，防止手滑误删
        const confirm = await vscode.window.showWarningMessage(
          `确定要从自选中删除 "${targetName || targetSymbol}" 吗？`,
          { modal: true },
          "删除",
          "取消"
        );
        if (confirm !== "删除") { return; }

        // 从分组中移除该项
        let removed = false;
        for (const [grp, items] of Object.entries(watchlist)) {
          if (targetGroup && grp !== targetGroup) { continue; }
          const beforeLen = items.length;
          const filtered = items.filter(
            (it) => it.symbol?.toLowerCase() !== targetSymbol!.toLowerCase() &&
                    it.name?.toLowerCase() !== targetSymbol!.toLowerCase()
          );
          if (filtered.length !== beforeLen) {
            watchlist[grp] = filtered;
            removed = true;
          }
        }

        // 若特定分组未匹配，进行全局清理兜底
        if (!removed) {
          for (const [grp, items] of Object.entries(watchlist)) {
            watchlist[grp] = items.filter(
              (it) => it.symbol?.toLowerCase() !== targetSymbol!.toLowerCase() &&
                      it.name?.toLowerCase() !== targetSymbol!.toLowerCase()
            );
          }
        }

        // 保存更新到全局配置
        await vscode.workspace
          .getConfiguration("marketlens")
          .update("watchlist", watchlist, vscode.ConfigurationTarget.Global);

        // 清理缓存
        quoteCache.delete(targetSymbol.toLowerCase());

        // 重新构建树视图
        treeProvider.buildTree(watchlist, quoteCache, {
          aShare: cfg.aShare.enabled,
          binance: cfg.binance.enabled,
          alpha: cfg.alpha.enabled,
        });

        vscode.window.showInformationMessage(`✅ 已删除 "${targetName || targetSymbol}"`);
      }
    ),

    // 配置变更监听
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("marketlens")) {
        config = readConfig();
        treeProvider.setMaskMode(config.maskMode);
        treeProvider.setColorNeutral(config.colorNeutral);
        statusBar.setMaskMode(config.maskMode);
        statusBar.setColorNeutral(config.colorNeutral);
        treeProvider.buildTree(config.watchlist, quoteCache, {
          aShare: config.aShare.enabled,
          binance: config.binance.enabled,
          alpha: config.alpha.enabled,
        });
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