// src/utils/inputValidator.ts

export interface ParsedItemInput {
  symbol: string;
  type: "A_SHARE" | "HK_STOCK" | "US_STOCK" | "CRYPTO" | "ALPHA_TOKEN";
  defaultGroup: string;
  hint: string;
  alternativeGroup?: string;
  alternativeType?: "A_SHARE" | "HK_STOCK" | "US_STOCK" | "CRYPTO" | "ALPHA_TOKEN";
}

export function isContractAddress(str: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(str) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str);
}

export function validateAndParseInput(input: string): { error?: string; parsed?: ParsedItemInput } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "代码不能为空" };
  }

  // 1. 链上 DEX / Alpha 合约地址 (EVM 0x... 42位, 或 Solana Mint 32~44位)
  if (isContractAddress(trimmed)) {
    return {
      parsed: {
        symbol: trimmed,
        type: "ALPHA_TOKEN",
        defaultGroup: "Alpha",
        hint: "链上 DEX / Alpha 合约",
      },
    };
  }

  // 2. 港股代码校验（支持 5 位纯数字如 00700，或 hk00700 / r_hk00700）
  const hkExplicitMatch = trimmed.match(/^(?:r_)?hk(\d{1,5})$/i);
  if (hkExplicitMatch && hkExplicitMatch[1]) {
    const code = hkExplicitMatch[1].padStart(5, "0");
    return {
      parsed: {
        symbol: `hk${code}`,
        type: "HK_STOCK",
        defaultGroup: "港股",
        hint: `港股代码 (hk${code})`,
      },
    };
  }
  if (/^\d{5}$/.test(trimmed)) {
    return {
      parsed: {
        symbol: `hk${trimmed}`,
        type: "HK_STOCK",
        defaultGroup: "港股",
        hint: `港股代码 (hk${trimmed})`,
      },
    };
  }

  // 3. A 股代码校验 (支持 6 位数字，如 600519，或带前缀 sh600519 / sz000001 / bj830001)
  const aShareMatch = trimmed.match(/^(sh|sz|bj)?(\d{6})$/i);
  if (aShareMatch) {
    const prefix = aShareMatch[1] ? aShareMatch[1].toLowerCase() : "";
    const code = aShareMatch[2];
    const fullSymbol = prefix ? `${prefix}${code}` : (/^[69]/.test(code) ? `sh${code}` : (/^[03]/.test(code) ? `sz${code}` : `bj${code}`));
    return {
      parsed: {
        symbol: fullSymbol,
        type: "A_SHARE",
        defaultGroup: "A股",
        hint: `A股代码 (${fullSymbol})`,
      },
    };
  }

  // 4. 美股指数（如 .IXIC, .DJI）
  if (trimmed.startsWith(".")) {
    const sym = trimmed.toUpperCase();
    return {
      parsed: {
        symbol: sym,
        type: "US_STOCK",
        defaultGroup: "美股",
        hint: `美股指数 (${sym})`,
      },
    };
  }

  // 美股显式前缀（如 us.AAPL, us_TSLA, us-AMD）
  if (/^us[\._\-][a-zA-Z]+$/i.test(trimmed)) {
    const ticker = trimmed.replace(/^us[\._\-]/i, "").toUpperCase();
    const sym = `us${ticker}`;
    return {
      parsed: {
        symbol: sym,
        type: "US_STOCK",
        defaultGroup: "美股",
        hint: `美股资产 (${sym})`,
      },
    };
  }

  // 腾讯美股前缀格式（小写 us + 大写 ticker，如 usAAPL, usAMD, usNET, usTSM）
  // 需排除用户误打的加密货币前缀（如 usUSDT, usUSDC, usBTCUSDT）
  if (/^us[A-Z]+$/.test(trimmed) && !/^us(USDT|USDC|BUSD|FDUSD|BTC|ETH)/i.test(trimmed)) {
    return {
      parsed: {
        symbol: trimmed,
        type: "US_STOCK",
        defaultGroup: "美股",
        hint: `美股资产 (${trimmed})`,
      },
    };
  }

  // 如果纯数字但不是 5/6 位，明确报错拦截
  if (/^\d+$/.test(trimmed)) {
    return {
      error: `⚠️ 纯数字仅支持 5位港股（如 00700）或 6位A股股票代码（如 600519），当前输入为 ${trimmed.length} 位数字`,
    };
  }

  // 5. 字母代码：支持加密币（如 BTCUSDT, USDCUSDT, USDTTRY, ETH, DOGE）或美股个股（如 AAPL, TSLA, NVDA）
  const cryptoMatch = trimmed.match(/^([a-zA-Z0-9]{1,10})([\/\-_]?([a-zA-Z0-9]{2,10}))?$/);
  if (cryptoMatch) {
    const cleanUpper = trimmed.toUpperCase().replace(/[\/\-_]/g, "");
    // 如果包含计价货币尾缀（如 USDT / USDC / BUSD / FDUSD / BTC / ETH），或以主流基础稳定币开头（如 USDCUSDT, USDTTRY, USDCTRY, USD1USDT），确定为加密货币
    const isCryptoQuote =
      cleanUpper.endsWith("USDT") ||
      cleanUpper.endsWith("USDC") ||
      cleanUpper.endsWith("BUSD") ||
      cleanUpper.endsWith("FDUSD");
    const isCryptoBase =
      cleanUpper.startsWith("USDT") ||
      cleanUpper.startsWith("USDC") ||
      cleanUpper.startsWith("USD1") ||
      cleanUpper.startsWith("FDUSD");

    if (isCryptoQuote || (isCryptoBase && cleanUpper.length >= 6)) {
      return {
        parsed: {
          symbol: cleanUpper,
          type: "CRYPTO",
          defaultGroup: "Binance",
          hint: `加密货币币对 (${cleanUpper})`,
        },
      };
    }

    // 如果是 1~5 位纯字母（如 AAPL, TSLA, NVDA），可能是美股也可以是单币
    return {
      parsed: {
        symbol: cleanUpper,
        type: "US_STOCK",
        defaultGroup: "美股",
        hint: `美股代码 (${cleanUpper})，亦可作为加密币加入 Binance`,
        alternativeGroup: "Binance",
        alternativeType: "CRYPTO",
      },
    };
  }

  return {
    error: "⚠️ 格式不合法！请输入：A股(6位)、港股(5位)、美股代码(如 AAPL)、币对(如 BTCUSDT) 或 链上合约地址(0x...)",
  };
}
