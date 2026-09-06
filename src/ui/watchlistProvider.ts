// src/ui/watchlistProvider.ts
import * as vscode from "vscode";
import { MarketItem, WatchlistConfig } from "../types";

/**
 * 智能格式化价格
 */
function formatPrice(price: number, currency: "CNY" | "USD" = "USD"): string {
  if (price === 0) return "0.00";
  const sym = currency === "CNY" ? "¥" : "$";
  if (price < 0.0001) return `${sym}${price.toExponential(4)}`;
  if (price < 1) return `${sym}${price.toFixed(6)}`;
  if (price < 10) return `${sym}${price.toFixed(3)}`;
  return `${sym}${price.toFixed(2)}`;
}

/**
 * 格式化大数值（成交量 / 成交额 / 流动性）
 */
function formatLargeNumber(num: number | undefined, isVolume: boolean, currency: "CNY" | "USD" = "USD"): string {
  if (num === undefined || num === 0) return "--";

  const prefix = isVolume ? "" : (currency === "CNY" ? "¥" : "$");
  const unit = isVolume ? (currency === "CNY" ? "股" : "") : "";

  if (currency === "CNY") {
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
    this.contextValue = "groupItem";
    this.iconPath = new vscode.ThemeIcon("folder");
    this.description = `(${children.length})`;
  }
}

/** 单只股票 / 代币节点 */
export class StockItem extends vscode.TreeItem {
  constructor(
    public item: MarketItem,
    private maskMode: boolean
  ) {
    super(item.name || item.symbol, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "stockItem";
    this.refresh(item, maskMode);
  }

  /** 更新显示内容与悬停详细信息 */
  refresh(item: MarketItem, maskMode: boolean): void {
    this.item = item;
    const currency = item.currency || (item.type === "A_SHARE" ? "CNY" : "USD");
    const currSym = currency === "CNY" ? "¥" : "$";

    const priceStr = maskMode ? "****" : formatPrice(item.price, currency);
    const sign = item.changePercent >= 0 ? "+" : "";
    const pctStr = maskMode ? "**" : `${sign}${item.changePercent.toFixed(2)}%`;
    const arrow = item.changePercent >= 0 ? "▲" : "▼";
    const colorHint = item.changePercent >= 0 ? "🟢" : "🔴";

    this.label = item.name || item.symbol;
    this.description = maskMode ? "****  **" : `${priceStr}  ${arrow} ${pctStr}`;

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
        changeAmtStr = `${cSign}${currSym}${Math.abs(item.change).toFixed(item.price < 1 ? 4 : 2)}`;
      } else if (item.price && item.changePercent !== undefined) {
        const approxChange = item.price * (item.changePercent / 100);
        const cSign = approxChange >= 0 ? "+" : "";
        changeAmtStr = `${cSign}${currSym}${Math.abs(approxChange).toFixed(item.price < 1 ? 4 : 2)}`;
      }

      const volStr = formatLargeNumber(item.volume, true, currency);
      const turnoverStr = formatLargeNumber(item.turnover, false, currency);
      const currencyLabel = currency === "CNY" ? "人民币 (CNY)" : "美元 (USD)";

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

    this.tooltip = new vscode.MarkdownString(mdText);
    this.tooltip.isTrusted = true;

    this.iconPath = new vscode.ThemeIcon(
      item.changePercent >= 0 ? "arrow-up" : "arrow-down",
      new vscode.ThemeColor(
        item.changePercent >= 0 ? "charts.green" : "charts.red"
      )
    );
  }
}

export class WatchlistProvider
  implements vscode.TreeDataProvider<GroupItem | StockItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    GroupItem | StockItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private groups: GroupItem[] = [];
  private stockMap = new Map<string, StockItem>();

  constructor(private maskMode: boolean) {}

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

  buildTree(config: WatchlistConfig, quoteMap: Map<string, MarketItem>): void {
    this.stockMap.clear();

    this.groups = Object.entries(config).map(([groupName, items]) => {
      const children = (items || []).map((conf) => {
        const key = conf.symbol.toLowerCase();
        const found =
          quoteMap.get(key) ||
          quoteMap.get(conf.symbol) || {
            id: conf.symbol,
            name: conf.name || conf.symbol,
            symbol: conf.symbol,
            type: conf.type,
            price: 0,
            changePercent: 0,
          };

        const node = new StockItem(found, this.maskMode);
        this.stockMap.set(key, node);
        this.stockMap.set(conf.symbol, node);
        if (found.id) {
          this.stockMap.set(found.id.toLowerCase(), node);
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
        q.id?.toLowerCase(),
        q.symbol?.toLowerCase(),
        q.id,
        q.symbol,
      ].filter(Boolean) as string[];

      for (const key of candidates) {
        const node = this.stockMap.get(key);
        if (node) {
          node.refresh(q, this.maskMode);
          this._onDidChangeTreeData.fire(node);
          break;
        }
      }
    }
  }

  setMaskMode(enabled: boolean): void {
    this.maskMode = enabled;
    for (const node of this.stockMap.values()) {
      node.refresh(node.item, enabled);
    }
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}