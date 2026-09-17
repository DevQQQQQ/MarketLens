// src/services/tencentBaseService.ts
import type { MarketItem } from "../types";
import { smartNetworkGet } from "./network.ts";
import { logger } from "../utils/logger.ts";
import { chunkArray, decodeGbk } from "../utils/symbolHelper.ts";

/**
 * 腾讯行情通用基类 (TencentBaseService)
 * 统一承载腾讯股票/指数 API (qt.gtimg.cn) 的通用分批调度、GBK解码、网络容错与三角数学自洽自愈逻辑。
 * 各子类仅需提供板块特定的字段映射与代码归一化规则。
 */
export abstract class TencentBaseService {
  protected readonly CHUNK_SIZE = 40;

  public abstract readonly serviceName: string;
  public abstract readonly currency: NonNullable<MarketItem["currency"]>;
  public abstract readonly assetType: MarketItem["type"];

  /**
   * 规范化标的代码（如补足前缀、补前导0等）
   */
  public abstract normalizeCode(raw: string): string;

  /**
   * 解析上游返回的 GBK 报文文本
   */
  public abstract parseResponse(text: string): MarketItem[];

  /**
   * 批量抓取标的最新行情
   */
  public async fetchQuotes(
    codes: string[],
    options: { mode: "proxy" | "direct"; proxyUrl?: string } = { mode: "direct" }
  ): Promise<MarketItem[]> {
    if (!codes.length) {
      return [];
    }

    const normalizedCodes = codes.map((c) => this.normalizeCode(c));
    const chunks = chunkArray(normalizedCodes, this.CHUNK_SIZE);

    const chunkPromises = chunks.map((batch) => this.fetchBatch(batch, options));
    const results = await Promise.all(chunkPromises);
    return results.flat();
  }

  /**
   * 单批次网络拉取与解码
   */
  protected async fetchBatch(
    batch: string[],
    options: { mode: "proxy" | "direct"; proxyUrl?: string }
  ): Promise<MarketItem[]> {
    if (!batch.length) {
      return [];
    }
    const url = `https://qt.gtimg.cn/q=${batch.join(",")}`;

    try {
      const response = await smartNetworkGet<ArrayBuffer>(url, options, {
        responseType: "arraybuffer",
        timeout: 5000,
      });

      const text = decodeGbk(response.data);
      return this.parseResponse(text);
    } catch (err) {
      logger.error(`[${this.serviceName}] fetchBatch error:`, err);
      return [];
    }
  }

  /**
   * 三角数学自洽校验与容错自愈：
   * 防止上游字段插入位移或偶发空值导致静默错值 (现价 - 昨收 = 涨跌额)
   */
  protected selfHealChange(
    price: number,
    prevClose: number,
    changeAmt: number,
    changePct: number,
    fullCode: string
  ): { changeAmt: number; changePct: number } {
    if (price > 0 && prevClose > 0) {
      const expectedAmt = price - prevClose;
      const expectedPct = (expectedAmt / prevClose) * 100;
      const amtDiff = Math.abs(changeAmt - expectedAmt);
      const pctDiff = Math.abs(changePct - expectedPct);

      const isAmtBroken =
        !changeAmt || (amtDiff > 0.08 && (Math.abs(expectedAmt) > 0 ? amtDiff / Math.abs(expectedAmt) > 0.15 : true));
      const isPctBroken = !changePct || pctDiff > 1.5;

      if (isAmtBroken || isPctBroken) {
        if (changeAmt !== 0 || changePct !== 0) {
          logger.warn(
            `[${this.serviceName}] 标的 ${fullCode} 字段疑似位移或数据不自洽 (现价:${price}, 昨收:${prevClose}, 报文涨跌额:${changeAmt}), 已自动使用价格自愈`
          );
        }
        return {
          changeAmt: Number(expectedAmt.toFixed(price < 1 ? 4 : 2)),
          changePct: Number(expectedPct.toFixed(2)),
        };
      }
    }
    return { changeAmt, changePct };
  }
}
