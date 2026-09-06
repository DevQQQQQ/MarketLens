// src/services/dexScreenerService.ts
import { MarketItem } from "../types";
import { cryptoGet, CryptoNetworkOptions } from "./network";

interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number; m5?: number };
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexPair[] | null;
}

function isValidContractAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

function formatChainName(chainId: string | undefined): string {
  if (!chainId) return "DEX";
  const lower = chainId.toLowerCase();
  switch (lower) {
    case "bsc": return "BSC";
    case "solana": return "Solana";
    case "base": return "Base";
    case "ethereum": return "Ethereum";
    case "arbitrum": return "Arbitrum";
    case "polygon": return "Polygon";
    case "avalanche": return "Avalanche";
    case "sui": return "Sui";
    case "ton": return "TON";
    default: return chainId.toUpperCase();
  }
}

function formatDexName(dexId: string | undefined): string {
  if (!dexId) return "DEX";
  const lower = dexId.toLowerCase();
  switch (lower) {
    case "pancakeswap": return "PancakeSwap";
    case "raydium": return "Raydium";
    case "uniswap": return "Uniswap";
    case "pumpfun": return "Pump.fun";
    case "meteora": return "Meteora";
    case "aerodrome": return "Aerodrome";
    default: return dexId.charAt(0).toUpperCase() + dexId.slice(1);
  }
}

function pickBestPair(pairs: DexPair[]): DexPair | null {
  if (!pairs?.length) { return null; }
  return pairs.reduce((best, cur) =>
    (cur.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0) ? cur : best
  , pairs[0]);
}

export class DexScreenerService {
  /**
   * 全链 Alpha 抓取（支持代理模式与直连模式配置）
   */
  async fetchQuotes(
    contractAddresses: string[],
    options: CryptoNetworkOptions = { mode: "proxy", proxyUrl: "http://127.0.0.1:10808" }
  ): Promise<MarketItem[]> {
    if (!contractAddresses?.length) { return []; }

    const validAddresses = [...new Set(
      contractAddresses
        .map((a) => a.trim())
        .filter((a) => {
          if (!isValidContractAddress(a)) {
            console.warn(
              `[DexScreenerService] 跳过无效地址 "${a}"` +
              " — Alpha 代币请使用 EVM (0x...) 或 Solana Mint 合约地址。"
            );
            return false;
          }
          return true;
        })
    )];

    if (!validAddresses.length) { return []; }

    const results = await Promise.allSettled(
      validAddresses.map((address) => this.fetchOne(address, options))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<MarketItem | null> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((v): v is MarketItem => v !== null);
  }

  private async fetchOne(
    address: string,
    options: CryptoNetworkOptions
  ): Promise<MarketItem | null> {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
    const response = await cryptoGet<DexScreenerResponse>(url, options, { timeout: 5000 });

    const pairs = response.data?.pairs;
    if (!pairs?.length) { return null; }

    const best = pickBestPair(pairs);
    if (!best) { return null; }

    const priceUsd = parseFloat(best.priceUsd) || 0;
    const changeH24 = best.priceChange?.h24 ?? 0;

    let estimatedOpen: number | undefined = undefined;
    if (priceUsd > 0 && changeH24 !== -100) {
      estimatedOpen = priceUsd / (1 + changeH24 / 100);
    }

    return {
      id:            address,
      name:          best.baseToken?.name   || best.baseToken?.symbol || "Unknown",
      symbol:        best.baseToken?.symbol || "TOKEN",
      type:          "ALPHA_TOKEN",
      price:         priceUsd,
      changePercent: changeH24,
      open:          estimatedOpen,
      prevClose:     estimatedOpen,
      turnover:      best.volume?.h24 ?? 0,
      liquidity:     best.liquidity?.usd ?? 0,
      chain:         formatChainName(best.chainId),
      dex:           formatDexName(best.dexId),
      currency:      "USD",
    };
  }
}