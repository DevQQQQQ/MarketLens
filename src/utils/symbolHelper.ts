// src/utils/symbolHelper.ts

/**
 * 校验两个股票/代币代码是否代表同一个标的
 * 兼容 A股/港股/美股/加密货币 的各种格式：
 * - A股：sh600030 vs 600030，但严格区分不同交易所如 sh000001 vs sz000001
 * - 港股：hk06030 vs 06030 vs hk6030 vs 6030
 * - 美股：AAPL vs usAAPL vs us.AAPL
 * - 币安/链上：BTCUSDT vs btcusdt, 合约地址大小写不敏感等
 */
export function isSameSymbol(a?: string, b?: string): boolean {
  if (!a || !b) {
    return false;
  }
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) {
    return true;
  }

  const clean1 = s1.replace(/[\._\-]/g, "");
  const clean2 = s2.replace(/[\._\-]/g, "");
  if (clean1 === clean2) {
    return true;
  }

  const m1 = clean1.match(/^(sh|sz|bj|hk|us)(.+)$/i);
  const m2 = clean2.match(/^(sh|sz|bj|hk|us)(.+)$/i);

  if (m1 && m2) {
    if (m1[1].toLowerCase() !== m2[1].toLowerCase()) {
      return false;
    }
    const code1 = m1[2];
    const code2 = m2[2];
    if (code1 === code2) {
      return true;
    }
    if (/^\d+$/.test(code1) && /^\d+$/.test(code2)) {
      return code1.replace(/^0+/, "") === code2.replace(/^0+/, "");
    }
    return false;
  }

  const raw1 = m1 ? m1[2] : clean1;
  const raw2 = m2 ? m2[2] : clean2;
  if (raw1 === raw2) {
    return true;
  }

  if (/^\d+$/.test(raw1) && /^\d+$/.test(raw2)) {
    return raw1.replace(/^0+/, "") === raw2.replace(/^0+/, "");
  }

  return false;
}
