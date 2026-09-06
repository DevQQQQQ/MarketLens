// src/services/network.ts
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import * as http from "http";

export interface CryptoNetworkOptions {
  mode: "proxy" | "direct";
  proxyUrl?: string;
}

/**
 * 主流代理客户端端口探测池
 */
export const COMMON_PROXY_PORTS = [
  10808, // v2rayN (Socks/Mixed)
  10809, // v2rayN (HTTP)
  7890,  // Clash / Clash Verge / ClashX
  7897,  // Mihomo Party
  2080,  // NekoBox / sing-box
  1080,  // Shadowsocks
  6152,  // Surge
  8889,  // Qv2ray
  16100, // OpenClash / 内网定制
];

const BASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

/** 缓存当前探测到的可用本地代理端口，避免其他用户（如 7890）每次刷新重复卡顿 */
let cachedWorkingPort: number | undefined = undefined;

/**
 * 校验并规范化代理地址（防止用户输入为空或残缺导致崩溃）
 */
export function validateAndNormalizeProxyUrl(rawUrl: string | undefined): string {
  if (!rawUrl || !rawUrl.trim()) {
    return cachedWorkingPort ? `http://127.0.0.1:${cachedWorkingPort}` : "http://127.0.0.1:10808";
  }
  let str = rawUrl.trim();
  if (!/^https?:\/\//i.test(str)) {
    str = `http://${str}`;
  }
  try {
    const u = new URL(str);
    if (!u.port) {
      return "http://127.0.0.1:10808";
    }
    return str;
  } catch {
    return "http://127.0.0.1:10808";
  }
}

/**
 * 解析 proxyUrl
 */
function parseProxy(proxyUrlStr: string) {
  const normalized = validateAndNormalizeProxyUrl(proxyUrlStr);
  try {
    const url = new URL(normalized);
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
 * 快速检测某个本地端口是否开启了 HTTP 代理监听（超时 400ms）
 */
function testLocalPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "HEAD",
        path: "http://data-api.binance.vision/api/v3/ping",
        timeout: 600,
      },
      (res) => {
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * 自动探测本机当前活跃的代理端口（供设置界面“一键探测”使用）
 */
export async function detectAvailableProxy(): Promise<string | null> {
  for (const port of COMMON_PROXY_PORTS) {
    const ok = await testLocalPort(port);
    if (ok) {
      cachedWorkingPort = port;
      return `http://127.0.0.1:${port}`;
    }
  }
  return null;
}

/**
 * 通用网络请求核心方法（支持 direct 直连 与 proxy 强制代理）
 */
export async function smartNetworkGet<T = any>(
  url: string,
  options: CryptoNetworkOptions,
  config: AxiosRequestConfig = {}
): Promise<AxiosResponse<T>> {
  const { mode = "direct", proxyUrl } = options;

  const mergedConfig: AxiosRequestConfig = {
    ...config,
    timeout: config.timeout || 5000,
    headers: { ...BASE_HEADERS, ...config.headers },
  };

  // 1. 直连模式
  if (mode === "direct") {
    return await axios.get<T>(url, mergedConfig);
  }

  // 2. 强制代理模式（绝不直连）
  // 优先使用已缓存的有效端口，或用户输入的代理
  let targetProxy = parseProxy(proxyUrl || "");
  if (cachedWorkingPort && targetProxy.port === 10808 && cachedWorkingPort !== 10808) {
    targetProxy = { ...targetProxy, port: cachedWorkingPort };
  }

  // 第一优先级：尝试目标代理端口
  try {
    const res = await axios.get<T>(url, {
      ...mergedConfig,
      proxy: targetProxy,
    });
    cachedWorkingPort = targetProxy.port;
    return res;
  } catch (err: any) {
    // 第二优先级：自动自适应探测其他主流端口
    for (const port of COMMON_PROXY_PORTS) {
      if (port === targetProxy.port) continue;
      try {
        const res = await axios.get<T>(url, {
          ...mergedConfig,
          timeout: 2500, // 快速探测
          proxy: { host: "127.0.0.1", port, protocol: "http" },
        });
        // 成功！记录并缓存此端口，后续无需重试
        cachedWorkingPort = port;
        return res;
      } catch {
        // 继续探测下一个端口
      }
    }

    // 所有代理端口不可达，阻止直连，保护隐私
    throw new Error(
      `[MarketLens] 代理连接失败。已阻止直连。请确认代理软件已启动。`
    );
  }
}

// 兼容别名
export const cryptoGet = smartNetworkGet;
export async function directGet<T = any>(url: string, config: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
  return smartNetworkGet<T>(url, { mode: "direct" }, config);
}