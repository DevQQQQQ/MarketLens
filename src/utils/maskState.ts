// src/utils/maskState.ts

/**
 * 判定当前自选列表及视图是否应当打码脱敏
 *
 * 核心安全规则：
 * 1. 只要老板键（Boss Key）处于激活状态，无论用户个人设置的 maskMode 为何值，视图一律强制打码脱敏；
 * 2. 仅在未激活老板键的常规状态下，视图才遵循用户自定义的 maskMode（摸鱼伪装模式）。
 *
 * @param bossKeyActive 老板键是否激活中
 * @param userMaskMode  用户配置的摸鱼打码开关 (config.maskMode)
 */
export function isDisplayMasked(bossKeyActive: boolean, userMaskMode: boolean): boolean {
  return Boolean(bossKeyActive || userMaskMode);
}

/**
 * 判定「用户主动重新打开自选看板」时，是否应当自动解除老板键（专注模式）隐身状态
 *
 * 核心安全规则与设计动机：
 * 1. 老板键状态仅存于内存（statusBar.bossKeyActive），且在重构前只由 Alt+M 命令复位；
 *    若用户手动重新打开侧边栏，bossKeyActive 会持续一票否决 maskMode，
 *    导致「切换简洁展示模式 (Alt+K)」静默失效——界面永久停留在脱敏态且无任何提示反馈。
 * 2. 语义约定：用户主动打开看板 = 明确要查看行情 = 专注模式的自然出口。
 * 3. 该判定必须同时满足「视图可见」与「老板键激活」两个前提，
 *    严禁在视图不可见（visible === false）时解除，避免误触发导致行情意外暴露。
 *
 * @param viewVisible   自选看板视图是否处于可见状态（treeView.onDidChangeVisibility）
 * @param bossKeyActive 老板键当前是否处于激活状态
 */
export function shouldAutoExitBossKey(viewVisible: boolean, bossKeyActive: boolean): boolean {
  return Boolean(viewVisible && bossKeyActive);
}

/**
 * 判定当前是否允许向用户回显任何 UI 反馈（状态栏临时消息、信息提示、面板唤起等）
 *
 * 核心安全规则：老板键（专注模式）激活期间必须完全静默。
 *
 * 设计动机：
 * `vscode.window.setStatusBarMessage` 与 `showInformationMessage` 均独立于
 * `StatusBar` 自身的 `barItem.hide()` 逻辑——即便行情条已隐藏，临时消息依然会在
 * 状态栏区域闪现。其中「MarketLens 已隐蔽」这类提示本身就是最显眼的暴露源，
 * 会直接瓦解老板键的隐身初衷。因此所有面向用户的回显统一经由本判定收口。
 *
 * @param bossKeyActive 老板键是否激活中
 */
export function canEmitUserFeedback(bossKeyActive: boolean): boolean {
  return !bossKeyActive;
}

/**
 * 简洁展示模式开关（`Alt + K`）的实际语义决议结果
 */
export interface MaskTogglePlan {
  /** 是否需先解除老板键（专注模式）隐身状态 */
  exitBossKey: boolean;
  /** 本次操作结束后 maskMode 的目标值 */
  nextMaskMode: boolean;
  /** 是否需要将目标值落盘（仅当与当前值不同时写入，避免无谓的配置变更事件与树重建） */
  requiresConfigWrite: boolean;
}

/**
 * 决议「简洁展示模式开关」在老板键激活状态下的真实语义
 *
 * 设计动机：
 * `isDisplayMasked` 规定老板键一票否决 maskMode。因此在老板键激活期间单纯翻转
 * 并落盘 maskMode 不会带来任何可见变化，只会造成「配置已改、观感未变」的静默失效
 * （用户按下 `Alt + K` 后界面依旧全部脱敏，且无任何提示反馈）。
 *
 * 语义约定：
 * 1. 常规态：保持纯粹的取反语义，与历史行为完全一致；
 * 2. 老板键激活期：视为「我要看真实数据」——直接解除专注模式，并把 maskMode 归零，
 *    保证操作结果与用户意图一致；此时仅在 maskMode 原为 true 时才需要落盘。
 *
 * @param bossKeyActive    老板键当前是否处于激活状态
 * @param currentMaskMode  配置中当前的 maskMode 值
 */
export function resolveMaskToggle(bossKeyActive: boolean, currentMaskMode: boolean): MaskTogglePlan {
  if (bossKeyActive) {
    return {
      exitBossKey: true,
      nextMaskMode: false,
      requiresConfigWrite: currentMaskMode,
    };
  }
  return {
    exitBossKey: false,
    nextMaskMode: !currentMaskMode,
    requiresConfigWrite: true,
  };
}
