// src/utils/config.ts
import * as vscode from "vscode";
import { MarketLensConfig } from "../types";
import { computeStatusBarEnabled } from "./symbolHelper";
import { getSystemProxyUrl } from "../services/network";

function getSectionConfig(
  cfg: vscode.WorkspaceConfiguration,
  section: string,
  defaults: { networkMode: "proxy" | "direct"; proxyUrl: string; stopOnMarketClosed?: boolean }
) {
  const sectionObj = cfg.get<any>(section) || {};
  return {
    enabled: cfg.get<boolean>(`${section}.enabled`) ?? sectionObj.enabled ?? true,
    statusBar: cfg.get<boolean>(`${section}.statusBar`) ?? sectionObj.statusBar ?? true,
    networkMode: (cfg.get<"proxy" | "direct">(`${section}.networkMode`) ?? sectionObj.networkMode ?? defaults.networkMode) as "proxy" | "direct",
    proxyUrl: cfg.get<string>(`${section}.proxyUrl`) ?? sectionObj.proxyUrl ?? defaults.proxyUrl,
    stopOnMarketClosed: cfg.get<boolean>(`${section}.stopOnMarketClosed`) ?? sectionObj.stopOnMarketClosed ?? (defaults.stopOnMarketClosed ?? true),
  };
}

/**
 * 读取 MarketLens 全局与用户配置
 */
export function readConfig(): MarketLensConfig {
  const cfg = vscode.workspace.getConfiguration("marketlens");
  const portInspect = cfg.inspect<number>("proxyPort");
  const urlInspect = cfg.inspect<string>("proxyUrl");
  const isCustomPort = portInspect?.globalValue !== undefined || portInspect?.workspaceValue !== undefined;
  const isCustomUrl = urlInspect?.globalValue !== undefined || urlInspect?.workspaceValue !== undefined;

  let proxyPort = cfg.get<number>("proxyPort", 10808);
  let globalProxy = cfg.get<string>("proxyUrl") || `http://127.0.0.1:${proxyPort}`;

  // 若用户未主动在 VS Code 设置中显式配置自定义代理端口与地址，自适应读取操作系统代理环境变量
  if (!isCustomPort && !isCustomUrl) {
    const sysProxy = getSystemProxyUrl();
    if (sysProxy) {
      globalProxy = sysProxy;
      try {
        const u = new URL(sysProxy);
        if (u.port) {
          proxyPort = parseInt(u.port, 10);
        }
      } catch (_) {}
    }
  }

  const fund    = getSectionConfig(cfg, "fund",    { networkMode: "direct", proxyUrl: globalProxy, stopOnMarketClosed: true });
  const aShare  = getSectionConfig(cfg, "aShare",  { networkMode: "direct", proxyUrl: globalProxy, stopOnMarketClosed: true });
  const hkStock = getSectionConfig(cfg, "hkStock", { networkMode: "direct", proxyUrl: globalProxy, stopOnMarketClosed: true });
  const usStock = getSectionConfig(cfg, "usStock", { networkMode: "direct", proxyUrl: globalProxy, stopOnMarketClosed: true });
  const binance = getSectionConfig(cfg, "binance", { networkMode: "proxy",  proxyUrl: globalProxy });
  const alpha   = getSectionConfig(cfg, "alpha",   { networkMode: "proxy",  proxyUrl: globalProxy });

  const explicitStatusBarEnabled = cfg.get<boolean>("statusBar.enabled");
  const anyTabsStatusBar = fund.statusBar || aShare.statusBar || hkStock.statusBar || usStock.statusBar || binance.statusBar || alpha.statusBar;
  // 总控开关判定：显式关闭时彻底关闭状态栏；未显式关闭时，只要有任意板块开启轮播即保持状态栏展示
  const isStatusBarEnabled = computeStatusBarEnabled(explicitStatusBarEnabled, anyTabsStatusBar);

  return {
    autoRefresh:     cfg.get<boolean>("autoRefresh", true),
    refreshInterval: cfg.get<number>("refreshInterval", 5000),
    maskMode:        cfg.get<boolean>("maskMode", false),
    colorNeutral:    cfg.get<boolean>("colorNeutral", false),
    colorScheme:     cfg.get<"greenUpRedDown" | "redUpGreenDown">("colorScheme", "greenUpRedDown"),
    proxyPort,
    proxyUrl:        globalProxy,

    statusBar: {
      enabled: isStatusBarEnabled,
    },

    fund,
    aShare,
    hkStock,
    usStock,
    binance,
    alpha,

    watchlist: cfg.get("watchlist", {}),
    alerts: cfg.get("alerts", {}),
    alertNotificationMode: cfg.get<"notification" | "statusBarOnly" | "both">("alertNotificationMode", "notification"),
    alertCooldownMinutes: cfg.get<number>("alertCooldownMinutes", 15),
  };
}

export { getWatchlistFingerprint, computeStatusBarEnabled } from "./symbolHelper";
