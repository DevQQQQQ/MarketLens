// src/services/hkStockService.ts
import { MarketItem } from "../types";
import { smartNetworkGet } from "./network";
import { logger } from "../utils/logger";

/**
 * 腾讯港股行情 API 字段索引
 * v_hk00700="100~腾讯控股~00700~378.200~376.000~377.000~...~涨跌额~涨跌幅%~最高~最低~成交量(股)~成交额(元)..."
 */
const F = {
  NAME:        1,
  CODE:        2,
  PRICE:       3,
  PREV_CLOSE:  4,
  OPEN:        5,
  VOLUME_SHARES: 6, // 港股成交量单位通常为股
  CHANGE_AMT:  31, // 涨跌额
  CHANGE_PCT:  32, // 涨跌幅 %
  HIGH:        33, // 今日最高
  LOW:         34, // 今日最低
  TURNOVER:    37, // 成交额 (元/港币)
} as const;

export class HKStockService {
  /**
   * 规范化港股代码，例如 "00700" -> "hk00700", "700" -> "hk00700", "hk00700" -> "hk00700"
   */
  public normalizeCode(raw: string): string {
    const clean = raw.trim().toLowerCase().replace(/^r_/, "");
    if (clean.startsWith("hk")) {
      const numPart = clean.slice(2);
      if (/^\d+$/.test(numPart)) {
        return `hk${numPart.padStart(5, "0")}`;
      }
      return clean;
    }
    if (/^\d+$/.test(clean) && clean.length <= 5) {
      return `hk${clean.padStart(5, "0")}`;
    }
    return `hk${clean}`;
  }

  async fetchQuotes(
    codes: string[],
    options: { mode: "proxy" | "direct"; proxyUrl?: string } = { mode: "direct" }
  ): Promise<MarketItem[]> {
    if (!codes.length) { return []; }

    const normalizedCodes = codes.map((c) => this.normalizeCode(c));
    const url = `https://qt.gtimg.cn/q=${normalizedCodes.join(",")}`;

    try {
      const response = await smartNetworkGet<ArrayBuffer>(url, options, {
        responseType: "arraybuffer",
        timeout: 5000,
      });

      const text = new TextDecoder("gbk").decode(response.data);
      const items: MarketItem[] = [];

      for (const line of text.split(";").map((l) => l.trim()).filter(Boolean)) {
        const match = line.match(/^v_([a-zA-Z0-9_\.]+)="(.+)"$/);
        if (!match) { continue; }

        const fullCode = match[1];
        const f = match[2].split("~");
        if (f.length < 35) { continue; }

        const price     = parseFloat(f[F.PRICE])      || 0;
        const prevClose = parseFloat(f[F.PREV_CLOSE]) || 0;
        const open      = parseFloat(f[F.OPEN])       || 0;
        const high      = parseFloat(f[F.HIGH])       || 0;
        const low       = parseFloat(f[F.LOW])        || 0;
        let changeAmt   = parseFloat(f[F.CHANGE_AMT]) || 0;
        let changePct   = parseFloat(f[F.CHANGE_PCT]) || 0;
        if (!changeAmt && price && prevClose) {
          changeAmt = price - prevClose;
        }
        if (!changePct && price && prevClose) {
          changePct = ((price - prevClose) / prevClose) * 100;
        }
        const volume    = parseFloat(f[F.VOLUME_SHARES]) || 0;
        const turnover  = parseFloat(f[F.TURNOVER])   || 0;

        items.push({
          id:           fullCode,
          name:         f[F.NAME] || f[F.CODE],
          symbol:       f[F.CODE] || fullCode.replace(/^hk/i, ""),
          type:         "HK_STOCK",
          price,
          changePercent: changePct,
          open,
          prevClose,
          high,
          low,
          change:   changeAmt,
          volume,
          turnover,
          currency: "HKD",
        });
      }

      return items;
    } catch (err) {
      logger.error("[HKStockService] fetchQuotes error:", err);
      return [];
    }
  }
}
