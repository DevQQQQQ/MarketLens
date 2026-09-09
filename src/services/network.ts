// src/services/network.ts
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import * as http from "http";

export interface CryptoNetworkOptions {
  mode: "proxy" | "direct";
  proxyUrl?: string;
}

/**
 * 主流代理客户端 HTTP/Mixed 端口探测池
 * 优先探测 HTTP 监听端口，确保与 Axios HTTP 代理协议无缝匹配
 */
export const COMMON_PROXY_PORTS = [
  7890,  // Clash / Clash Verge / ClashX (HTTP/Socks Mixed)
  7897,  // Mihomo Party (HTTP/Socks Mixed)
  10809, // v2rayN (HTTP)
  10808, // v2rayN (Socks/Mixed)
  2080,  // NekoBox / sing-box (Mixed)
  6152,  // Surge (HTTP)
  8889,  // Qv2ray (HTTP)
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

/** 上次探测所有 fallback 端口均失败的时间戳 */
let lastFallbackFailedTime = 0;
/** 探测冷却时间：30 秒（避免 10+ 并发请求在代理未开时同时遍历 9 端口打满网络） */
const FALLBACK_COOLDOWN_MS = 30_000;

/** 重置代理缓存与探测状态（当用户在设置面板修改网络配置时调用） */
export function resetProxyCache(): void {
  cachedWorkingPort = undefined;
  lastFallbackFailedTime = 0;
}

/**
 * 校验并规范化代理地址（防止用户输入为空、带特殊协议或格式残缺导致崩溃）
 * 1. 彻底纠偏 https://：本地代理服务器（如 127.0.0.1:7890）均为明文 HTTP 监听，填 https:// 会导致 Node.js 抛 EPROTO 握手异常，自动规整为 http://
 * 2. 友好支持 socks5:// / socks://：提取其中的 host 与 port，将其转换为 Node.js HTTP 代理形式，避免静默解析崩溃退回默认
 * 3. 完整保留认证信息 (http://user:pass@host:port)，杜绝企业级/隧道代理 407 鉴权失败
 * 4. 端口缺省时，对于非本地代理采用工业通用标准 8080（本地采用 7890/10808）
 */
export function validateAndNormalizeProxyUrl(rawUrl: string | undefined): string {
  if (!rawUrl || !rawUrl.trim()) {
    return cachedWorkingPort ? `http://127.0.0.1:${cachedWorkingPort}` : "http://127.0.0.1:7890";
  }
  let str = rawUrl.trim();

  // 若用户填了 socks5:// 或 socks://，剥离前缀并转换
  if (/^socks5?:\/\//i.test(str)) {
    str = str.replace(/^socks5?:\/\//i, "");
  }

  // 若用户填了 https://，剥离前缀转为 http://
  if (/^https?:\/\//i.test(str)) {
    str = str.replace(/^https?:\/\//i, "");
  }

  // 补齐 http:// 标准协议头
  str = `http://${str}`;

  try {
    const u = new URL(str);
    const host = u.hostname || "127.0.0.1";
    const isLocal = host === "127.0.0.1" || host === "localhost";
    const defaultPort = isLocal ? "7890" : "8080";
    const port = u.port || defaultPort;
    const authPart = u.username ? `${u.username}${u.password ? `:${u.password}` : ""}@` : "";
    return `http://${authPart}${host}:${port}`;
  } catch {
    return "http://127.0.0.1:7890";
  }
}

/**
 * 解析 proxyUrl，供 axios proxy 配置项使用
 * 提取 host, port, protocol 以及企业代理认证信息 auth (username, password)
 */
export function parseProxy(proxyUrlStr: string) {
  const normalized = validateAndNormalizeProxyUrl(proxyUrlStr);
  try {
    const url = new URL(normalized);
    const host = url.hostname || "127.0.0.1";
    const isLocal = host === "127.0.0.1" || host === "localhost";
    const defaultPort = isLocal ? 7890 : 8080;
    const port = parseInt(url.port, 10) || defaultPort;

    const res: {
      host: string;
      port: number;
      protocol: string;
      auth?: { username: string; password: string };
    } = {
      host,
      port,
      protocol: "http",
    };

    if (url.username || url.password) {
      res.auth = {
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      };
    }

    return res;
  } catch {
    return { host: "127.0.0.1", port: 7890, protocol: "http" };
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

  // 1. 直连模式（显式声明 proxy: false，杜绝宿主环境 http_proxy/https_proxy 环境变量隐式劫持）
  if (mode === "direct") {
    return await axios.get<T>(url, {
      ...mergedConfig,
      proxy: false,
    });
  }

  // 2. 强制代理模式（绝不直连）
  // 优先使用用户输入的代理或缺省/缓存代理（若 proxyUrl 为空，validateAndNormalizeProxyUrl 已自适应返回 cachedWorkingPort/7890）
  const targetProxy = parseProxy(proxyUrl || "");

  // 第一优先级：尝试目标代理端口
  try {
    const res = await axios.get<T>(url, {
      ...mergedConfig,
      proxy: targetProxy,
    });
    cachedWorkingPort = targetProxy.port;
    return res;
  } catch (err: any) {
    // 若远端服务器已正常返回 HTTP 响应（如 400 Bad Request, 404, 429），说明代理通道完全通畅且连接成功，
    // 绝非代理端口不可用，直接抛出原生异常保留 status 与业务错误体，杜绝误触发代理探测熔断
    if (err?.response) {
      throw err;
    }
    const now = Date.now();
    // 如果在冷却期内，直接拒绝探测，避免突发并发请求轮询探测卡死
    if (now - lastFallbackFailedTime < FALLBACK_COOLDOWN_MS) {
      throw new Error(
        `[MarketLens] 代理连接失败（端口探测处于冷却中，${Math.ceil((FALLBACK_COOLDOWN_MS - (now - lastFallbackFailedTime)) / 1000)}s 后重试）。已阻止直连。`
      );
    }

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

    // 所有代理端口均不可达，记录失败时间以开启冷却熔断
    lastFallbackFailedTime = Date.now();

    // 所有代理端口不可达，阻止直连，保护隐私
    throw new Error(
      `[MarketLens] 代理连接失败。已阻止直连。请确认代理软件已启动。`
    );
  }
}

// 兼容别名
export const cryptoGet = smartNetworkGet;