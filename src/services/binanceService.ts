// src/services/binanceService.ts
import { MarketItem } from "../types";
import { cryptoGet, CryptoNetworkOptions } from "./network";

interface BinanceTicker24hr {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  prevClosePrice: string;
  volume: string;
  quoteVolume: string;
}

export class BinanceService {
  private normalizeSymbol(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  }

  private formatDisplayName(symbol: string): string {
    const quotes = ["USDT", "USDC", "FDUSD", "BUSD", "BTC", "ETH"];
    for (const q of quotes) {
      if (symbol.endsWith(q) && symbol.length > q.length) {
        return `${symbol.slice(0, -q.length)}/${q}`;
      }
    }
    return symbol;
  }

  /**
   * 批量拉取 Binance 行情
   * @param symbols 币对列表
   * @param options 网络代理配置（强制代理/直连、指定代理URL）
   */
  async fetchQuotes(
    symbols: string[],
    options: CryptoNetworkOptions = { mode: "proxy", proxyUrl: "http://127.0.0.1:10808" }
  ): Promise<MarketItem[]> {
    if (!symbols.length) { return []; }

    const cleanSymbols = [...new Set(symbols.map((s) => this.normalizeSymbol(s)).filter(Boolean))];
    if (!cleanSymbols.length) { return []; }

    const symbolsParam = encodeURIComponent(JSON.stringify(cleanSymbols));
    const endpoints = [
      `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${symbolsParam}`,
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsParam}`,
    ];

    for (const url of endpoints) {
      try {
        const response = await cryptoGet<BinanceTicker24hr[] | BinanceTicker24hr>(
          url,
          options,
          { timeout: 5000 }
        );

        const rawList = Array.isArray(response.data) ? response.data : [response.data];

        return rawList.map((item): MarketItem => {
          const sym = item.symbol;
          return {
            id:           sym,
            name:         this.formatDisplayName(sym),
            symbol:       sym,
            type:         "CRYPTO",
            price:        parseFloat(item.lastPrice)         || 0,
            changePercent: parseFloat(item.priceChangePercent) || 0,
            open:         parseFloat(item.openPrice)         || 0,
            prevClose:    parseFloat(item.prevClosePrice)    || 0,
            high:         parseFloat(item.highPrice)         || 0,
            low:          parseFloat(item.lowPrice)          || 0,
            change:       parseFloat(item.priceChange)       || 0,
            volume:       parseFloat(item.volume)            || 0,
            turnover:     parseFloat(item.quoteVolume)       || 0,
            currency:     "USD",
          };
        });
      } catch (err: any) {
        // 继续尝试下一个域名
      }
    }

    console.error("[BinanceService] All endpoints failed for:", cleanSymbols);
    return [];
  }
}