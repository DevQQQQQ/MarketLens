// src/utils/backupHelper.ts
import type * as vscodeTypes from "vscode";
import type { MarketLensConfig, GroupSortMode, WatchConfigItem, PriceAlertItem } from "../types/index.ts";
import { MARKET_SECTIONS } from "./config.ts";
import { logger } from "./logger.ts";
import { resolveItemAssetType } from "./symbolHelper.ts";

let vscodeModule: typeof vscodeTypes | undefined;
try {
  vscodeModule = require("vscode");
} catch (_) {}

function getVsCode(): typeof vscodeTypes {
  if (vscodeModule) {
    return vscodeModule;
  }
  throw new Error("vscode module is not available outside the VS Code extension host");
}

/** MarketLens 标准备份数据结构 */
export interface MarketLensBackupData {
  version: string;
  exportedAt: string;
  schemaVersion: number;
  settings: {
    autoRefresh?: boolean;
    refreshInterval?: number;
    maskMode?: boolean;
    colorNeutral?: boolean;
    colorScheme?: "greenUpRedDown" | "redUpGreenDown";
    statusBarEnabled?: boolean;
    autoCollapseClosedGroups?: boolean;
    proxyPort?: number;
    proxyUrl?: string;

    fund?: any;
    aShare?: any;
    hkStock?: any;
    usStock?: any;
    binance?: any;
    alpha?: any;

    watchlist?: Record<string, WatchConfigItem[]>;
    alerts?: Record<string, PriceAlertItem>;
    alertNotificationMode?: "notification" | "statusBarOnly" | "both";
    alertCooldownMinutes?: number;
  };
  groupSortModes?: Record<string, GroupSortMode>;
}

export interface ValidationSummary {
  totalSymbols: number;
  groupCount: number;
  alertCount: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: MarketLensBackupData;
  summary?: ValidationSummary;
}

/**
 * 将当前配置序列化为标准备份对象
 */
export function generateBackupData(
  config: MarketLensConfig,
  groupSortModes?: Record<string, GroupSortMode>,
  version: string = "1.0.0"
): MarketLensBackupData {
  return {
    version,
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    settings: {
      autoRefresh: config.autoRefresh,
      refreshInterval: config.refreshInterval,
      maskMode: config.maskMode,
      colorNeutral: config.colorNeutral,
      colorScheme: config.colorScheme,
      statusBarEnabled: config.statusBar?.enabled ?? true,
      autoCollapseClosedGroups: config.autoCollapseClosedGroups ?? true,
      proxyPort: config.proxyPort,
      proxyUrl: config.proxyUrl,

      fund: config.fund ? { ...config.fund } : undefined,
      aShare: config.aShare ? { ...config.aShare } : undefined,
      hkStock: config.hkStock ? { ...config.hkStock } : undefined,
      usStock: config.usStock ? { ...config.usStock } : undefined,
      binance: config.binance ? { ...config.binance } : undefined,
      alpha: config.alpha ? { ...config.alpha } : undefined,

      watchlist: config.watchlist ? JSON.parse(JSON.stringify(config.watchlist)) : {},
      alerts: config.alerts ? JSON.parse(JSON.stringify(config.alerts)) : {},
      alertNotificationMode: config.alertNotificationMode,
      alertCooldownMinutes: config.alertCooldownMinutes,
    },
    groupSortModes: groupSortModes ? { ...groupSortModes } : {},
  };
}

/**
 * 校验并清洗备份数据（支持标准结构与直接 settings 平铺结构兼容）
 */
export function validateBackupData(raw: any): ValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, error: "备份文件内容必须是非空的 JSON 对象" };
  }

  // 提取 settings 与 groupSortModes：兼容标准包装对象或平铺对象
  let settingsCandidate: any;
  let groupSortCandidate: any;

  if (raw.settings && typeof raw.settings === "object" && !Array.isArray(raw.settings)) {
    settingsCandidate = raw.settings;
    groupSortCandidate = raw.groupSortModes;
  } else {
    settingsCandidate = raw;
    groupSortCandidate = raw.groupSortModes;
  }

  // 校验 watchlist 结构（若提供，必须是 key -> array 的对象）
  let totalSymbols = 0;
  let groupCount = 0;
  let normalizedWatchlist: Record<string, WatchConfigItem[]> | undefined;

  if (settingsCandidate.watchlist !== undefined) {
    if (
      typeof settingsCandidate.watchlist !== "object" ||
      settingsCandidate.watchlist === null ||
      Array.isArray(settingsCandidate.watchlist)
    ) {
      return { valid: false, error: "watchlist 字段结构非法，必须为分组对象" };
    }

    normalizedWatchlist = {};
    for (const [group, items] of Object.entries(settingsCandidate.watchlist)) {
      if (!Array.isArray(items)) {
        return { valid: false, error: `分组【${group}】的标的列表必须为数组` };
      }
      groupCount += 1;
      const validItems: WatchConfigItem[] = [];
      for (const it of items) {
        if (typeof it === "string") {
          const sym = it.trim();
          if (sym) {
            const inferredType = resolveItemAssetType({ symbol: sym }, group) || "A_SHARE";
            validItems.push({ symbol: sym, type: inferredType });
          }
        } else if (it && typeof it === "object" && typeof it.symbol === "string" && it.symbol.trim() !== "") {
          const sym = it.symbol.trim();
          const rawType = it.type;
          const validAssetType =
            rawType === "ALPHA_TOKEN" || rawType === "BSC_TOKEN"
              ? "ALPHA_TOKEN"
              : rawType === "CRYPTO"
                ? "CRYPTO"
                : rawType === "HK_STOCK"
                  ? "HK_STOCK"
                  : rawType === "US_STOCK"
                    ? "US_STOCK"
                    : rawType === "A_SHARE"
                      ? "A_SHARE"
                      : undefined;

          const item: WatchConfigItem = {
            symbol: sym,
            type: validAssetType || resolveItemAssetType({ symbol: sym }, group) || "A_SHARE",
          };
          if (typeof it.name === "string" && it.name.trim() !== "") {
            item.name = it.name.trim();
          }
          validItems.push(item);
        }
        // 其他非法元素（null、number、{symbol:123} 等）直接丢弃
      }
      normalizedWatchlist[group] = validItems;
      totalSymbols += validItems.length;
    }
  }

  // 校验 alerts 结构（若提供，必须是 key -> object 的对象）
  let alertCount = 0;
  let normalizedAlerts: Record<string, PriceAlertItem> | undefined;

  if (settingsCandidate.alerts !== undefined) {
    if (
      typeof settingsCandidate.alerts !== "object" ||
      settingsCandidate.alerts === null ||
      Array.isArray(settingsCandidate.alerts)
    ) {
      return { valid: false, error: "alerts 字段结构非法，必须为预警字典对象" };
    }

    normalizedAlerts = {};
    const rawAlerts = settingsCandidate.alerts as Record<string, any>;
    for (const [key, rule] of Object.entries(rawAlerts)) {
      if (rule && typeof rule === "object" && typeof rule.symbol === "string" && rule.symbol.trim() !== "") {
        alertCount += 1;
        normalizedAlerts[key] = {
          symbol: rule.symbol.trim(),
          name: typeof rule.name === "string" ? rule.name.trim() : undefined,
          above: typeof rule.above === "number" ? rule.above : undefined,
          below: typeof rule.below === "number" ? rule.below : undefined,
          changePercent: typeof rule.changePercent === "number" ? rule.changePercent : undefined,
          enabled: typeof rule.enabled === "boolean" ? rule.enabled : true,
        };
      }
      // 缺少有效 symbol 的预警规则直接丢弃
    }
  }

  // 校验 groupSortModes 结构
  const normalizedGroupSortModes: Record<string, GroupSortMode> = {};
  if (groupSortCandidate && typeof groupSortCandidate === "object" && !Array.isArray(groupSortCandidate)) {
    for (const [grp, mode] of Object.entries(groupSortCandidate)) {
      if (typeof mode === "string") {
        normalizedGroupSortModes[grp] = mode as GroupSortMode;
      }
    }
  }

  const normalizedData: MarketLensBackupData = {
    version: typeof raw.version === "string" ? raw.version : "1.0.0",
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date().toISOString(),
    schemaVersion: 1,
    settings: {
      autoRefresh: typeof settingsCandidate.autoRefresh === "boolean" ? settingsCandidate.autoRefresh : undefined,
      refreshInterval: typeof settingsCandidate.refreshInterval === "number" ? settingsCandidate.refreshInterval : undefined,
      maskMode: typeof settingsCandidate.maskMode === "boolean" ? settingsCandidate.maskMode : undefined,
      colorNeutral: typeof settingsCandidate.colorNeutral === "boolean" ? settingsCandidate.colorNeutral : undefined,
      colorScheme: settingsCandidate.colorScheme === "redUpGreenDown" ? "redUpGreenDown" : settingsCandidate.colorScheme === "greenUpRedDown" ? "greenUpRedDown" : undefined,
      statusBarEnabled: typeof settingsCandidate.statusBarEnabled === "boolean" ? settingsCandidate.statusBarEnabled : undefined,
      autoCollapseClosedGroups: typeof settingsCandidate.autoCollapseClosedGroups === "boolean" ? settingsCandidate.autoCollapseClosedGroups : undefined,
      proxyPort: typeof settingsCandidate.proxyPort === "number" ? settingsCandidate.proxyPort : undefined,
      proxyUrl: typeof settingsCandidate.proxyUrl === "string" ? settingsCandidate.proxyUrl : undefined,

      fund: settingsCandidate.fund,
      aShare: settingsCandidate.aShare,
      hkStock: settingsCandidate.hkStock,
      usStock: settingsCandidate.usStock,
      binance: settingsCandidate.binance,
      alpha: settingsCandidate.alpha,

      watchlist: normalizedWatchlist,
      alerts: normalizedAlerts,
      alertNotificationMode: settingsCandidate.alertNotificationMode,
      alertCooldownMinutes: settingsCandidate.alertCooldownMinutes,
    },
    groupSortModes: normalizedGroupSortModes,
  };

  return {
    valid: true,
    data: normalizedData,
    summary: {
      totalSymbols,
      groupCount,
      alertCount,
    },
  };
}

/**
 * 弹出文件保存对话框，将当前配置导出到本地 JSON 文件
 */
export async function exportSettingsToFile(
  config: MarketLensConfig,
  groupSortModes?: Record<string, GroupSortMode>,
  version?: string
): Promise<boolean> {
  const vscode = getVsCode();
  try {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const defaultFileName = `marketlens-backup-${dateStr}.json`;

    const targetUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultFileName),
      filters: {
        "JSON Files": ["json"],
      },
      title: "导出 MarketLens 配置备份",
    });

    if (!targetUri) {
      return false; // 用户取消
    }

    const backupData = generateBackupData(config, groupSortModes, version);
    const jsonContent = JSON.stringify(backupData, null, 2);
    const buffer = Buffer.from(jsonContent, "utf-8");

    await vscode.workspace.fs.writeFile(targetUri, buffer);

    const totalSymbols = Object.values(backupData.settings.watchlist || {}).reduce(
      (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
      0
    );
    const alertCount = Object.keys(backupData.settings.alerts || {}).length;

    vscode.window.showInformationMessage(
      `✅ MarketLens 配置已成功导出至：${targetUri.fsPath}（包含 ${totalSymbols} 只标的，${alertCount} 条预警规则）`
    );
    return true;
  } catch (err: any) {
    logger.error("导出配置文件异常", err);
    vscode.window.showErrorMessage(`导出配置失败: ${err?.message || err}`);
    return false;
  }
}

/**
 * 弹出文件选择对话框，从本地 JSON 文件导入配置
 */
export async function importSettingsFromFile(options: {
  onSuccess?: (backupData: MarketLensBackupData) => Promise<void> | void;
  globalState?: vscodeTypes.Memento;
}): Promise<boolean> {
  const vscode = getVsCode();
  try {
    const fileUris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: {
        "JSON Files": ["json"],
      },
      title: "选择 MarketLens 配置备份文件 (.json)",
    });

    if (!fileUris || fileUris.length === 0) {
      return false; // 用户取消
    }

    const uri = fileUris[0];
    let rawText = "";
    try {
      const fileBytes = await vscode.workspace.fs.readFile(uri);
      rawText = Buffer.from(fileBytes).toString("utf-8");
    } catch (readErr: any) {
      vscode.window.showErrorMessage(`读取备份文件失败: ${readErr?.message || readErr}`);
      return false;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch (_) {
      vscode.window.showErrorMessage("导入失败：所选文件不是合法的 JSON 格式。");
      return false;
    }

    const validation = validateBackupData(parsed);
    if (!validation.valid || !validation.data) {
      vscode.window.showErrorMessage(`导入失败：${validation.error || "文件数据结构不符合 MarketLens 备份格式"}`);
      return false;
    }

    const { data, summary } = validation;
    const symCount = summary?.totalSymbols ?? 0;
    const alertCount = summary?.alertCount ?? 0;

    const confirm = await vscode.window.showWarningMessage(
      `检测到有效的 MarketLens 备份配置：\n- 自选标的：共 ${symCount} 只\n- 价格预警：共 ${alertCount} 条\n\n是否确认导入？导入后将覆盖当前自选列表及对应设置。`,
      { modal: true },
      "确认导入",
      "取消"
    );

    if (confirm !== "确认导入") {
      return false;
    }

    // 写入 VS Code 配置
    const cfg = vscode.workspace.getConfiguration("marketlens");
    const target = vscode.ConfigurationTarget.Global;

    // 1. 核心 watchlist 与 alerts
    if (data.settings.watchlist !== undefined) {
      await cfg.update("watchlist", data.settings.watchlist, target);
    }
    if (data.settings.alerts !== undefined) {
      await cfg.update("alerts", data.settings.alerts, target);
    }

    // 2. 全局通用设置
    if (data.settings.autoRefresh !== undefined) {
      await cfg.update("autoRefresh", data.settings.autoRefresh, target);
    }
    if (data.settings.refreshInterval !== undefined) {
      await cfg.update("refreshInterval", data.settings.refreshInterval, target);
    }
    if (data.settings.maskMode !== undefined) {
      await cfg.update("maskMode", data.settings.maskMode, target);
    }
    if (data.settings.colorNeutral !== undefined) {
      await cfg.update("colorNeutral", data.settings.colorNeutral, target);
    }
    if (data.settings.colorScheme !== undefined) {
      await cfg.update("colorScheme", data.settings.colorScheme, target);
    }
    if (data.settings.statusBarEnabled !== undefined) {
      await cfg.update("statusBar.enabled", data.settings.statusBarEnabled, target);
    }
    if (data.settings.autoCollapseClosedGroups !== undefined) {
      await cfg.update("autoCollapseClosedGroups", data.settings.autoCollapseClosedGroups, target);
    }
    if (data.settings.alertNotificationMode !== undefined) {
      await cfg.update("alertNotificationMode", data.settings.alertNotificationMode, target);
    }
    if (data.settings.alertCooldownMinutes !== undefined) {
      await cfg.update("alertCooldownMinutes", data.settings.alertCooldownMinutes, target);
    }

    // 3. 各市场板块独立配置
    for (const sec of MARKET_SECTIONS) {
      const secConfig = (data.settings as any)[sec];
      if (secConfig && typeof secConfig === "object") {
        if (secConfig.enabled !== undefined) {
          await cfg.update(`${sec}.enabled`, secConfig.enabled, target);
        }
        if (secConfig.statusBar !== undefined) {
          await cfg.update(`${sec}.statusBar`, secConfig.statusBar, target);
        }
        if (secConfig.networkMode !== undefined) {
          await cfg.update(`${sec}.networkMode`, secConfig.networkMode, target);
        }
        if (secConfig.proxyUrl !== undefined) {
          await cfg.update(`${sec}.proxyUrl`, secConfig.proxyUrl, target);
        }
        if (secConfig.stopOnMarketClosed !== undefined) {
          await cfg.update(`${sec}.stopOnMarketClosed`, secConfig.stopOnMarketClosed, target);
        }
      }
    }

    // 4. 分组排序模式 (globalState)
    if (data.groupSortModes && options.globalState) {
      await options.globalState.update("marketlens.groupSortModes", data.groupSortModes);
    }

    // 5. 触发成功回调（界面刷新等）
    // 写盘已完成，此阶段失败不应误导用户认为配置未导入
    if (options.onSuccess) {
      try {
        await options.onSuccess(data);
      } catch (refreshErr: any) {
        logger.error("配置已导入，但界面刷新阶段异常", refreshErr);
        vscode.window.showWarningMessage(
          `配置已导入成功，但界面刷新失败：${refreshErr?.message || refreshErr}。请尝试执行 MarketLens: Refresh 命令手动刷新。`
        );
        return true;
      }
    }

    vscode.window.showInformationMessage(
      `🎉 MarketLens 配置导入成功！已成功恢复 ${symCount} 只自选标的与 ${alertCount} 条预警规则。`
    );
    return true;
  } catch (err: any) {
    logger.error("导入配置文件异常", err);
    vscode.window.showErrorMessage(`导入配置失败: ${err?.message || err}`);
    return false;
  }
}
