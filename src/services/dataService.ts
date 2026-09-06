// src/services/dataService.ts
// 数据获取服务（骨架层）——后续每种市场对应独立 fetcher

import * as vscode from "vscode";
import { Quote } from "../types";

// -------------------------------------------------------------------
// 内部工具
// -------------------------------------------------------------------

/** 安全等待一段时间，可被 AbortSignal 取消 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(tid);
      reject(new Error("aborted"));
    });
  });
}

// -------------------------------------------------------------------
// 抽象：每个市场实现此接口
// -------------------------------------------------------------------

export interface WatchItem {
  symbol: string;
  name?: string;
  market: string;
}

export interface MarketFetcher {
  fetchBatch(items: WatchItem[]): Promise<Quote[]>;
}

// -------------------------------------------------------------------
// 占位实现（开发阶段返回随机模拟数据）
// -------------------------------------------------------------------

class MockFetcher implements MarketFetcher {
  async fetchBatch(items: WatchItem[]): Promise<Quote[]> {
    return items.map((item) => {
      const base = Math.random() * 100 + 10;
      const changePercent = (Math.random() - 0.5) * 10;
      return {
        id: item.symbol,
        symbol: item.symbol,
        name: item.name ?? item.symbol,
        type: "A_SHARE" as const,
        price: parseFloat(base.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
        change: parseFloat(((base * changePercent) / 100).toFixed(2)),
      };
    });
  }
}

// -------------------------------------------------------------------
// DataService：聚合所有 fetcher，对外暴露统一接口
// -------------------------------------------------------------------

export class DataService implements vscode.Disposable {
  private readonly fetchers: Record<string, MarketFetcher> = {
    sh: new MockFetcher(),
    sz: new MockFetcher(),
    crypto: new MockFetcher(),
    bsc: new MockFetcher(),
  };

  /**
   * 批量拉取行情
   * @param items 需要更新的自选列表（扁平化）
   */
  async fetchAll(items: WatchItem[]): Promise<Quote[]> {
    // 按市场分组
    const grouped = items.reduce<Record<string, WatchItem[]>>((acc, item) => {
      (acc[item.market] ??= []).push(item);
      return acc;
    }, {});

    const results = await Promise.allSettled(
      Object.entries(grouped).map(([market, batch]) =>
        this.fetchers[market]?.fetchBatch(batch) ?? Promise.resolve([])
      )
    );

    const quotes: Quote[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        quotes.push(...r.value);
      } else {
        console.error("[MarketLens] fetch error:", r.reason);
      }
    }
    return quotes;
  }

  dispose(): void {
    // 未来：关闭 WebSocket / 取消 pending 请求
  }
}
