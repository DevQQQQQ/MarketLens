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
