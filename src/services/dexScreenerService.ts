// src/services/dexScreenerService.ts
import { MarketItem } from "../types";
import { cryptoGet, CryptoNetworkOptions } from "./network";
import { logger } from "../utils/logger";

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
    options: CryptoNetworkOptions = { mode: "proxy", proxyUrl: "http://127.0.0.1:7890" }
  ): Promise<MarketItem[]> {
    if (!contractAddresses?.length) { return []; }

    const validAddresses = [...new Set(
      contractAddresses
        .map((a) => a.trim())
        .filter((a) => {
          if (!isValidContractAddress(a)) {
            logger.warn(
              `[DexScreenerService] 跳过无效地址 "${a}"` +
              " — Alpha 代币请使用 EVM (0x...) 或 Solana Mint 合约地址。"
            );
            return false;
          }
          return true;
        })
    )];

    if (!validAddresses.length) { return []; }

    // DexScreener API 单次响应硬限制最多返回 30 个流动性池（pairs）。
    // 若代币较为热门，单个代币常包含 4~5 个交易池，若每批包含较多代币，总池数超过 30 就会导致排在后面的代币被服务端截断挤掉（如 quq）。
    // 因此将分批切片大小限制为安全的 5 个地址/批，既保证极低的 HTTP 开销，又彻底杜绝代币被截断丢失。
    const CHUNK_SIZE = 5;
    const chunks: string[][] = [];
    for (let i = 0; i < validAddresses.length; i += CHUNK_SIZE) {
      chunks.push(validAddresses.slice(i, i + CHUNK_SIZE));
    }

    const chunkResults = await Promise.allSettled(
      chunks.map((chunk) => this.fetchBatch(chunk, options))
    );

    const items: MarketItem[] = [];
    const acquiredAddresses = new Set<string>();
    // 记录因网络/代理错误彻底失败的批次地址——这些是真正的网络故障，不做补查
    const networkFailedAddresses = new Set<string>();

    for (let i = 0; i < chunkResults.length; i++) {
      const r = chunkResults[i];
      if (r.status === "fulfilled") {
        if (r.value.networkError) {
          // 批次因网络错误失败，将这批地址标记，补查无意义（只会再次超时）
          for (const addr of chunks[i]) {
            networkFailedAddresses.add(addr.toLowerCase());
          }
        } else {
          for (const item of r.value.items) {
            items.push(item);
            if (item.id) {
              acquiredAddresses.add(item.id.toLowerCase());
            }
          }
        }
      }
    }

    // 自动漏网探测（Self-Healing）：仅对 HTTP 成功但因池子过多被截断的地址补查
    // 网络/代理故障的地址直接跳过，防止代理断开时 N 次单查重演
    const missingAddresses = validAddresses.filter((a) => {
      const lower = a.toLowerCase();
      return !acquiredAddresses.has(lower) && !networkFailedAddresses.has(lower);
    });
    if (missingAddresses.length > 0) {
      const fallbackResults = await Promise.allSettled(
        missingAddresses.map((addr) => this.fetchBatch([addr], options))
      );
      for (const fr of fallbackResults) {
        if (fr.status === "fulfilled" && !fr.value.networkError) {
          items.push(...fr.value.items);
        }
      }
    }

    return items;
  }

  private async fetchBatch(
    addresses: string[],
    options: CryptoNetworkOptions
  ): Promise<{ items: MarketItem[]; networkError: boolean }> {
    if (addresses.length === 0) return { items: [], networkError: false };
    const joined = addresses.join(",");
    const url = `https://api.dexscreener.com/latest/dex/tokens/${joined}`;
    try {
      const response = await cryptoGet<DexScreenerResponse>(url, options, { timeout: 6000 });
      const pairs = response.data?.pairs || [];
      if (!pairs.length) return { items: [], networkError: false };

      // 按 baseToken address 将 pairs 分组
      const pairsByToken = new Map<string, DexPair[]>();
      for (const p of pairs) {
        const addr = p.baseToken?.address;
        if (!addr) continue;
        const lowAddr = addr.toLowerCase();
        if (!pairsByToken.has(lowAddr)) {
          pairsByToken.set(lowAddr, []);
        }
        pairsByToken.get(lowAddr)!.push(p);
      }

      const items: MarketItem[] = [];
      for (const targetAddr of addresses) {
        const tokenPairs = pairsByToken.get(targetAddr.toLowerCase()) || [];
        if (!tokenPairs.length) continue;

        const best = pickBestPair(tokenPairs);
        if (!best) continue;

        const priceUsd = parseFloat(best.priceUsd) || 0;
        const changeH24 = best.priceChange?.h24 ?? 0;

        let estimatedOpen: number | undefined = undefined;
        if (priceUsd > 0 && changeH24 !== -100) {
          estimatedOpen = priceUsd / (1 + changeH24 / 100);
        }

        items.push({
          id:            targetAddr,
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
        });
      }
      return { items, networkError: false };
    } catch (err: any) {
      // 有 err.response 说明是 HTTP 业务错误（如 404 合约不存在），不算网络故障
      const isNetworkError = !err?.response;
      logger.error(`[DexScreenerService] 批量拉取代币行情失败: ${err?.message || err}`, err);
      return { items: [], networkError: isNetworkError };
    }
  }
}