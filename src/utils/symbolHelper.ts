// src/utils/symbolHelper.ts

export type AssetType = "A_SHARE" | "HK_STOCK" | "US_STOCK" | "CRYPTO" | "BSC_TOKEN" | "ALPHA_TOKEN";

export function isContractAddress(str: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(str) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str);
}

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
  const orig1 = a.trim();
  const orig2 = b.trim();
  const s1 = orig1.toLowerCase();
  const s2 = orig2.toLowerCase();
  if (s1 === s2) {
    return true;
  }

  const clean1 = s1.replace(/[\._\-]/g, "");
  const clean2 = s2.replace(/[\._\-]/g, "");
  if (clean1 === clean2) {
    return true;
  }

  // 区分美股显式前缀 vs 真实美股代码（如 USB, USM, USFD）
  // 仅在带显式分隔符（us. / us_ / us-）或小写 us + 大写代码（如 usAAPL, usAMD, usNET）时才提取 us 前缀
  const extractPrefix = (orig: string, clean: string) => {
    // 港股 / A股前缀：sh, sz, bj, hk
    const mStock = clean.match(/^(sh|sz|bj|hk)(\d+)$/i);
    if (mStock) {
      return { prefix: mStock[1].toLowerCase(), code: mStock[2] };
    }
    // 美股显式分隔符: us.AAPL, us_AAPL, us-AAPL
    const mUsDelim = orig.match(/^us[\._\-](.+)$/i);
    if (mUsDelim) {
      return { prefix: "us", code: mUsDelim[1].replace(/[\._\-]/g, "").toLowerCase() };
    }
    // 腾讯美股前缀: 小写 us + 大写字母 (如 usAAPL, usAMD, usNET, usTSM, usARM, usB, usUSB, usBRK.B)
    // 区分大小写，真实大写 ticker (如 USB, USM, USA) 首字母为大写 U，不会被误提取
    if (/^us[A-Z]/.test(orig)) {
      return { prefix: "us", code: orig.slice(2).replace(/[\._\-]/g, "").toLowerCase() };
    }
    return null;
  };

  const p1 = extractPrefix(orig1, clean1);
  const p2 = extractPrefix(orig2, clean2);

  if (p1 && p2) {
    if (p1.prefix !== p2.prefix) {
      return false;
    }
    if (p1.code === p2.code) {
      return true;
    }
    if (/^\d+$/.test(p1.code) && /^\d+$/.test(p2.code)) {
      return p1.code.replace(/^0+/, "") === p2.code.replace(/^0+/, "");
    }
    return false;
  }

  const raw1 = p1 ? p1.code : clean1;
  const raw2 = p2 ? p2.code : clean2;
  if (raw1 === raw2) {
    return true;
  }

  if (/^\d+$/.test(raw1) && /^\d+$/.test(raw2)) {
    return raw1.replace(/^0+/, "") === raw2.replace(/^0+/, "");
  }

  return false;
}

/**
 * 标的代码规范化（用于 Map 快速精确定位，避免为单个标的建立 6~10 个冗余别名）
 */
export function normalizeSymbolKey(sym?: string): string {
  if (!sym) return "";
  const s = sym.trim();
  const clean = s.toLowerCase().replace(/[\._\-]/g, "");

  // 1. 如果是港股：去除 hk 前缀及前导 0，如 hk00700 -> hk700, 00700 -> hk700
  if (/^hk\d+$/.test(clean)) {
    return "hk" + clean.slice(2).replace(/^0+/, "");
  }
  if (/^\d{5}$/.test(clean)) {
    return "hk" + clean.replace(/^0+/, "");
  }

  // 2. 如果是美股：去除显式分隔符前缀（如 us.aapl, us_aapl, us-aapl -> aapl, us.usb -> usb, us.brk.b -> brkb）
  if (/^us[\._\-]/i.test(s)) {
    return s.replace(/^us[\._\-]/i, "").toLowerCase().replace(/[\._\-]/g, "");
  }

  // 3. 腾讯美股前缀格式（区分大小写：小写 us + 大写字母，如 usAAPL -> aapl, usAMD -> amd, usNET -> net, usUSB -> usb, usBRK.B -> brkb）
  // 真实大写 ticker（如 USB, USM, USA）首字母为大写 U，不会被误剥离
  if (/^us[A-Z]/.test(s)) {
    return s.slice(2).toLowerCase().replace(/[\._\-]/g, "");
  }

  // A股保留 sh/sz/bj 前缀，其他（包括 USB, B, BTCUSDT, 合约地址等）直接返回 clean
  return clean;
}

/**
 * 规范化美股抓取代码（Tencent 接口格式，如 "AMD" -> "usAMD", "usAMD" -> "usAMD", "us.IXIC" -> "usIXIC", "BRK.B" -> "usBRK.B"）
 */
export function normalizeUSCode(raw: string): string {
  const clean = raw.trim().replace(/^r_/, "");
  // 如果带显式 us 分隔符（如 us.AAPL, us_AAPL, us-AAPL, us.BRK.B）
  if (/^us[\._\-]/i.test(clean)) {
    const ticker = clean.replace(/^us[\._\-]/i, "").toUpperCase().replace(/[\-_/]/g, ".");
    return `us${ticker}`;
  }
  if (clean.startsWith(".")) {
    return `us${clean.slice(1).toUpperCase()}`;
  }
  // 如果已带腾讯格式前缀：小写 us 开头后紧跟大写字母（如 usAAPL, usAMD, usNET, usTSM, usARM, usB, usUSB, usBRK.B）
  if (/^us[A-Z]/.test(clean)) {
    const ticker = clean.slice(2).toUpperCase().replace(/[\-_/]/g, ".");
    return `us${ticker}`;
  }
  // 否则原生美股 ticker（如 AAPL, B, USB, USFD, BRK.B, BRK-B），类股连字符统一映射为点号
  const ticker = clean.toUpperCase().replace(/[\-_/]/g, ".");
  return `us${ticker}`;
}

/**
 * 确定标的的资产类型（统一裁决逻辑，供网络抓取 extractTargets 与视图构建 buildTree 共享）
 * 判定策略阶梯（分层仲裁）：
 * 1. 【一等公民】显式 type 拥有最高裁决权；
 * 2. 【代码强特征】物理属性绝对优先（合约地址、sh/sz/bj/6位数字、hk/5位数字、us前缀/指数、稳定币计价对），彻底免疫组名误导；
 * 3. 【组名指示】当代码为裸代码或空组时，根据分组名称关键词推导资产类别；
 * 4. 【裸代码兜底】纯字母（1~5位）归为美股，其余归为加密货币；
 * 5. 【纯中立空组】既无有效代码，分组名又无任何市场特征（如 "自选"、"默认分组"），返回 undefined，由调用方单独中立处理。
 */
export function resolveItemAssetType(
  item: { symbol?: string; type?: string },
  groupName: string = ""
): AssetType | undefined {
  // ── Level 1: 显式 type 拥有绝对优先裁决权 ──
  const type = item.type;
  if (type === "ALPHA_TOKEN" || type === "BSC_TOKEN") return "ALPHA_TOKEN";
  if (type === "CRYPTO") return "CRYPTO";
  if (type === "HK_STOCK") return "HK_STOCK";
  if (type === "US_STOCK") return "US_STOCK";
  if (type === "A_SHARE") return "A_SHARE";

  const sym = item.symbol?.trim() || "";
  const lowerGroup = groupName.toLowerCase();

  // ── Level 2: 代码绝对强特征（物理属性强确定，完全免疫组名） ──
  if (sym) {
    // 2.1 链上 DEX / Alpha 合约地址
    if (isContractAddress(sym)) {
      return "ALPHA_TOKEN";
    }

    // 2.2 A股绝对强特征：带 sh/sz/bj 前缀或 6 位纯数字
    if (/^(sh|sz|bj)\d{4,6}$/i.test(sym) || /^\d{6}$/.test(sym)) {
      return "A_SHARE";
    }

    // 2.3 港股绝对强特征：带 hk 前缀或 5 位纯数字
    if (/^(?:r_)?hk\d{1,5}$/i.test(sym) || /^\d{5}$/.test(sym)) {
      return "HK_STOCK";
    }

    // 2.4 加密货币强特征：以主流稳定币开头或结尾的明确交易对（优先于美股 us 前缀，彻底杜绝 USTCUSDT / USDPUSDT / USUALUSDT 等币对被误判）
    if (
      /^(usdt|usdc|usd1|usdd|usde|usds|usdy|usdx|usual|fdusd|tusd|pyusd|dai)/i.test(sym) ||
      /(usdt|usdc|busd|fdusd|tusd|pyusd|dai)$/i.test(sym)
    ) {
      return "CRYPTO";
    }

    // 2.5 美股绝对强特征：指数、带分隔符前缀（us.AAPL / us_TSLA）、腾讯美股格式（usAAPL / usNET / usBRK.B 等）、类股代码（如 BRK.B, BF.B, BRK-B）
    if (
      sym.startsWith(".") ||
      /^us[\._\-]/i.test(sym) ||
      (/^us[a-zA-Z]/i.test(sym) && !/^(usdt|usdc|usd1|usdd|usde|usds|usdy|usdx|usual|fdusd|tusd|pyusd|dai)/i.test(sym)) ||
      /^[a-zA-Z]{1,5}[\.\-_/][a-zA-Z]{1,2}$/.test(sym)
    ) {
      return "US_STOCK";
    }
  }

  // ── Level 3: 组名倾向性推导（用于裸代码或空组） ──
  // 3.1 链上特征
  if (
    lowerGroup.includes("alpha") ||
    lowerGroup.includes("bsc") ||
    lowerGroup.includes("dex") ||
    groupName.includes("链上")
  ) {
    return "ALPHA_TOKEN";
  }

  // 3.2 加密货币特征
  if (
    lowerGroup.includes("binance") ||
    lowerGroup.includes("crypto") ||
    lowerGroup.includes("usdt") ||
    lowerGroup.includes("usdc") ||
    groupName.includes("币安") ||
    groupName.includes("加密")
  ) {
    return "CRYPTO";
  }

  // 3.3 港股特征
  if (
    groupName.includes("港股") ||
    /\bhk\b/i.test(groupName)
  ) {
    return "HK_STOCK";
  }

  // 3.4 美股特征
  if (
    groupName.includes("美股") ||
    /\bus\b/i.test(groupName)
  ) {
    return "US_STOCK";
  }

  // 3.5 A股特征
  if (
    groupName.includes("A股") ||
    groupName.includes("a股") ||
    lowerGroup.includes("ashare")
  ) {
    return "A_SHARE";
  }

  // ── Level 4: 弱代码与裸代码兜底推断（组名也无任何提示） ──
  // 纯字母且无特殊标记的 1~5 位裸代码（如 AAPL, TSLA, NVDA）或类股代码（如 BRK.B, BF.B）
  if (sym && (/^[a-zA-Z]{1,5}$/.test(sym) || /^[a-zA-Z]{1,5}[\.\-_/][a-zA-Z]{1,2}$/.test(sym))) {
    return "US_STOCK";
  }

  // 若存在其他代码但未命中上述特征，兜底落入 CRYPTO（如 DOGE、PEPE 等任意自定义币种裸代码）
  if (sym) {
    return "CRYPTO";
  }

  // ── Level 5: 既无代码，组名又无任何市场特征（如中立空组 "自选"、"我的关注"），返回 undefined ──
  return undefined;
}

/**
 * 计算自选标的的唯一代码集合指纹（完全忽略分组归属与排列顺序）
 * 仅当有标的新增或删除（即全局监控标的集合改变）时指纹才会改变
 * 同组拖拽重排、跨组移动等仅改变本地展示层级，不会改变此指纹，避免重复触发全量网络请求
 */
export function getWatchlistFingerprint(watchlist: Record<string, any[]>): string {
  const allSymbols = new Set<string>();
  for (const items of Object.values(watchlist || {})) {
    for (const it of items || []) {
      const s = (it?.symbol || "").toLowerCase().trim();
      if (s) {
        allSymbols.add(s);
      }
    }
  }
  return Array.from(allSymbols).sort().join(",");
}

export interface TargetExtractionOptions {
  aShareEnabled?: boolean;
  hkStockEnabled?: boolean;
  usStockEnabled?: boolean;
  binanceEnabled?: boolean;
  alphaEnabled?: boolean;
  specificGroupName?: string;
  skipAShare?: boolean;
  skipHKStock?: boolean;
  skipUSStock?: boolean;
}

export interface ExtractedTargets {
  aShares: string[];
  hkStocks: string[];
  usStocks: string[];
  cryptos: string[];
  bscTokens: string[];
}

/**
 * 纯算法函数：从 watchlist 中按板块开关和闭市状态分桶提取抓取代码
 */
export function extractTargetsFromWatchlist(
  watchlist: Record<string, any[]>,
  options: TargetExtractionOptions = {}
): ExtractedTargets {
  const {
    aShareEnabled = true,
    hkStockEnabled = true,
    usStockEnabled = true,
    binanceEnabled = true,
    alphaEnabled = true,
    specificGroupName,
    skipAShare = false,
    skipHKStock = false,
    skipUSStock = false,
  } = options;

  const aShares: string[] = [];
  const hkStocks: string[] = [];
  const usStocks: string[] = [];
  const cryptos: string[] = [];
  const bscTokens: string[] = [];

  for (const [groupName, items] of Object.entries(watchlist || {})) {
    if (specificGroupName && groupName !== specificGroupName) {
      continue;
    }

    for (const item of items ?? []) {
      const sym = item?.symbol;
      if (!sym) {
        continue;
      }

      const resolvedType = resolveItemAssetType(item, groupName);

      if (resolvedType === "ALPHA_TOKEN" || resolvedType === "BSC_TOKEN") {
        if (alphaEnabled) {
          bscTokens.push(sym);
        }
      } else if (resolvedType === "CRYPTO") {
        if (binanceEnabled) {
          cryptos.push(sym);
        }
      } else if (resolvedType === "HK_STOCK") {
        if (hkStockEnabled && !skipHKStock) {
          hkStocks.push(sym);
        }
      } else if (resolvedType === "US_STOCK") {
        if (usStockEnabled && !skipUSStock) {
          usStocks.push(sym);
        }
      } else if (resolvedType === "A_SHARE") {
        if (aShareEnabled && !skipAShare) {
          aShares.push(sym);
        }
      }
    }
  }

  return {
    aShares: [...new Set(aShares)],
    hkStocks: [...new Set(hkStocks)],
    usStocks: [...new Set(usStocks)],
    cryptos: [...new Set(cryptos)],
    bscTokens: [...new Set(bscTokens)],
  };
}

export interface StatusBarQuotesOptions {
  statusBarEnabled?: boolean;
  aShare?: { enabled?: boolean; statusBar?: boolean };
  hkStock?: { enabled?: boolean; statusBar?: boolean };
  usStock?: { enabled?: boolean; statusBar?: boolean };
  binance?: { enabled?: boolean; statusBar?: boolean };
  alpha?: { enabled?: boolean; statusBar?: boolean };
}

/**
 * 纯算法函数：计算状态栏总控与分板块开关聚合后的最终展示状态
 * @param explicitStatusBarEnabled 用户是否显式配置了 statusBar.enabled（undefined 表示未显式配置，遵循默认值开启）
 * @param anyTabsStatusBar 是否至少有一个分板块开启了状态栏轮播
 */
export function computeStatusBarEnabled(
  explicitStatusBarEnabled: boolean | undefined,
  anyTabsStatusBar: boolean
): boolean {
  return explicitStatusBarEnabled !== false && anyTabsStatusBar;
}

/**
 * 纯算法函数：从 watchlist 中按板块开关与轮播开关提取所有参与底部状态栏轮播的标的行情
 * 优先从 quoteCache 读取最新报价（即使对应市场因闭市跳过了周期网络拉取，依然保留收盘报价轮播），
 * 若 quoteCache 暂无则提供基础占位，确保全量预设（如 49 个标的）正常流转。
 */
export function extractStatusBarQuotes<
  T extends { symbol: string; name?: string; type?: string; price?: number; changePercent?: number }
>(
  watchlist: Record<string, any[]>,
  quoteCache: Map<string, T>,
  options: StatusBarQuotesOptions = {}
): T[] {
  const {
    statusBarEnabled = true,
    aShare = { enabled: true, statusBar: true },
    hkStock = { enabled: true, statusBar: true },
    usStock = { enabled: true, statusBar: true },
    binance = { enabled: true, statusBar: true },
    alpha = { enabled: true, statusBar: true },
  } = options;

  if (statusBarEnabled === false) {
    return [];
  }

  const isSectionActive = (type?: string): boolean => {
    switch (type) {
      case "A_SHARE":
        return aShare.enabled !== false && aShare.statusBar !== false;
      case "HK_STOCK":
        return hkStock.enabled !== false && hkStock.statusBar !== false;
      case "US_STOCK":
        return usStock.enabled !== false && usStock.statusBar !== false;
      case "CRYPTO":
        return binance.enabled !== false && binance.statusBar !== false;
      case "ALPHA_TOKEN":
      case "BSC_TOKEN":
        return alpha.enabled !== false && alpha.statusBar !== false;
      default:
        return true;
    }
  };

  const result: T[] = [];
  const seenSymbols = new Set<string>();

  for (const [groupName, items] of Object.entries(watchlist || {})) {
    for (const item of items || []) {
      if (!item?.symbol) continue;
      const symKey = item.symbol.toLowerCase().trim();
      if (seenSymbols.has(symKey)) continue;

      const assetType = resolveItemAssetType(item, groupName);
      if (!isSectionActive(assetType)) {
        continue;
      }

      seenSymbols.add(symKey);

      const normKey = normalizeSymbolKey(item.symbol);
      const rawTicker = item.symbol.toLowerCase().replace(/^(us|hk|sh|sz|bj)[\._\-]?/i, "");
      const cached =
        quoteCache.get(normKey) ||
        quoteCache.get(item.symbol) ||
        quoteCache.get(item.symbol.toLowerCase()) ||
        quoteCache.get(rawTicker);

      if (cached) {
        result.push(cached);
      } else {
        result.push({
          id: item.symbol,
          name: item.name || item.symbol,
          symbol: item.symbol,
          type: (assetType || item.type || "A_SHARE") as any,
          price: 0,
          changePercent: 0,
        } as unknown as T);
      }
    }
  }

  return result;
}

/**
 * 纯算法函数：计算同组/跨组拖拽重排后的新 watchlist 结构
 * 若未发生有效变动返回 null
 */
export function reorderWatchlist(
  currentWatchlist: Record<string, any[]>,
  sourceGroup: string,
  sourceSymbol: string,
  targetGroup: string,
  targetSymbol?: string
): Record<string, any[]> | null {
  if (!currentWatchlist[sourceGroup] || !currentWatchlist[targetGroup]) {
    return null;
  }

  const updated = { ...currentWatchlist };

  if (sourceGroup === targetGroup) {
    const items = [...updated[sourceGroup]];
    const origDragIndex = items.findIndex(
      (it) =>
        isSameSymbol(it.symbol, sourceSymbol) ||
        it.symbol?.toLowerCase() === sourceSymbol.toLowerCase()
    );
    if (origDragIndex === -1) {
      return null;
    }

    if (targetSymbol) {
      const origTargetIndex = items.findIndex(
        (it) =>
          isSameSymbol(it.symbol, targetSymbol) ||
          it.symbol?.toLowerCase() === targetSymbol.toLowerCase()
      );
      if (origTargetIndex === -1 || origTargetIndex === origDragIndex) {
        return null;
      }

      const [draggedItem] = items.splice(origDragIndex, 1);
      const newTargetIndex = items.findIndex(
        (it) =>
          isSameSymbol(it.symbol, targetSymbol) ||
          it.symbol?.toLowerCase() === targetSymbol.toLowerCase()
      );
      if (newTargetIndex !== -1) {
        if (origDragIndex < origTargetIndex) {
          items.splice(newTargetIndex + 1, 0, draggedItem);
        } else {
          items.splice(newTargetIndex, 0, draggedItem);
        }
      } else {
        items.push(draggedItem);
      }
    } else {
      // 拖拽到组名上时放到最顶部
      const [draggedItem] = items.splice(origDragIndex, 1);
      items.unshift(draggedItem);
    }

    updated[sourceGroup] = items;
    return updated;
  } else {
    // 跨组移动
    const sourceItems = [...updated[sourceGroup]];
    const targetItems = [...updated[targetGroup]];

    const dragIndex = sourceItems.findIndex(
      (it) =>
        isSameSymbol(it.symbol, sourceSymbol) ||
        it.symbol?.toLowerCase() === sourceSymbol.toLowerCase()
    );
    if (dragIndex === -1) {
      return null;
    }

    const [draggedItem] = sourceItems.splice(dragIndex, 1);
    updated[sourceGroup] = sourceItems;

    if (targetSymbol) {
      const targetIndex = targetItems.findIndex(
        (it) =>
          isSameSymbol(it.symbol, targetSymbol) ||
          it.symbol?.toLowerCase() === targetSymbol.toLowerCase()
      );
      if (targetIndex !== -1) {
        targetItems.splice(targetIndex, 0, draggedItem);
      } else {
        targetItems.push(draggedItem);
      }
    } else {
      targetItems.push(draggedItem);
    }

    updated[targetGroup] = targetItems;
    return updated;
  }
}


