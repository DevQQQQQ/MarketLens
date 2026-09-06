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
   * @param aShareOptions 针对 A股 板块的网络配置（默认 direct 直连）
   * @param binanceOptions 针对 Binance 板块的网络配置（默认 proxy 强制代理）
   * @param alphaOptions 针对 Alpha 板块的网络配置（默认 proxy 强制代理）
   */
  async pollAll(
    targets: PollTargets,
    aShareOptions: CryptoNetworkOptions = { mode: "direct" },
    binanceOptions: CryptoNetworkOptions = { mode: "proxy", proxyUrl: "http://127.0.0.1:10808" },
    alphaOptions: CryptoNetworkOptions = { mode: "proxy", proxyUrl: "http://127.0.0.1:10808" }
  ): Promise<MarketItem[]> {
    const { aShares = [], cryptos = [], bscTokens = [] } = targets;

    const [aShareRes, cryptoRes, bscRes] = await Promise.allSettled([
      aShares.length ? this.aShareService.fetchQuotes(aShares, aShareOptions) : Promise.resolve([]),
      cryptos.length ? this.binanceService.fetchQuotes(cryptos, binanceOptions) : Promise.resolve([]),
      bscTokens.length ? this.dexScreenerService.fetchQuotes(bscTokens, alphaOptions) : Promise.resolve([]),
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