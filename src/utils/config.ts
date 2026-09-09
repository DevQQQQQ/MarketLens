// src/utils/config.ts
import * as vscode from "vscode";
import { MarketLensConfig } from "../types";

/**
 * 读取 MarketLens 全局与用户配置
 */
export function readConfig(): MarketLensConfig {
  const cfg = vscode.workspace.getConfiguration("marketlens");

  return {
    autoRefresh:     cfg.get<boolean>("autoRefresh", true),
    refreshInterval: cfg.get<number>("refreshInterval", 5000),
    maskMode:        cfg.get<boolean>("maskMode", false),
    colorNeutral:    cfg.get<boolean>("colorNeutral", false),

    statusBar: {
      enabled: cfg.get<boolean>("statusBar.enabled", true),
    },

    aShare: {
      enabled:            cfg.get<boolean>("aShare.enabled", true),
      statusBar:          cfg.get<boolean>("aShare.statusBar", true),
      networkMode:        cfg.get<"proxy" | "direct">("aShare.networkMode", "direct"),
      proxyUrl:           cfg.get<string>("aShare.proxyUrl", "http://127.0.0.1:7890"),
      stopOnMarketClosed: cfg.get<boolean>("aShare.stopOnMarketClosed", true),
    },
    hkStock: {
      enabled:            cfg.get<boolean>("hkStock.enabled", true),
      statusBar:          cfg.get<boolean>("hkStock.statusBar", true),
      networkMode:        cfg.get<"proxy" | "direct">("hkStock.networkMode", "direct"),
      proxyUrl:           cfg.get<string>("hkStock.proxyUrl", "http://127.0.0.1:7890"),
      stopOnMarketClosed: cfg.get<boolean>("hkStock.stopOnMarketClosed", true),
    },
    usStock: {
      enabled:            cfg.get<boolean>("usStock.enabled", true),
      statusBar:          cfg.get<boolean>("usStock.statusBar", true),
      networkMode:        cfg.get<"proxy" | "direct">("usStock.networkMode", "direct"),
      proxyUrl:           cfg.get<string>("usStock.proxyUrl", "http://127.0.0.1:7890"),
      stopOnMarketClosed: cfg.get<boolean>("usStock.stopOnMarketClosed", true),
    },
    binance: {
      enabled:     cfg.get<boolean>("binance.enabled", true),
      statusBar:   cfg.get<boolean>("binance.statusBar", true),
      networkMode: cfg.get<"proxy" | "direct">("binance.networkMode", "proxy"),
      proxyUrl:    cfg.get<string>("binance.proxyUrl", "http://127.0.0.1:7890"),
    },
    alpha: {
      enabled:     cfg.get<boolean>("alpha.enabled", true),
      statusBar:   cfg.get<boolean>("alpha.statusBar", true),
      networkMode: cfg.get<"proxy" | "direct">("alpha.networkMode", "proxy"),
      proxyUrl:    cfg.get<string>("alpha.proxyUrl", "http://127.0.0.1:7890"),
    },

    watchlist: cfg.get("watchlist", {}),
  };
}

export { getWatchlistFingerprint } from "./symbolHelper";
