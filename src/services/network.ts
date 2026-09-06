// src/services/network.ts
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

export interface CryptoNetworkOptions {
  mode: "proxy" | "direct";
  proxyUrl?: string;
}

/**
 * 本机常见代理软件默认端口大全（自动探测列表）
 * 覆盖：
 * - 10808 / 10809: v2rayN 经典 SOCKS / HTTP 端口
 * - 7890: Clash / Clash for Windows / Clash Verge / ClashX 默认混合端口
 * - 7897: Mihomo Party / 新版 Clash 默认端口
 * - 2080: NekoBox / sing-box 默认端口
 * - 1080: Shadowsocks (原版) 经典端口
 * - 6152: Surge (Mac) 默认 HTTP 端口
 * - 8889: Qv2ray 默认 HTTP 端口
 * - 16100 / 20171: 部分公司内网 / OpenClash 常用定制端口
 */
const COMMON_PROXY_PORTS = [
  10808, // v2rayN (Socks/Mixed)
  10809, // v2rayN (HTTP)
  7890,  // Clash / Clash Verge / ClashX
  7897,  // Mihomo Party
  2080,  // NekoBox / sing-box
  1080,  // Shadowsocks
  6152,  // Surge
  8889,  // Qv2ray
  16100, // OpenClash / 内网定制
  20171, // 部分定制代理
];

const BASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

/**
 * 解析 proxyUrl，如 "http://127.0.0.1:10808"
 */
function parseProxy(proxyUrlStr: string) {
  try {
    const url = new URL(proxyUrlStr);
    return {
      host: url.hostname || "127.0.0.1",
      port: parseInt(url.port, 10) || 10808,
      protocol: url.protocol.replace(":", "") || "http",
    };
  } catch {
    return { host: "127.0.0.1", port: 10808, protocol: "http" };
  }
}

/**
 * 专门用于 A 股国内接口的直连请求（安全、合规、零延迟）
 */
export async function directGet<T = any>(
  url: string,
  config: AxiosRequestConfig = {}
): Promise<AxiosResponse<T>> {
  return await axios.get<T>(url, {
    ...config,
    timeout: 5000,
    headers: { ...BASE_HEADERS, ...config.headers },
  });
}

/**
 * 专门用于 Binance 和 Alpha (DexScreener) 的请求：
 * - 默认强制走代理，严禁发起任何直连包，避免公司网关/DNS 审计！
 * - 优先走用户配置的 proxyUrl；若不通，自动轮询探测常见客户端端口自适应连通。
 * - 允许在设置中切换为 direct (直连)
 */
export async function cryptoGet<T = any>(
  url: string,
  options: CryptoNetworkOptions,
  config: AxiosRequestConfig = {}
): Promise<AxiosResponse<T>> {
  const { mode = "proxy", proxyUrl = "http://127.0.0.1:10808" } = options;

  const mergedConfig: AxiosRequestConfig = {
    ...config,
    timeout: 5000,
    headers: { ...BASE_HEADERS, ...config.headers },
  };

  // 1. 直连模式（用户在 settings.json 中明确配置为 direct 时）
  if (mode === "direct") {
    return await axios.get<T>(url, mergedConfig);
  }

  // 2. 代理模式（默认）：强制走代理
  const targetProxy = parseProxy(proxyUrl);

  // 第一优先级：尝试用户配置的代理端口
  try {
    return await axios.get<T>(url, {
      ...mergedConfig,
      proxy: targetProxy,
    });
  } catch (err: any) {
    // 第二优先级：自动轮询常见代理客户端端口进行探测连接
    for (const port of COMMON_PROXY_PORTS) {
      if (port === targetProxy.port) continue;
      try {
        return await axios.get<T>(url, {
          ...mergedConfig,
          timeout: 3000, // 备选端口快速探测
          proxy: { host: "127.0.0.1", port, protocol: "http" },
        });
      } catch {
        // 该端口未开启或不通，继续探测下一个备选端口
      }
    }

    // 所有已知代理端口均不可达时，报错并阻止直连，保护隐私
    throw new Error(
      `[MarketLens] 代理请求失败 (${url})。已自动尝试所有主流代理端口 (10808, 10809, 7890, 7897, 2080, 1080, 6152 等)，均无法连接。为保护公司网络安全，已阻止直连。请确认本地代理客户端已启动。`
    );
  }
}