// src/types/index.ts

export type AssetType = "A_SHARE" | "HK_STOCK" | "US_STOCK" | "CRYPTO" | "BSC_TOKEN" | "ALPHA_TOKEN";

/** 统一行情数据结构 */
export interface MarketItem {
  id: string;
  name: string;
  symbol: string;
  type: AssetType;
  price: number;
  changePercent: number;

  // ── 扩展行情字段 ──
  open?: number;       // 今日开盘价 / 24h 前参考价
  prevClose?: number;  // 昨日收盘价
  high?: number;       // 今日最高价
  low?: number;        // 今日最低价
  change?: number;     // 涨跌额
  volume?: number;     // 成交量
  turnover?: number;   // 成交额 (USD / CNY / HKD)
  currency?: "CNY" | "USD" | "HKD"; // 计价货币

  // ── Alpha 链上代币专属字段 ──
  chain?: string;      // 公链标识，如 "bsc", "solana", "base", "ethereum"
  dex?: string;        // 所在 DEX，如 "pancakeswap", "raydium", "uniswap", "pumpfun"
  liquidity?: number;  // 流动性池资金 (USD)
}

// 兼容别名
export type Quote = MarketItem;

export interface WatchConfigItem {
  symbol: string;
  name?: string;
  type: AssetType;
}

export interface WatchlistConfig {
  [group: string]: WatchConfigItem[];
}

// ── 价格预警与剧烈波动类型 ──
export interface PriceAlertItem {
  symbol: string;
  name?: string;
  above?: number;          // 突破上限价格 (> X)
  below?: number;          // 跌破下限价格 (< X)
  changePercent?: number;  // 单日涨跌幅突破绝对值 (|%| >= X)
  enabled: boolean;        // 是否启用预警
}

export type AlertsConfig = Record<string, PriceAlertItem>;

export interface MarketLensConfig {
  // ── 全局设置 ──
  autoRefresh: boolean;
  refreshInterval: number;
  maskMode: boolean;
  colorNeutral: boolean;
  statusBar: { enabled: boolean };
  proxyPort?: number;
  proxyUrl?: string;

  // ── 分板块独立设置 ──
  aShare:  { enabled: boolean; networkMode: "proxy" | "direct"; proxyUrl: string; stopOnMarketClosed: boolean; statusBar: boolean };
  hkStock: { enabled: boolean; networkMode: "proxy" | "direct"; proxyUrl: string; stopOnMarketClosed: boolean; statusBar: boolean };
  usStock: { enabled: boolean; networkMode: "proxy" | "direct"; proxyUrl: string; stopOnMarketClosed: boolean; statusBar: boolean };
  binance: { enabled: boolean; networkMode: "proxy" | "direct"; proxyUrl: string; statusBar: boolean };
  alpha:   { enabled: boolean; networkMode: "proxy" | "direct"; proxyUrl: string; statusBar: boolean };

  // ── 自选列表 ──
  watchlist: WatchlistConfig;

  // ── 预警配置 ──
  alerts: AlertsConfig;
  alertNotificationMode: "notification" | "statusBarOnly" | "both";
  alertCooldownMinutes: number;
}