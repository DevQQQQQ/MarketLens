// src/services/alertManager.ts
import type * as vscodeTypes from "vscode";
import type { MarketItem, MarketLensConfig, PriceAlertItem } from "../types";
import { normalizeSymbolKey } from "../utils/symbolHelper.ts";
import type { StatusBar } from "../ui/statusBar";

let vscodeModule: typeof vscodeTypes | undefined;
try {
  vscodeModule = require("vscode");
} catch (_) {}

function readConfigFallback(): MarketLensConfig {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readConfig } = require("../utils/config");
    return readConfig();
  } catch (_) {
    return {} as any;
  }
}

export interface AlertTriggerEvent {
  symbolKey: string;
  item: MarketItem;
  rule: PriceAlertItem;
  type: "above" | "below" | "changePercent";
  currentValue: number;
  thresholdValue: number;
}

export class AlertManager {
  private readonly cooldownMap = new Map<string, number>();
  private readonly statusBar?: StatusBar;

  constructor(statusBar?: StatusBar) {
    this.statusBar = statusBar;
  }

  /**
   * 手动对指定标的加设静音冷却时间（毫秒）
   */
  public mute(symbolKey: string, minutes: number = 15): void {
    const normKey = normalizeSymbolKey(symbolKey) || symbolKey.toLowerCase();
    const expiry = Date.now() + minutes * 60 * 1000;
    this.cooldownMap.set(`${normKey}:above`, expiry);
    this.cooldownMap.set(`${normKey}:below`, expiry);
    this.cooldownMap.set(`${normKey}:changePercent`, expiry);
  }

  /**
   * 清空所有冷却记录（供测试和重置使用）
   */
  public resetCooldown(): void {
    this.cooldownMap.clear();
  }

  /**
   * 在行情拉取完成后，由调度器调用进行纯内存预警评估
   */
  public checkQuotes(quotes: MarketItem[], customConfig?: MarketLensConfig): AlertTriggerEvent[] {
    if (!quotes || quotes.length === 0) {
      return [];
    }

    const config = customConfig || readConfigFallback();
    const alerts = config.alerts || {};
    if (Object.keys(alerts).length === 0) {
      return [];
    }

    // 老板键激活状态下一票否决：全量静音，杜绝弹窗与状态栏泄密
    if (this.statusBar?.isBossKeyActive()) {
      return [];
    }

    const cooldownMs = Math.max(1, config.alertCooldownMinutes || 15) * 60 * 1000;
    const now = Date.now();
    const triggeredEvents: AlertTriggerEvent[] = [];

    for (const q of quotes) {
      if (!q || !q.symbol) continue;

      const normSym = normalizeSymbolKey(q.symbol);
      const normId  = q.id ? normalizeSymbolKey(q.id) : undefined;
      const rawTicker = q.symbol.toLowerCase().replace(/^(us|hk|sh|sz|bj)[\._\-]?/i, "");

      // 多键尝试匹配预警规则
      const matchedKey =
        (normSym && alerts[normSym] ? normSym : undefined) ||
        (normId && alerts[normId] ? normId : undefined) ||
        (alerts[q.symbol] ? q.symbol : undefined) ||
        (alerts[q.symbol.toLowerCase()] ? q.symbol.toLowerCase() : undefined) ||
        (rawTicker && alerts[rawTicker] ? rawTicker : undefined);

      if (!matchedKey) continue;
      const rule = alerts[matchedKey];
      if (!rule || rule.enabled === false) continue;

      // 1. 检查突破上限
      if (rule.above !== undefined && Number.isFinite(rule.above) && q.price > 0 && q.price >= rule.above) {
        const cKey = `${matchedKey}:above`;
        const lastTrigger = this.cooldownMap.get(cKey) || 0;
        if (now - lastTrigger >= cooldownMs) {
          this.cooldownMap.set(cKey, now);
          triggeredEvents.push({
            symbolKey: matchedKey,
            item: q,
            rule,
            type: "above",
            currentValue: q.price,
            thresholdValue: rule.above,
          });
        }
      }

      // 2. 检查跌破下限
      if (rule.below !== undefined && Number.isFinite(rule.below) && q.price > 0 && q.price <= rule.below) {
        const cKey = `${matchedKey}:below`;
        const lastTrigger = this.cooldownMap.get(cKey) || 0;
        if (now - lastTrigger >= cooldownMs) {
          this.cooldownMap.set(cKey, now);
          triggeredEvents.push({
            symbolKey: matchedKey,
            item: q,
            rule,
            type: "below",
            currentValue: q.price,
            thresholdValue: rule.below,
          });
        }
      }

      // 3. 检查单日剧烈涨跌幅绝对值突破
      if (
        rule.changePercent !== undefined &&
        Number.isFinite(rule.changePercent) &&
        rule.changePercent > 0 &&
        Math.abs(q.changePercent) >= rule.changePercent
      ) {
        const cKey = `${matchedKey}:changePercent`;
        const lastTrigger = this.cooldownMap.get(cKey) || 0;
        if (now - lastTrigger >= cooldownMs) {
          this.cooldownMap.set(cKey, now);
          triggeredEvents.push({
            symbolKey: matchedKey,
            item: q,
            rule,
            type: "changePercent",
            currentValue: q.changePercent,
            thresholdValue: rule.changePercent,
          });
        }
      }
    }

    // 分发触发通知
    for (const evt of triggeredEvents) {
      this.dispatchAlert(evt, config);
    }

    return triggeredEvents;
  }

  private dispatchAlert(evt: AlertTriggerEvent, config: MarketLensConfig): void {
    const isMasked = config.maskMode;
    const displayName = isMasked ? "****" : (evt.item.name || evt.item.symbol);
    const displaySymbol = isMasked ? "**" : evt.item.symbol;
    const currency = evt.item.currency ? ` ${evt.item.currency}` : "";

    let alertMessage = "";
    let statusText = "";

    if (evt.type === "above") {
      alertMessage = `🔔 [MarketLens 预警] ${displayName} (${displaySymbol}) 现价已突破上限：${evt.currentValue}${currency}（设定阈值 ≥ ${evt.thresholdValue}）`;
      statusText = `$(bell) [突破预警] ${displayName} ${evt.currentValue}`;
    } else if (evt.type === "below") {
      alertMessage = `⚠️ [MarketLens 预警] ${displayName} (${displaySymbol}) 现价已跌破下限：${evt.currentValue}${currency}（设定阈值 ≤ ${evt.thresholdValue}）`;
      statusText = `$(warning) [跌破预警] ${displayName} ${evt.currentValue}`;
    } else {
      const sign = evt.currentValue >= 0 ? "+" : "";
      alertMessage = `⚡ [MarketLens 波动] ${displayName} (${displaySymbol}) 今日涨跌幅达到 ${sign}${evt.currentValue.toFixed(2)}%（阈值 ±${evt.thresholdValue}%）`;
      statusText = `$(pulse) [剧烈波动] ${displayName} ${sign}${evt.currentValue.toFixed(2)}%`;
    }

    const mode = config.alertNotificationMode || "notification";

    // 状态栏静默提醒通道
    if ((mode === "statusBarOnly" || mode === "both") && this.statusBar) {
      this.statusBar.flashAlert(statusText, 15000);
    }

    // 右下角轻量非模态浮窗通道
    if (mode === "notification" || mode === "both") {
      const muteAction = `静音 ${config.alertCooldownMinutes || 15} 分钟`;
      const settingsAction = "管理预警";
      const notifyFn = evt.type === "below"
        ? vscodeModule?.window?.showWarningMessage
        : vscodeModule?.window?.showInformationMessage;

      if (typeof notifyFn === "function") {
        void notifyFn(alertMessage, muteAction, settingsAction).then((action: any) => {
          if (action === muteAction) {
            this.mute(evt.symbolKey, config.alertCooldownMinutes || 15);
            vscodeModule?.window?.setStatusBarMessage(`$(bell-slash) 已静音 ${displayName} 预警 ${config.alertCooldownMinutes || 15} 分钟`, 3000);
          } else if (action === settingsAction) {
            void vscodeModule?.commands?.executeCommand("marketlens.openSettings");
          }
        });
      }
    }
  }
}
