import * as vscode from "vscode";
import { MarketItem, WatchlistConfig, WatchConfigItem, PriceAlertItem, AlertsConfig } from "../types";
import { normalizeSymbolKey, resolveItemAssetType, resolveItemDisplayName } from "../utils/symbolHelper";
import { isDisplayMasked } from "../utils/maskState";

/**
 * 智能格式化价格
 */
function formatPrice(price: number, currency: "CNY" | "USD" | "HKD" = "USD"): string {
  if (price === 0) return "0.00";
  let sym = "$";
  if (currency === "CNY") sym = "¥";
  else if (currency === "HKD") sym = "HK$";

  if (price < 0.0001) return `${sym}${price.toExponential(4)}`;
  if (price < 1) return `${sym}${price.toFixed(6)}`;
  if (price < 10) return `${sym}${price.toFixed(3)}`;
  return `${sym}${price.toFixed(2)}`;
}

/**
 * 格式化大数值（成交量 / 成交额 / 流动性）
 */
function formatLargeNumber(num: number | undefined, isVolume: boolean, currency: "CNY" | "USD" | "HKD" = "USD"): string {
  if (num === undefined || num === 0) return "--";

  let prefix = "";
  if (!isVolume) {
    if (currency === "CNY") prefix = "¥";
    else if (currency === "HKD") prefix = "HK$";
    else prefix = "$";
  }
  const unit = isVolume ? (currency === "CNY" || currency === "HKD" ? "股" : "") : "";

  if (currency === "CNY" || currency === "HKD") {
    if (num >= 1e8) {
      return `${prefix}${(num / 1e8).toFixed(2)} 亿${unit}`;
    }
    if (num >= 1e4) {
      return `${prefix}${(num / 1e4).toFixed(2)} 万${unit}`;
    }
    return `${prefix}${num.toLocaleString()}${unit}`;
  } else {
    if (num >= 1e9) {
      return `${prefix}${(num / 1e9).toFixed(2)}B ${unit}`.trim();
    }
    if (num >= 1e6) {
      return `${prefix}${(num / 1e6).toFixed(2)}M ${unit}`.trim();
    }
    if (num >= 1e3) {
      return `${prefix}${(num / 1e3).toFixed(2)}K ${unit}`.trim();
    }
    return `${prefix}${num.toFixed(2)} ${unit}`.trim();
  }
}

/** 分组节点（A股 / Binance / Alpha） */
export class GroupItem extends vscode.TreeItem {
  constructor(
    public readonly groupName: string,
    public readonly children: StockItem[]
  ) {
    super(groupName, vscode.TreeItemCollapsibleState.Expanded);
    this.id = `group_${groupName}`;
    this.contextValue = "groupItem";
    this.iconPath = new vscode.ThemeIcon("folder");
    this.description = `(${children.length})`;
  }
}

/** 单只股票 / 代币节点 */
export class StockItem extends vscode.TreeItem {
  public alertRule?: PriceAlertItem;
  public confName?: string;

  constructor(
    public item: MarketItem,
    public groupName: string,
    public readonly confSymbol: string,
    private maskMode: boolean,
    private colorNeutral: boolean = false,
    alertRule?: PriceAlertItem,
    confName?: string
  ) {
    super(resolveItemDisplayName(confName, confSymbol, item), vscode.TreeItemCollapsibleState.None);
    this.confName = confName;
    this.id = `${groupName}_${confSymbol}`;
    this.contextValue = "stockItem";
    this.alertRule = alertRule;
    this.refresh(item, maskMode, colorNeutral, alertRule, confName);
  }

  /** 更新显示内容与悬停详细信息 */
  refresh(
    item: MarketItem,
    maskMode: boolean,
    colorNeutral: boolean = false,
    alertRule?: PriceAlertItem,
    confName?: string
  ): void {
    this.item = item;
    if (alertRule !== undefined) {
      this.alertRule = alertRule;
    }
    if (confName !== undefined) {
      this.confName = confName;
    }
    const currentAlert = this.alertRule;
    const hasAlert = !!(
      currentAlert &&
      currentAlert.enabled !== false &&
      ((currentAlert.above !== undefined && Number.isFinite(currentAlert.above)) ||
       (currentAlert.below !== undefined && Number.isFinite(currentAlert.below)) ||
       (currentAlert.changePercent !== undefined && Number.isFinite(currentAlert.changePercent)))
    );

    const currency = item.currency || (item.type === "A_SHARE" ? "CNY" : (item.type === "HK_STOCK" ? "HKD" : "USD"));
    const currSym = currency === "CNY" ? "¥" : (currency === "HKD" ? "HK$" : "$");

    const hasQuote = item.price !== undefined && item.price > 0;
    const priceStr = maskMode ? "****" : formatPrice(item.price, currency);
    const sign = item.changePercent >= 0 ? "+" : "";
    const pctStr = maskMode ? "**" : `${sign}${item.changePercent.toFixed(2)}%`;
    const arrow = item.changePercent >= 0 ? "▲" : "▼";
    const colorHint = colorNeutral ? "•" : (item.changePercent >= 0 ? "🟢" : "🔴");

    const alertSuffix = hasAlert ? " 🔔" : "";
    const displayName = resolveItemDisplayName(this.confName, this.confSymbol, item);
    this.label = displayName;
    this.description = maskMode
      ? `****  **${alertSuffix}`
      : (hasQuote ? `${priceStr}  ${arrow} ${pctStr}${alertSuffix}` : `获取行情中…${alertSuffix}`);

    // ── 差异化构建 Tooltip ──
    const isAlpha = item.type === "ALPHA_TOKEN" || item.type === "BSC_TOKEN" || item.chain !== undefined;

    let mdText = "";
    if (isAlpha) {
      // 链上 Alpha 专属卡片
      const chainBadge = item.chain ? `\`${item.chain}\`` : "`DEX`";
      const dexBadge = item.dex ? `\`${item.dex}\`` : "`DEX`";
      const liqStr = formatLargeNumber(item.liquidity, false, "USD");
      const turnoverStr = formatLargeNumber(item.turnover, false, "USD");
      const openStr = item.open ? formatPrice(item.open, "USD") : "--";

      let changeAmtStr = "--";
      if (item.price && item.changePercent !== undefined) {
        const approxChange = item.price * (item.changePercent / 100);
        const cSign = approxChange >= 0 ? "+" : "";
        changeAmtStr = `${cSign}$${Math.abs(approxChange).toFixed(item.price < 1 ? 6 : 2)}`;
      }

      mdText =
        `### ${item.name} (\`${item.symbol}\`)\n` +
        `公链网络：${chainBadge} &nbsp;|&nbsp; 交易池：${dexBadge}\n\n` +
        `| 核心指标 | 实时行情 |\n` +
        `| :--- | :--- |\n` +
        `| **最新价格** | ${colorHint} **${priceStr}** |\n` +
        `| **24h 涨跌幅** | **${pctStr}** |\n` +
        `| **24h 涨跌额** | **${changeAmtStr}** |\n` +
        `| **开盘参考价** | ${openStr} |\n` +
        `| **流动性池 (Liquidity)** | **${liqStr}** |\n` +
        `| **24h 成交额** | **${turnoverStr}** |\n` +
        `| **合约地址** | \`${item.id}\` |\n\n` +
        `_数据源: DexScreener · ${new Date().toLocaleTimeString()}_`;
    } else {
      // A 股与 Binance 传统金融卡片
      const openStr = item.open !== undefined && item.open > 0 ? formatPrice(item.open, currency) : "--";
      const prevCloseStr = item.prevClose !== undefined && item.prevClose > 0 ? formatPrice(item.prevClose, currency) : "--";
      const highStr = item.high !== undefined && item.high > 0 ? formatPrice(item.high, currency) : "--";
      const lowStr = item.low !== undefined && item.low > 0 ? formatPrice(item.low, currency) : "--";

      let changeAmtStr = "--";
      if (item.change !== undefined) {
        const cSign = item.change >= 0 ? "+" : "";
        changeAmtStr = `${cSign}${currSym}${Math.abs(item.change).toFixed(item.price > 0 && item.price < 1 ? 4 : 2)}`;
      } else if (item.price > 0 && item.changePercent !== undefined) {
        const approxChange = item.price * (item.changePercent / 100);
        const cSign = approxChange >= 0 ? "+" : "";
        changeAmtStr = `${cSign}${currSym}${Math.abs(approxChange).toFixed(item.price < 1 ? 4 : 2)}`;
      }

      const volStr = formatLargeNumber(item.volume, true, currency);
      const turnoverStr = formatLargeNumber(item.turnover, false, currency);
      const currencyLabel = currency === "CNY" ? "人民币 (¥ CNY)" : (currency === "HKD" ? "港币 (HK$ HKD)" : "美元 ($ USD)");

      mdText =
        `### ${item.name} (\`${item.symbol}\`)\n` +
        `计价货币：**${currencyLabel}**\n\n` +
        `| 核心指标 | 实时行情 |\n` +
        `| :--- | :--- |\n` +
        `| **最新价格** | ${colorHint} **${priceStr}** |\n` +
        `| **涨跌百分比** | **${pctStr}** |\n` +
        `| **涨跌额** | **${changeAmtStr}** |\n` +
        `| **今日开盘** | ${openStr} |\n` +
        `| **昨日收盘** | ${prevCloseStr} |\n` +
        `| **今日最高** | ${highStr} |\n` +
        `| **今日最低** | ${lowStr} |\n` +
        `| **成交量** | ${volStr} |\n` +
        `| **成交额** | ${turnoverStr} |\n\n` +
        `_更新时间: ${new Date().toLocaleTimeString()}_`;
    }

    if (!hasQuote) {
      mdText += `\n\n> 💡 **提示**：若长期处于“获取行情中”，可能是当前网络或公司内网拦截了该接口。建议在插件设置中开启本地代理端口（如 10808），或在设置中暂时关闭该分组。`;
    }

    if (hasAlert && currentAlert) {
      const parts: string[] = [];
      if (currentAlert.above !== undefined && Number.isFinite(currentAlert.above)) {
        parts.push(`突破上限 ≥ ${currentAlert.above} ${currSym}`);
      }
      if (currentAlert.below !== undefined && Number.isFinite(currentAlert.below)) {
        parts.push(`跌破下限 ≤ ${currentAlert.below} ${currSym}`);
      }
      if (currentAlert.changePercent !== undefined && Number.isFinite(currentAlert.changePercent)) {
        parts.push(`单日剧烈波动 ≥ ±${currentAlert.changePercent}%`);
      }
      mdText += `\n\n---\n🔔 **到价与波动预警（已生效）**\n• ${parts.join("\n• ")}`;
    }

    this.tooltip = new vscode.MarkdownString(mdText);
    this.tooltip.isTrusted = true;

    if (!hasQuote) {
      this.iconPath = new vscode.ThemeIcon("sync~spin");
    } else if (colorNeutral) {
      // 颜色脱敏：使用系统默认前景色，杜绝红绿色视觉刺激
      this.iconPath = new vscode.ThemeIcon(
        item.changePercent >= 0 ? "arrow-up" : "arrow-down"
      );
    } else {
      this.iconPath = new vscode.ThemeIcon(
        item.changePercent >= 0 ? "arrow-up" : "arrow-down",
        new vscode.ThemeColor(
          item.changePercent >= 0 ? "charts.green" : "charts.red"
        )
      );
    }
  }
}

export class WatchlistProvider
  implements
    vscode.TreeDataProvider<GroupItem | StockItem>,
    vscode.TreeDragAndDropController<GroupItem | StockItem>
{
  readonly dropMimeTypes = ["application/vnd.code.tree.marketlens.watchlist"];
  readonly dragMimeTypes = ["application/vnd.code.tree.marketlens.watchlist"];

  public onBatchReorderCallback?: (
    items: Array<{ sourceGroup: string; sourceSymbol: string }>,
    targetGroup: string,
    targetSymbol?: string
  ) => void | Promise<void>;

  public onReorderCallback?: (
    sourceGroup: string,
    sourceSymbol: string,
    targetGroup: string,
    targetSymbol?: string
  ) => void | Promise<void>;

  private _onDidChangeTreeData = new vscode.EventEmitter<
    GroupItem | StockItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private groups: GroupItem[] = [];
  private stockMap = new Map<string, StockItem[]>();
  private alertsConfig: AlertsConfig = {};

  constructor(
    private maskMode: boolean,
    private colorNeutral: boolean = false
  ) {}

  public setAlerts(alerts: AlertsConfig): void {
    this.alertsConfig = alerts || {};
    for (const node of this.getAllUniqueNodes()) {
      const alertRule = this.getAlertRule(node.confSymbol, node.item);
      node.refresh(node.item, this.isMasked(), this.colorNeutral, alertRule);
    }
    this._onDidChangeTreeData.fire();
  }

  public getAlertRule(confSymbol: string, item?: MarketItem): PriceAlertItem | undefined {
    const alerts = this.alertsConfig;
    if (!alerts || Object.keys(alerts).length === 0) return undefined;
    const normKey = normalizeSymbolKey(confSymbol);
    const idKey = item?.id ? normalizeSymbolKey(item.id) : undefined;
    const symKey = item?.symbol ? normalizeSymbolKey(item.symbol) : undefined;
    const rawTicker = confSymbol.toLowerCase().replace(/^(us|hk|sh|sz|bj)[\._\-\/]?/i, "");

    return (
      (normKey && alerts[normKey] ? alerts[normKey] : undefined) ||
      (idKey && alerts[idKey] ? alerts[idKey] : undefined) ||
      (symKey && alerts[symKey] ? alerts[symKey] : undefined) ||
      alerts[confSymbol] ||
      alerts[confSymbol.toLowerCase()] ||
      (rawTicker && alerts[rawTicker] ? alerts[rawTicker] : undefined) ||
      (item?.symbol && alerts[item.symbol] ? alerts[item.symbol] : undefined) ||
      (item?.symbol && alerts[item.symbol.toLowerCase()] ? alerts[item.symbol.toLowerCase()] : undefined)
    );
  }

  handleDrag(
    source: readonly (GroupItem | StockItem)[],
    treeDataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    const stockItems = source.filter(
      (item): item is StockItem => item instanceof StockItem
    );
    if (stockItems.length > 0) {
      const payload = stockItems.map((it) => ({
        groupName: it.groupName,
        confSymbol: it.confSymbol,
        symbol: it.item?.symbol,
        id: it.item?.id,
        name: it.item?.name,
      }));
      treeDataTransfer.set(
        "application/vnd.code.tree.marketlens.watchlist",
        new vscode.DataTransferItem(payload)
      );
    }
  }

  async handleDrop(
    target: GroupItem | StockItem | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const transferItem = dataTransfer.get(
      "application/vnd.code.tree.marketlens.watchlist"
    );
    if (!transferItem) {
      return;
    }

    let rawList: any[] = [];
    if (Array.isArray(transferItem.value)) {
      rawList = transferItem.value;
    } else if (typeof transferItem.value === "string") {
      try {
        rawList = JSON.parse(transferItem.value);
      } catch {}
    } else {
      try {
        const str = await transferItem.asString();
        rawList = JSON.parse(str);
      } catch {}
    }

    if (!rawList || rawList.length === 0) {
      return;
    }

    let targetGroup: string | undefined;
    let targetSymbol: string | undefined;

    if (target instanceof GroupItem) {
      targetGroup = target.groupName;
      targetSymbol = undefined;
    } else if (target instanceof StockItem) {
      targetGroup = target.groupName;
      targetSymbol =
        target.confSymbol ||
        target.item?.symbol ||
        target.item?.id;
    }

    if (!targetGroup) {
      return;
    }

    if (!this.onBatchReorderCallback && !this.onReorderCallback) {
      return;
    }

    // 提取所有拖拽选中的有效标的列表
    const itemsToMove: Array<{ sourceGroup: string; sourceSymbol: string }> = [];
    for (const dragged of rawList) {
      const sourceGroup = dragged.groupName;
      const sourceSymbol =
        dragged.confSymbol ||
        dragged.symbol ||
        dragged.id ||
        (dragged.item ? (dragged.item.symbol || dragged.item.id) : undefined);

      if (sourceGroup && sourceSymbol) {
        itemsToMove.push({ sourceGroup, sourceSymbol });
      }
    }

    if (itemsToMove.length === 0) {
      return;
    }

    // 严格限制：只能在当前分组内移动，禁止跨分组拖拽
    if (itemsToMove.some((item) => item.sourceGroup !== targetGroup)) {
      return;
    }

    // 优先使用原子化批量重排回调（单次落盘与重绘）
    if (this.onBatchReorderCallback) {
      await this.onBatchReorderCallback(itemsToMove, targetGroup, targetSymbol);
    } else if (this.onReorderCallback) {
      for (const item of itemsToMove) {
        await this.onReorderCallback(
          item.sourceGroup,
          item.sourceSymbol,
          targetGroup,
          targetSymbol
        );
      }
    }
  }

  isEmpty(): boolean {
    return this.groups.length === 0;
  }

  getTreeItem(element: GroupItem | StockItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: GroupItem | StockItem
  ): vscode.ProviderResult<(GroupItem | StockItem)[]> {
    if (!element) {
      return this.groups;
    }
    if (element instanceof GroupItem) {
      return element.children;
    }
    return [];
  }

  buildTree(
    config: WatchlistConfig,
    quoteMap: Map<string, MarketItem>,
    enabledSections: { aShare: boolean; hkStock?: boolean; usStock?: boolean; binance: boolean; alpha: boolean } = {
      aShare: true,
      hkStock: true,
      usStock: true,
      binance: true,
      alpha: true,
    }
  ): void {
    this.stockMap.clear();

    const isSectionEnabled = (type?: string): boolean => {
      if (!type) return true; // 中立空组不归属任何单一边界板块，默认保持展示
      switch (type) {
        case "A_SHARE":
          return enabledSections.aShare !== false;
        case "HK_STOCK":
          return enabledSections.hkStock !== false;
        case "US_STOCK":
          return enabledSections.usStock !== false;
        case "CRYPTO":
          return enabledSections.binance !== false;
        case "ALPHA_TOKEN":
        case "BSC_TOKEN":
          return enabledSections.alpha !== false;
        default:
          return true;
      }
    };

    const isGroupEnabled = (groupName: string, items?: WatchConfigItem[]): boolean => {
      if (items && items.length > 0) {
        // 先看组内 item 的真实 type：只要组内至少存在一个处于启用板块的标的，该组即保持展示
        return items.some((item) => isSectionEnabled(resolveItemAssetType(item, groupName)));
      }
      // 组内为空时，按组名关键词推导所属板块进行兜底；若为中立组（如 "自选"）推导为 undefined，返回 true 保持展示
      const inferredType = resolveItemAssetType({ symbol: "" }, groupName);
      return isSectionEnabled(inferredType);
    };

    const filteredEntries = Object.entries(config).filter(([groupName, items]) => {
      return isGroupEnabled(groupName, items);
    });

    const getGroupWeight = (name: string, items?: WatchConfigItem[]): number => {
      // 组权重优先看组内标的主流类型，空组或无标的时按组名关键词兜底
      let dominantType: string | undefined;
      if (items && items.length > 0) {
        dominantType = resolveItemAssetType(items[0], name);
      } else {
        dominantType = resolveItemAssetType({ symbol: "" }, name);
      }
      switch (dominantType) {
        case "A_SHARE": return 1;
        case "HK_STOCK": return 2;
        case "US_STOCK": return 3;
        case "CRYPTO": return 4;
        case "ALPHA_TOKEN":
        case "BSC_TOKEN": return 5;
        default: return 100; // 中立空组排在最后
      }
    };

    filteredEntries.sort((a, b) => getGroupWeight(a[0], a[1]) - getGroupWeight(b[0], b[1]));

    this.groups = filteredEntries.map(([groupName, items]) => {
      const activeItems = (items || []).filter((conf) =>
        isSectionEnabled(resolveItemAssetType(conf, groupName))
      );
      const children = activeItems.map((conf) => {
        const normKey = normalizeSymbolKey(conf.symbol);
        const rawTicker = conf.symbol.toLowerCase().replace(/^(us|hk|sh|sz|bj)[\._\-]?/i, "");
        const found =
          quoteMap.get(normKey) ||
          quoteMap.get(conf.symbol) ||
          quoteMap.get(conf.symbol.toLowerCase()) ||
          quoteMap.get(rawTicker) || {
            id: conf.symbol,
            name: conf.name || conf.symbol,
            symbol: conf.symbol,
            type: conf.type,
            price: 0,
            changePercent: 0,
          };

        const alertRule = this.getAlertRule(conf.symbol, found);
        const node = new StockItem(found, groupName, conf.symbol, this.isMasked(), this.colorNeutral, alertRule, conf.name);
        // 使用规范化 key 存储，辅以原始 conf.symbol 索引，支持同一标的在不同分组中均能刷新
        const registerKey = (k?: string) => {
          if (!k) return;
          if (!this.stockMap.has(k)) {
            this.stockMap.set(k, []);
          }
          this.stockMap.get(k)!.push(node);
        };

        registerKey(normKey);
        if (conf.symbol !== normKey) {
          registerKey(conf.symbol);
          registerKey(conf.symbol.toLowerCase());
        }
        if (found.id && found.id !== conf.symbol) {
          registerKey(normalizeSymbolKey(found.id));
        }
        return node;
      });
      return new GroupItem(groupName, children);
    });

    this._onDidChangeTreeData.fire();
  }

  applyQuotes(quotes: MarketItem[]): void {
    for (const q of quotes) {
      const candidates = [
        normalizeSymbolKey(q.symbol),
        normalizeSymbolKey(q.id),
        q.symbol,
        q.id,
        q.symbol?.toLowerCase(),
        q.id?.toLowerCase(),
      ];

      for (const key of candidates.filter(Boolean)) {
        const nodes = this.stockMap.get(key as string);
        if (nodes && nodes.length > 0) {
          for (const node of nodes) {
            const alertRule = this.getAlertRule(node.confSymbol, q);
            node.refresh(q, this.isMasked(), this.colorNeutral, alertRule);
          }
          break;
        }
      }
    }
    // 性能优化：循环内不逐个触发 49 次 IPC 重绘，统一在批量刷新完成后原子性触发 1 次刷新
    this._onDidChangeTreeData.fire();
  }

  private getAllUniqueNodes(): StockItem[] {
    const set = new Set<StockItem>();
    for (const list of this.stockMap.values()) {
      for (const node of list) {
        set.add(node);
      }
    }
    return Array.from(set);
  }

  private bossKeyActive = false;

  setBossKey(active: boolean): void {
    this.bossKeyActive = active;
    for (const node of this.getAllUniqueNodes()) {
      node.refresh(node.item, this.isMasked(), this.colorNeutral);
    }
    this._onDidChangeTreeData.fire();
  }

  isBossKeyActive(): boolean {
    return this.bossKeyActive;
  }

  private isMasked(): boolean {
    return isDisplayMasked(this.bossKeyActive, this.maskMode);
  }

  setMaskMode(enabled: boolean): void {
    this.maskMode = enabled;
    for (const node of this.getAllUniqueNodes()) {
      node.refresh(node.item, this.isMasked(), this.colorNeutral);
    }
    this._onDidChangeTreeData.fire();
  }

  setColorNeutral(enabled: boolean): void {
    this.colorNeutral = enabled;
    for (const node of this.getAllUniqueNodes()) {
      node.refresh(node.item, this.isMasked(), this.colorNeutral);
    }
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}