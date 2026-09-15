// src/services/usStockService.ts
import type { MarketItem } from "../types";
import { smartNetworkGet } from "./network.ts";
import { logger } from "../utils/logger.ts";
import { normalizeUSCode, chunkArray, decodeGbk } from "../utils/symbolHelper.ts";

/**
 * 腾讯美股行情 API 字段索引
 * v_usAAPL="200~苹果~AAPL.OQ~185.92~185.00~186.00~...~涨跌额~涨跌幅%~最高~最低~成交量(股)~成交额(美元)..."
 */
const F = {
  NAME:        1,
  CODE:        2,
  PRICE:       3,
  PREV_CLOSE:  4,
  OPEN:        5,
  VOLUME_SHARES: 6,
  CHANGE_AMT:  31, // 涨跌额
  CHANGE_PCT:  32, // 涨跌幅 %
  HIGH:        33, // 今日最高
  LOW:         34, // 今日最低
  TURNOVER:    37, // 成交额 (美元)
} as const;

export class USStockService {
  private readonly CHUNK_SIZE = 40;

  /**
   * 规范化美股代码，例如 "AAPL" -> "usAAPL", "usAAPL" -> "usAAPL", "us.IXIC" -> "usIXIC", ".IXIC" -> "usIXIC"
   */
  public normalizeCode(raw: string): string {
    return normalizeUSCode(raw);
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
      const rawContent = match[2];
      if (!rawContent) { continue; }

      const f = rawContent.split("~");
      if (f.length < 10) {
        logger.warn(
          `[USStockService] 标的 ${fullCode} 返回字段不足 (length=${f.length})，该代码可能不存在或已退市`
        );
        continue;
      }

      const price     = parseFloat(f[F.PRICE])      || 0;
      const prevClose = parseFloat(f[F.PREV_CLOSE]) || 0;
      const open      = parseFloat(f[F.OPEN])       || 0;
      const high      = f.length > F.HIGH ? (parseFloat(f[F.HIGH]) || 0) : 0;
      const low       = f.length > F.LOW ? (parseFloat(f[F.LOW]) || 0) : 0;
      let changeAmt   = f.length > F.CHANGE_AMT ? (parseFloat(f[F.CHANGE_AMT]) || 0) : 0;
      let changePct   = f.length > F.CHANGE_PCT ? (parseFloat(f[F.CHANGE_PCT]) || 0) : 0;

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
              `[USStockService] 标的 ${fullCode} 字段疑似位移或数据不自洽 (现价:${price}, 昨收:${prevClose}, 报文涨跌额:${changeAmt}), 已自动使用价格自愈`
            );
          }
          changeAmt = Number(expectedAmt.toFixed(price < 1 ? 4 : 2));
          changePct = Number(expectedPct.toFixed(2));
        }
      }

      const volume    = f.length > F.VOLUME_SHARES ? (parseFloat(f[F.VOLUME_SHARES]) || 0) : 0;
      const turnover  = f.length > F.TURNOVER ? (parseFloat(f[F.TURNOVER]) || 0) : 0;

      // 提取简写代码，如 "AAPL.OQ" -> "AAPL", "usIXIC" -> "IXIC"
      const rawSymbol = f[F.CODE] || fullCode.replace(/^us[\._\-]?/i, "");
      const parts = rawSymbol.split(".").filter(Boolean);
      const symbol = parts.length > 0 ? parts[0] : rawSymbol;

      items.push({
        id:           fullCode,
        name:         f[F.NAME] || symbol,
        symbol:       symbol,
        type:         "US_STOCK",
        price,
        changePercent: changePct,
        open,
        prevClose,
        high,
        low,
        change:   changeAmt,
        volume,
        turnover,
        currency: "USD",
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
      logger.error("[USStockService] fetchBatch error:", err);
      return [];
    }
  }
}
