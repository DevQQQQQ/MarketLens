// src/services/aShareService.ts
import type { MarketItem } from "../types";
import { smartNetworkGet } from "./network.ts";
import { logger } from "../utils/logger.ts";
import { chunkArray, decodeGbk, normalizeAShareCode } from "../utils/symbolHelper.ts";

/**
 * 腾讯行情 API 字段索引（经验证）
 * v_sh600519="1~名称~代码~现价~昨收~今开~成交量(手)~外盘~内盘~...~涨跌额~涨跌幅%~最高~最低~成交额(元)~..."
 */
const F = {
  NAME:         1,
  CODE:         2,
  PRICE:        3,
  PREV_CLOSE:   4,
  OPEN:         5,
  VOLUME_LOTS:  6,   // 成交量（手），1手=100股
  CHANGE_AMT:   31,  // 涨跌额
  CHANGE_PCT:   32,  // 涨跌幅 %
  HIGH:         33,  // 今日最高
  LOW:          34,  // 今日最低
  TURNOVER:     37,  // 成交额（万元）
} as const;

export class AShareService {
  private readonly CHUNK_SIZE = 40;

  private normalizeCode(raw: string): string {
    // 统一复用 symbolHelper 的交易所推断规则，确保与输入解析端（inputValidator）绝对一致
    return normalizeAShareCode(raw);
  }

  public parseResponse(text: string): MarketItem[] {
    const items: MarketItem[] = [];

    for (const line of text.split(";").map((l) => l.trim()).filter(Boolean)) {
      const match = line.match(/^v_([a-zA-Z0-9]+)="(.+)"$/);
      if (!match) { continue; }

      const fullCode = match[1];
      const f = match[2].split("~");
      if (f.length < 35) {
        logger.warn(
          `[AShareService] 标的 ${fullCode} 返回字段不足 (length=${f.length})，该代码可能不存在或已退市`
        );
        continue;
      }

      const price     = parseFloat(f[F.PRICE])       || 0;
      const prevClose = parseFloat(f[F.PREV_CLOSE])  || 0;
      const open      = parseFloat(f[F.OPEN])        || 0;
      const high      = parseFloat(f[F.HIGH])        || 0;
      const low       = parseFloat(f[F.LOW])         || 0;
      let changeAmt   = parseFloat(f[F.CHANGE_AMT])  || 0;
      let changePct   = parseFloat(f[F.CHANGE_PCT])  || 0;

      // 三角数学自洽校验与容错自愈：防止上游字段插入位移或偶发空值导致静默错值
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
              `[AShareService] 标的 ${fullCode} 字段疑似位移或数据不自洽 (现价:${price}, 昨收:${prevClose}, 报文涨跌额:${changeAmt}), 已自动使用价格自愈`
            );
          }
          changeAmt = Number(expectedAmt.toFixed(price < 1 ? 4 : 2));
          changePct = Number(expectedPct.toFixed(2));
        }
      }

      // 成交量：手 × 100 = 股数
      const volume    = (parseFloat(f[F.VOLUME_LOTS]) || 0) * 100;
      // 成交额：万元 → 元
      const turnover  = (parseFloat(f[F.TURNOVER])   || 0) * 10000;

      items.push({
        id:           fullCode,
        name:         f[F.NAME] || f[F.CODE],
        symbol:       f[F.CODE],
        type:         "A_SHARE",
        price,
        changePercent: changePct,
        open,
        prevClose,
        high,
        low,
        change:   changeAmt,
        volume,
        turnover,
        currency: "CNY",
      });
    }

    return items;
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
      logger.error("[AShareService] fetchBatch error:", err);
      return [];
    }
  }
}