// src/utils/marketHours.ts

/**
 * 专为时区安全设计的交易时段检测（完全解耦本地时区/WSL/远程环境）
 * - A股 / 港股：绑定 Asia/Shanghai
 * - 美股：绑定 America/New_York
 */
export const beijingFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  weekday: "short",
  hour: "numeric",
  minute: "numeric",
  hour12: false,
});

export const newYorkFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  minute: "numeric",
  hour12: false,
});

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getZonedTimeParts(formatter: Intl.DateTimeFormat, date: Date = new Date()): { day: number; totalMinutes: number } {
  const parts = formatter.formatToParts(date);
  let weekdayStr = "";
  let hour = 0;
  let minute = 0;

  for (const p of parts) {
    if (p.type === "weekday") { weekdayStr = p.value; }
    else if (p.type === "hour") { hour = parseInt(p.value, 10); }
    else if (p.type === "minute") { minute = parseInt(p.value, 10); }
  }

  // hour12: false 在部分环境中 0 点可能解析为 24
  if (hour === 24) { hour = 0; }

  const day = WEEKDAY_MAP[weekdayStr] ?? 0;
  return { day, totalMinutes: hour * 60 + minute };
}

/**
 * 校验当前是否处于 A 股交易时段（严格按北京时间 Asia/Shanghai 判定）：
 * - 周一至周五 9:15 ~ 11:30, 13:00 ~ 15:05
 */
export function isAShareMarketOpen(date?: Date): boolean {
  const { day, totalMinutes } = getZonedTimeParts(beijingFormatter, date);
  if (day === 0 || day === 6) { return false; }
  const isMorning   = totalMinutes >= 9 * 60 + 15 && totalMinutes <= 11 * 60 + 30;
  const isAfternoon = totalMinutes >= 13 * 60 && totalMinutes <= 15 * 60 + 5;
  return isMorning || isAfternoon;
}

/**
 * 校验当前是否处于港股交易时段（严格按北京/香港时间 Asia/Shanghai 判定）：
 * - 周一至周五 9:30 ~ 12:00, 13:00 ~ 16:10
 */
export function isHKMarketOpen(date?: Date): boolean {
  const { day, totalMinutes } = getZonedTimeParts(beijingFormatter, date);
  if (day === 0 || day === 6) { return false; }
  const isMorning   = totalMinutes >= 9 * 60 + 30 && totalMinutes <= 12 * 60;
  const isAfternoon = totalMinutes >= 13 * 60 && totalMinutes <= 16 * 60 + 10;
  return isMorning || isAfternoon;
}

/**
 * 校验当前是否处于美股交易时段（严格按美东时间 America/New_York 判定）：
 * - 规则：美东时间周一至周五 09:00 ~ 16:30（覆盖盘前缓冲、09:30~16:00 常规交易及收盘清算）
 * - 优势：底层由时区数据库自适应夏令时与冬令时，无需复杂跨天推算，周六日全天闭市。
 */
export function isUSMarketOpen(date?: Date): boolean {
  const { day, totalMinutes } = getZonedTimeParts(newYorkFormatter, date);
  if (day === 0 || day === 6) { return false; }
  return totalMinutes >= 9 * 60 && totalMinutes <= 16 * 60 + 30;
}
