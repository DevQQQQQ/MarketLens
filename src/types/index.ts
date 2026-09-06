// src/types/index.ts

export type AssetType = "A_SHARE" | "CRYPTO" | "BSC_TOKEN" | "ALPHA_TOKEN";

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
  turnover?: number;   // 成交额 (USD / CNY)
  currency?: "CNY" | "USD"; // 计价货币

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

export interface SectionConfig {
  enabled: boolean;
  networkMode?: "proxy" | "direct";
  proxyUrl?: string;
}

export interface MarketLensConfig {
  // ── 全局设置 ──
  autoRefresh: boolean;
  refreshInterval: number;
  maskMode: boolean;
  colorNeutral: boolean;

  // ── 分板块独立设置 ──
  aShare: { enabled: boolean; networkMode: "proxy" | "direct"; proxyUrl: string; stopOnMarketClosed: boolean };
  binance: { enabled: boolean; networkMode: "proxy" | "direct"; proxyUrl: string };
  alpha: { enabled: boolean; networkMode: "proxy" | "direct"; proxyUrl: string };

  // ── 自选列表 ──
  watchlist: WatchlistConfig;
}