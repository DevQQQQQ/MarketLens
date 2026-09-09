// src/watchlistOps.ts
import * as vscode from "vscode";
import { StockItem } from "./ui/watchlistProvider";
import { MarketItem } from "./types";
import { isSameSymbol, normalizeSymbolKey } from "./utils/symbolHelper";
import { validateAndParseInput } from "./utils/inputValidator";
import { readConfig } from "./utils/config";

import { reorderWatchlist } from "./utils/symbolHelper";

export interface WatchlistOpsContext {
  quoteCache: Map<string, MarketItem>;
  rebuildTree: (customWatchlist?: Record<string, any[]>) => void;
}

export class WatchlistOps {
  private readonly quoteCache: Map<string, MarketItem>;
  private readonly rebuildTree: (customWatchlist?: Record<string, any[]>) => void;

  constructor(context: WatchlistOpsContext) {
    this.quoteCache = context.quoteCache;
    this.rebuildTree = context.rebuildTree;
  }

  /**
   * 处理自选标的拖拽重排（同组与跨组）
   */
  public async handleReorder(
    sourceGroup: string,
    sourceSymbol: string,
    targetGroup: string,
    targetSymbol?: string
  ): Promise<void> {
    const cfg = readConfig();
    const newWatchlist = reorderWatchlist(
      cfg.watchlist,
      sourceGroup,
      sourceSymbol,
      targetGroup,
      targetSymbol
    );

    if (!newWatchlist) {
      return;
    }

    try {
      await vscode.workspace
        .getConfiguration("marketlens")
        .update("watchlist", newWatchlist, vscode.ConfigurationTarget.Global);

      this.rebuildTree(newWatchlist);
    } catch (err: any) {
      vscode.window.showErrorMessage(`调整标的顺序失败: ${err?.message || err}`);
    }
  }

  /**
   * 添加自选（带实时严格校验）
   */
  public async addItem(): Promise<void> {
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
    let finalType = detected.type;
    if (detected.alternativeType) {
      if (detected.alternativeGroup && targetGroup.toLowerCase().includes(detected.alternativeGroup.toLowerCase())) {
        finalType = detected.alternativeType;
      } else if (targetGroup.includes("港股") || /\bhk\b/i.test(targetGroup)) {
        finalType = "HK_STOCK";
      } else if (targetGroup.includes("美股") || /\bus\b/i.test(targetGroup)) {
        finalType = "US_STOCK";
      }
    }

    const updated = {
      ...watchlist,
      [targetGroup]: [
        ...groupItems,
        { symbol: sym, name: sym, type: finalType },
      ],
    };

    try {
      await vscode.workspace
        .getConfiguration("marketlens")
        .update("watchlist", updated, vscode.ConfigurationTarget.Global);

      // 主动重建树视图，与 pinToTop / removeItem / handleReorder 行为保持一致
      this.rebuildTree(updated);

      vscode.window.showInformationMessage(
        `✅ 已添加 "${sym}" 到 ${targetGroup}`
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `无法写入用户设置：${err?.message || err}。请检查 VS Code 的 settings.json 文件是否包含语法错误。`
      );
    }
  }

  /**
   * 置顶标的（点击图钉图标或命令触发）
   */
  public async pinToTop(node?: StockItem): Promise<void> {
    const cfg = readConfig();
    const watchlist = { ...cfg.watchlist };

    let targetSymbol: string | undefined;
    let targetGroup: string | undefined;
    let targetName: string | undefined;

    if (node) {
      targetSymbol = node.confSymbol || node.item?.symbol || node.item?.id;
      targetGroup  = node.groupName;
      targetName   = node.item?.name || targetSymbol;
    } else {
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
        title: "选择要置顶的标的",
        placeHolder: "搜索股票、币对或合约地址",
      });
      if (!picked) { return; }
      targetSymbol = picked.symbol;
      targetGroup  = picked.group;
      targetName   = picked.label;
    }

    if (!targetSymbol) { return; }

    if (!targetGroup) {
      for (const [grp, items] of Object.entries(watchlist)) {
        if (items?.some((it) => isSameSymbol(it.symbol, targetSymbol))) {
          targetGroup = grp;
          break;
        }
      }
    }

    if (!targetGroup || !watchlist[targetGroup]) { return; }

    const items = [...watchlist[targetGroup]];
    const index = items.findIndex(
      (it) =>
        isSameSymbol(it.symbol, targetSymbol) ||
        it.symbol?.toLowerCase() === targetSymbol!.toLowerCase() ||
        (node?.item?.id && isSameSymbol(it.symbol, node.item.id)) ||
        (node?.item?.symbol && isSameSymbol(it.symbol, node.item.symbol))
    );

    if (index === -1) {
      return;
    }
    if (index === 0) {
      vscode.window.showInformationMessage(`MarketLens: "${targetName || targetSymbol}" 已在最顶部`);
      return;
    }

    const [pinnedItem] = items.splice(index, 1);
    items.unshift(pinnedItem);
    watchlist[targetGroup] = items;

    try {
      await vscode.workspace
        .getConfiguration("marketlens")
        .update("watchlist", watchlist, vscode.ConfigurationTarget.Global);

      this.rebuildTree(watchlist);

      vscode.window.showInformationMessage(`📌 已将 "${targetName || targetSymbol}" 置顶`);
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `无法更新设置：${err?.message || err}。请检查 VS Code 的 settings.json 文件是否包含语法错误。`
      );
    }
  }

  /**
   * 删除自选（点击垃圾桶图标或命令触发）
   */
  public async removeItem(node?: StockItem): Promise<void> {
    const cfg = readConfig();
    const watchlist = { ...cfg.watchlist };

    let targetSymbol: string | undefined;
    let targetGroup: string | undefined;
    let targetName: string | undefined;

    if (node) {
      targetSymbol = node.confSymbol || node.item?.symbol || node.item?.id;
      targetGroup  = node.groupName;
      targetName   = node.item?.name || targetSymbol;
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

    const matchItem = (it: { symbol?: string; name?: string }): boolean => {
      if (!targetSymbol) return false;
      if (it.symbol && isSameSymbol(it.symbol, targetSymbol)) return true;
      if (it.name && targetName && it.name.toLowerCase() === targetName.toLowerCase()) return true;
      if (node?.item?.id && it.symbol && isSameSymbol(it.symbol, node.item.id)) return true;
      if (node?.item?.symbol && it.symbol && isSameSymbol(it.symbol, node.item.symbol)) return true;
      return false;
    };

    // 从分组中移除该项
    let removed = false;
    for (const [grp, items] of Object.entries(watchlist)) {
      if (targetGroup && grp !== targetGroup) { continue; }
      const beforeLen = items.length;
      const filtered = items.filter((it) => !matchItem(it));
      if (filtered.length !== beforeLen) {
        watchlist[grp] = filtered;
        removed = true;
      }
    }

    // 若特定分组未匹配，进行全局清理兜底
    if (!removed) {
      for (const [grp, items] of Object.entries(watchlist)) {
        const beforeLen = items.length;
        const filtered = items.filter((it) => !matchItem(it));
        if (filtered.length !== beforeLen) {
          watchlist[grp] = filtered;
          removed = true;
        }
      }
    }

    // 保存更新到全局配置
    try {
      await vscode.workspace
        .getConfiguration("marketlens")
        .update("watchlist", watchlist, vscode.ConfigurationTarget.Global);

      // 清理缓存（支持原生代码、小写、无符号及 normalizeSymbolKey 规范化键）
      if (targetSymbol) {
        this.quoteCache.delete(targetSymbol.toLowerCase());
        this.quoteCache.delete(targetSymbol.toLowerCase().replace(/[\._\-]/g, ""));
        const normTarget = normalizeSymbolKey(targetSymbol);
        if (normTarget) { this.quoteCache.delete(normTarget); }
      }
      if (node?.item?.id) {
        this.quoteCache.delete(node.item.id.toLowerCase());
        const normId = normalizeSymbolKey(node.item.id);
        if (normId) { this.quoteCache.delete(normId); }
      }
      if (node?.item?.symbol) {
        this.quoteCache.delete(node.item.symbol.toLowerCase());
        const normSym = normalizeSymbolKey(node.item.symbol);
        if (normSym) { this.quoteCache.delete(normSym); }
      }

      // 重新构建树视图
      this.rebuildTree(watchlist);

      vscode.window.showInformationMessage(`✅ 已删除 "${targetName || targetSymbol}"`);
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `无法更新设置：${err?.message || err}。请检查 VS Code 的 settings.json 文件是否包含语法错误。`
      );
    }
  }
}
