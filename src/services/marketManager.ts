// src/services/marketManager.ts
import { MarketItem } from "../types";
import { AShareService } from "./aShareService";
import { BinanceService } from "./binanceService";
import { DexScreenerService } from "./dexScreenerService";
import { CryptoNetworkOptions } from "./network";

export interface PollTargets {
  aShares?: string[];
  cryptos?: string[];
  bscTokens?: string[];
}

export class MarketManager {
  private aShareService: AShareService;
  private binanceService: BinanceService;
  private dexScreenerService: DexScreenerService;

  constructor() {
    this.aShareService = new AShareService();
    this.binanceService = new BinanceService();
    this.dexScreenerService = new DexScreenerService();
  }

  /**
   * 统一调度方法：并行抓取 A股、主流加密货币、Alpha 链上代币三类资产并聚合输出
   * @param targets 需要拉取的目标列表
   * @param cryptoOptions 针对加密货币与 Alpha 的代理配置（默认强制代理，严禁直连泄密）
   */
  async pollAll(
    targets: PollTargets,
    cryptoOptions: CryptoNetworkOptions = { mode: "proxy", proxyUrl: "http://127.0.0.1:10808" }
  ): Promise<MarketItem[]> {
    const { aShares = [], cryptos = [], bscTokens = [] } = targets;

    // A股走直连；Binance 与 Alpha 严格遵循用户的代理模式
    const [aShareRes, cryptoRes, bscRes] = await Promise.allSettled([
      this.aShareService.fetchQuotes(aShares),
      this.binanceService.fetchQuotes(cryptos, cryptoOptions),
      this.dexScreenerService.fetchQuotes(bscTokens, cryptoOptions),
    ]);

    const aggregated: MarketItem[] = [];

    if (aShareRes.status === "fulfilled") {
      aggregated.push(...aShareRes.value);
    } else {
      console.error("[MarketManager] AShare fetch failed:", aShareRes.reason);
    }

    if (cryptoRes.status === "fulfilled") {
      aggregated.push(...cryptoRes.value);
    } else {
      console.error("[MarketManager] Crypto fetch failed:", cryptoRes.reason);
    }

    if (bscRes.status === "fulfilled") {
      aggregated.push(...bscRes.value);
    } else {
      console.error("[MarketManager] Alpha token fetch failed:", bscRes.reason);
    }

    return aggregated;
  }
}