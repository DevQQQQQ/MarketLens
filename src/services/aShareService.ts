// src/services/aShareService.ts
import { MarketItem } from "../types";
import { directGet } from "./network";

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
  private normalizeCode(raw: string): string {
    const code = raw.trim().toLowerCase();
    if (/^(sh|sz|bj)/.test(code)) { return code; }
    if (/^[69]/.test(code)) { return `sh${code}`; }
    if (/^[03]/.test(code)) { return `sz${code}`; }
    if (/^[48]/.test(code)) { return `bj${code}`; }
    return `sh${code}`;
  }

  async fetchQuotes(
    codes: string[],
    options: { mode: "proxy" | "direct"; proxyUrl?: string } = { mode: "direct" }
  ): Promise<MarketItem[]> {
    if (!codes.length) { return []; }

    const normalizedCodes = codes.map((c) => this.normalizeCode(c));
    const url = `https://qt.gtimg.cn/q=${normalizedCodes.join(",")}`;

    try {
      const response = await directGet<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: 5000,
        proxy: options.mode === "proxy" ? undefined : false, // 由 network 层处理
      });

      const text = new TextDecoder("gbk").decode(response.data);
      const items: MarketItem[] = [];

      for (const line of text.split(";").map((l) => l.trim()).filter(Boolean)) {
        const match = line.match(/^v_([a-zA-Z0-9]+)="(.+)"$/);
        if (!match) { continue; }

        const fullCode = match[1];
        const f = match[2].split("~");
        if (f.length < 35) { continue; }

        const price     = parseFloat(f[F.PRICE])       || 0;
        const prevClose = parseFloat(f[F.PREV_CLOSE])  || 0;
        const open      = parseFloat(f[F.OPEN])        || 0;
        const high      = parseFloat(f[F.HIGH])        || 0;
        const low       = parseFloat(f[F.LOW])         || 0;
        const changeAmt = parseFloat(f[F.CHANGE_AMT])  || 0;
        const changePct = parseFloat(f[F.CHANGE_PCT])  || 0;
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
    } catch (err) {
      console.error("[AShareService] fetchQuotes error:", err);
      return [];
    }
  }
}