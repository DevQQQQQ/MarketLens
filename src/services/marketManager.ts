// src/services/marketManager.ts
import { MarketItem } from "../types";
import { AShareService } from "./aShareService";
import { HKStockService } from "./hkStockService";
import { USStockService } from "./usStockService";
import { BinanceService } from "./binanceService";
import { DexScreenerService } from "./dexScreenerService";
import { CryptoNetworkOptions } from "./network";

export interface PollTargets {
  aShares?: string[];
  hkStocks?: string[];
  usStocks?: string[];
  cryptos?: string[];
  bscTokens?: string[];
}

export class MarketManager {
  private aShareService: AShareService;
  private hkStockService: HKStockService;
  private usStockService: USStockService;
  private binanceService: BinanceService;
  private dexScreenerService: DexScreenerService;

  constructor() {
    this.aShareService = new AShareService();
    this.hkStockService = new HKStockService();
    this.usStockService = new USStockService();
    this.binanceService = new BinanceService();
    this.dexScreenerService = new DexScreenerService();
  }

  /**
   * 统一调度方法：并行抓取 A股、港股、美股、主流加密货币、Alpha 链上代币五类资产并聚合输出
   */
  async pollAll(
    targets: PollTargets,
    aShareOptions: CryptoNetworkOptions = { mode: "direct" },
    hkStockOptions: CryptoNetworkOptions = { mode: "direct" },
    usStockOptions: CryptoNetworkOptions = { mode: "direct" },
    binanceOptions: CryptoNetworkOptions = { mode: "proxy", proxyUrl: "http://127.0.0.1:10808" },
    alphaOptions: CryptoNetworkOptions = { mode: "proxy", proxyUrl: "http://127.0.0.1:10808" }
  ): Promise<MarketItem[]> {
    const { aShares = [], hkStocks = [], usStocks = [], cryptos = [], bscTokens = [] } = targets;

    const [aShareRes, hkRes, usRes, cryptoRes, bscRes] = await Promise.allSettled([
      aShares.length ? this.aShareService.fetchQuotes(aShares, aShareOptions) : Promise.resolve([]),
      hkStocks.length ? this.hkStockService.fetchQuotes(hkStocks, hkStockOptions) : Promise.resolve([]),
      usStocks.length ? this.usStockService.fetchQuotes(usStocks, usStockOptions) : Promise.resolve([]),
      cryptos.length ? this.binanceService.fetchQuotes(cryptos, binanceOptions) : Promise.resolve([]),
      bscTokens.length ? this.dexScreenerService.fetchQuotes(bscTokens, alphaOptions) : Promise.resolve([]),
    ]);

    const aggregated: MarketItem[] = [];

    if (aShareRes.status === "fulfilled") {
      aggregated.push(...aShareRes.value);
    } else {
      console.error("[MarketManager] AShare fetch failed:", aShareRes.reason);
    }

    if (hkRes.status === "fulfilled") {
      aggregated.push(...hkRes.value);
    } else {
      console.error("[MarketManager] HKStock fetch failed:", hkRes.reason);
    }

    if (usRes.status === "fulfilled") {
      aggregated.push(...usRes.value);
    } else {
      console.error("[MarketManager] USStock fetch failed:", usRes.reason);
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