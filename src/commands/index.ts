// src/commands/index.ts
import * as vscode from "vscode";
import { RefreshScheduler } from "../scheduler";
import { WatchlistOps } from "../watchlistOps";
import { StatusBar } from "../ui/statusBar";
import { WatchlistProvider, GroupItem, StockItem } from "../ui/watchlistProvider";
import { SettingsWebviewPanel } from "../ui/settingsWebview";
import { readConfig } from "../utils/config";

export interface CommandServices {
  scheduler: RefreshScheduler;
  watchlistOps: WatchlistOps;
  statusBar: StatusBar;
  treeProvider: WatchlistProvider;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  services: CommandServices
): void {
  const { scheduler, watchlistOps, statusBar, treeProvider } = services;

  context.subscriptions.push(
    // 打开设置界面（专属 Webview 控制台面板）
    vscode.commands.registerCommand("marketlens.openSettings", () => {
      const extVersion = context.extension?.packageJSON?.version || "1.1.4";
      SettingsWebviewPanel.createOrShow(context.extensionUri, extVersion);
    }),

    // 全量刷新（手动点击无论是否闭市都重新获取最新收盘/盘中数据）
    vscode.commands.registerCommand("marketlens.refresh", () => {
      void scheduler.refresh(true);
    }),

    // 分类刷新（分组节点 inline 按钮）
    vscode.commands.registerCommand(
      "marketlens.refreshGroup",
      async (group: GroupItem) => {
        if (group) {
          await scheduler.refreshGroup(group);
        }
      }
    ),

    // 老板键 — 一键隐藏 / 恢复（侧边栏、状态栏、设置窗口联动）
    vscode.commands.registerCommand("marketlens.toggleBossKey", async () => {
      const isHidden = statusBar.toggleBossKey();

      if (isHidden) {
        // 1. 关闭左侧侧边栏（如果处于开启状态）
        try {
          await vscode.commands.executeCommand("workbench.action.closeSidebar");
        } catch (_) {}

        // 2. 将自选树视图打码脱敏（激活老板键状态）
        treeProvider.setBossKey(true);

        // 3. 关闭正在打开的设置 Webview
        SettingsWebviewPanel.currentPanel?.dispose();

        // 4. 底部微弱状态提示
        vscode.window.setStatusBarMessage("$(eye-closed) MarketLens 已隐蔽 (再次按下快捷键恢复)", 3500);
      } else {
        // 1. 恢复自选树视图原配置（解除老板键状态）
        treeProvider.setBossKey(false);
        const config = readConfig();
        treeProvider.setMaskMode(config.maskMode);

        // 2. 重新唤醒并展开左侧自选侧边栏
        try {
          await vscode.commands.executeCommand("workbench.view.extension.marketlens-container");
        } catch (_) {}

        // 3. 底部状态提示
        vscode.window.setStatusBarMessage("$(eye) MarketLens 行情已恢复", 3000);
      }
    }),

    // 伪装摸鱼模式开关
    vscode.commands.registerCommand("marketlens.toggleMask", async () => {
      const config = readConfig();
      const next = !config.maskMode;
      await vscode.workspace
        .getConfiguration("marketlens")
        .update("maskMode", next, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(
        next ? "$(git-branch) MarketLens: 伪装摸鱼模式已开启" : "$(eye) MarketLens: 伪装摸鱼模式已关闭",
        2500
      );
    }),

    // 颜色脱敏开关
    vscode.commands.registerCommand("marketlens.toggleColorNeutral", async () => {
      const config = readConfig();
      const next = !config.colorNeutral;
      await vscode.workspace
        .getConfiguration("marketlens")
        .update("colorNeutral", next, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(
        next ? "$(paintcan) MarketLens: 颜色脱敏已开启 (无红绿视觉刺激)" : "$(paintcan) MarketLens: 颜色脱敏已关闭 (恢复红绿涨跌)",
        2500
      );
    }),

    // 自定义快捷键
    vscode.commands.registerCommand("marketlens.openKeybindings", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openGlobalKeybindings",
        "marketlens"
      );
    }),

    // 添加自选（带实时严格校验）
    vscode.commands.registerCommand("marketlens.addItem", async () => {
      await watchlistOps.addItem();
    }),

    // 置顶标的（点击图钉图标或命令触发）
    vscode.commands.registerCommand(
      "marketlens.pinToTop",
      async (node?: StockItem) => {
        await watchlistOps.pinToTop(node);
      }
    ),

    // 删除自选（点击垃圾桶图标或命令触发）
    vscode.commands.registerCommand(
      "marketlens.removeItem",
      async (node?: StockItem) => {
        await watchlistOps.removeItem(node);
      }
    ),

    // 恢复出厂默认设置
    vscode.commands.registerCommand("marketlens.restoreDefaults", async () => {
      await SettingsWebviewPanel.restoreDefaults();
    }),

    // 一键清空自选
    vscode.commands.registerCommand("marketlens.clearWatchlist", async () => {
      await SettingsWebviewPanel.clearWatchlist();
    }),

    // 设置价格预警（右键菜单或命令面板触发）
    vscode.commands.registerCommand(
      "marketlens.setAlert",
      async (node?: StockItem) => {
        await watchlistOps.setAlert(node);
      }
    )
  );
}
