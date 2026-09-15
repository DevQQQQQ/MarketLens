// src/services/hkStockService.ts
import type { MarketItem } from "../types";
import { smartNetworkGet } from "./network.ts";
import { logger } from "../utils/logger.ts";
import { chunkArray, decodeGbk } from "../utils/symbolHelper.ts";

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
  private readonly CHUNK_SIZE = 40;

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
    const chunks = chunkArray(normalizedCodes, this.CHUNK_SIZE);

    const chunkPromises = chunks.map((batch) => this.fetchBatch(batch, options));
    const results = await Promise.all(chunkPromises);
    return results.flat();
  }

  public parseResponse(text: string): MarketItem[] {
    const items: MarketItem[] = [];

    for (const line of text.split(";").map((l) => l.trim()).filter(Boolean)) {
      const match = line.match(/^v_([a-zA-Z0-9_\.]+)="(.+)"$/);
      if (!match) { continue; }

      const fullCode = match[1];
      const f = match[2].split("~");
      if (f.length < 35) {
        logger.warn(
          `[HKStockService] 标的 ${fullCode} 返回字段不足 (length=${f.length})，该代码可能不存在或已退市`
        );
        continue;
      }

      const price     = parseFloat(f[F.PRICE])      || 0;
      const prevClose = parseFloat(f[F.PREV_CLOSE]) || 0;
      const open      = parseFloat(f[F.OPEN])       || 0;
      const high      = parseFloat(f[F.HIGH])       || 0;
      const low       = parseFloat(f[F.LOW])        || 0;
      let changeAmt   = parseFloat(f[F.CHANGE_AMT]) || 0;
      let changePct   = parseFloat(f[F.CHANGE_PCT]) || 0;

      // 三角数学自洽校验与容错自愈
      if (price > 0 && prevClose > 0) {
        const expectedAmt = price - prevClose;
        const expectedPct = (expectedAmt / prevClose) * 100;
        const amtDiff = Math.abs(changeAmt - expectedAmt);
        const pctDiff = Math.abs(changePct - expectedPct);

        const isAmtBroken = !changeAmt || (amtDiff > 0.08 && (Math.abs(expectedAmt) > 0 ? amtDiff / Math.abs(expectedAmt) > 0.15 : true));
        const isPctBroken = !changePct || (pctDiff > 1.5);

        if (isAmtBroken || isPctBroken) {
          if (changeAmt !== 0 || changePct !== 0) {
            logger.warn(
              `[HKStockService] 标的 ${fullCode} 字段疑似位移或数据不自洽 (现价:${price}, 昨收:${prevClose}, 报文涨跌额:${changeAmt}), 已自动使用价格自愈`
            );
          }
          changeAmt = Number(expectedAmt.toFixed(price < 1 ? 4 : 2));
          changePct = Number(expectedPct.toFixed(2));
        }
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
  }

  private async fetchBatch(
    batch: string[],
    options: { mode: "proxy" | "direct"; proxyUrl?: string }
  ): Promise<MarketItem[]> {
    if (!batch.length) { return []; }
    const url = `https://qt.gtimg.cn/q=${batch.join(",")}`;

    try {
      const response = await smartNetworkGet<ArrayBuffer>(url, options, {
        responseType: "arraybuffer",
        timeout: 5000,
      });

      const text = decodeGbk(response.data);
      return this.parseResponse(text);
    } catch (err) {
      logger.error("[HKStockService] fetchBatch error:", err);
      return [];
    }
  }
}
