// test/unit.test.ts
import assert from "node:assert";
import test from "node:test";

import { isSameSymbol, normalizeSymbolKey, normalizeUSCode, inferAShareExchange, normalizeAShareCode, resolveItemAssetType, resolveItemDisplayName, getWatchlistFingerprint, reorderWatchlist, batchReorderWatchlist, pruneQuoteCache, extractTargetsFromWatchlist, extractStatusBarQuotes, computeStatusBarEnabled, resolveTrendColors, chunkArray, decodeGbk, escapeHtml } from "../src/utils/symbolHelper.ts";
import { validateAndParseInput, isContractAddress, extractContractAddressFromUrl } from "../src/utils/inputValidator.ts";
import { isAShareMarketOpen, isHKMarketOpen, isUSMarketOpen, isAShareHoliday, isHKHoliday, isUSHoliday, evaluateAdaptiveThrottle, getZonedTimeParts, beijingFormatter, newYorkFormatter, shouldSkipMarketPolling } from "../src/utils/marketHours.ts";
import { validateAndNormalizeProxyUrl, parseProxy, resetProxyCache, getSystemProxyUrl } from "../src/services/network.ts";
import { isDisplayMasked } from "../src/utils/maskState.ts";
import { AlertManager } from "../src/services/alertManager.ts";
import { DexScreenerService } from "../src/services/dexScreenerService.ts";
import { BinanceService } from "../src/services/binanceService.ts";
import { AShareService } from "../src/services/aShareService.ts";
import { HKStockService } from "../src/services/hkStockService.ts";
import { USStockService } from "../src/services/usStockService.ts";

test("symbolHelper - 真实源码逻辑校验", () => {
  // A股
  assert.strictEqual(isSameSymbol("sh600030", "600030"), true);
  assert.strictEqual(isSameSymbol("sh000001", "sz000001"), false);
  assert.strictEqual(normalizeSymbolKey("sh600030"), "sh600030");

  // 港股（前缀与前导0归一化）
  assert.strictEqual(isSameSymbol("hk00700", "00700"), true);
  assert.strictEqual(isSameSymbol("hk700", "00700"), true);
  assert.strictEqual(normalizeSymbolKey("hk00700"), "hk700");
  assert.strictEqual(normalizeSymbolKey("00700"), "hk700");

  // 美股（点号与下划线，及真实 US 开头代码 USB/USM/USFD/USA 与 B/M/A 防冲突）
  assert.strictEqual(isSameSymbol("us.AAPL", "AAPL"), true);
  assert.strictEqual(isSameSymbol("us_TSLA", "tsla"), true);
  assert.strictEqual(normalizeSymbolKey("us.AAPL"), "aapl");
  assert.strictEqual(normalizeSymbolKey("AAPL"), "aapl");
  assert.strictEqual(normalizeSymbolKey("USB"), "usb");
  assert.strictEqual(normalizeSymbolKey("B"), "b");
  assert.strictEqual(normalizeSymbolKey("us.USB"), "usb");
  assert.strictEqual(isSameSymbol("USB", "B"), false);
  assert.strictEqual(isSameSymbol("USB", "us.USB"), true);
  assert.strictEqual(isSameSymbol("B", "us.B"), true);
  assert.strictEqual(isSameSymbol("USA", "A"), false);
  assert.strictEqual(isSameSymbol("USM", "M"), false);

  // 3字母美股腾讯格式 (usAMD, usNET, usTSM, usARM) 与裸代码互认及规范化
  assert.strictEqual(isSameSymbol("usAMD", "AMD"), true);
  assert.strictEqual(isSameSymbol("usNET", "NET"), true);
  assert.strictEqual(isSameSymbol("usTSM", "TSM"), true);
  assert.strictEqual(isSameSymbol("usARM", "ARM"), true);
  assert.strictEqual(normalizeSymbolKey("usAMD"), "amd");
  assert.strictEqual(normalizeSymbolKey("usNET"), "net");
  assert.strictEqual(normalizeSymbolKey("usTSM"), "tsm");

  // 美股类股（BRK.B, BF.B, BRK-B）与腾讯 us 前缀互通
  assert.strictEqual(isSameSymbol("BRK.B", "usBRK.B"), true);
  assert.strictEqual(isSameSymbol("BRK.B", "BRK-B"), true);
  assert.strictEqual(isSameSymbol("BF.B", "usBF.B"), true);
  assert.strictEqual(normalizeSymbolKey("BRK.B"), "brkb");
  assert.strictEqual(normalizeSymbolKey("usBRK.B"), "brkb");
  assert.strictEqual(normalizeSymbolKey("BRK-B"), "brkb");
  assert.strictEqual(normalizeSymbolKey("BF.B"), "bfb");
  assert.strictEqual(normalizeSymbolKey("usARM"), "arm");

  // 加密货币
  assert.strictEqual(isSameSymbol("BTCUSDT", "btcusdt"), true);
  assert.strictEqual(normalizeSymbolKey("BTCUSDT"), "btcusdt");
  assert.strictEqual(isSameSymbol("SOL/USDT", "SOLUSDT"), true);
  assert.strictEqual(normalizeSymbolKey("SOL/USDT"), "solusdt");
});

test("inputValidator - 真实源码输入识别与非法拦截", () => {
  // A股
  const a1 = validateAndParseInput("600519");
  assert.strictEqual(a1.parsed?.symbol, "sh600519");
  assert.strictEqual(a1.parsed?.type, "A_SHARE");

  const a2 = validateAndParseInput("000001");
  assert.strictEqual(a2.parsed?.symbol, "sz000001");

  // 港股
  const hk1 = validateAndParseInput("00700");
  assert.strictEqual(hk1.parsed?.symbol, "hk00700");
  assert.strictEqual(hk1.parsed?.type, "HK_STOCK");

  const hk2 = validateAndParseInput("hk700");
  assert.strictEqual(hk2.parsed?.symbol, "hk00700");
  assert.strictEqual(hk2.parsed?.type, "HK_STOCK");

  // 美股与加密货币
  const us1 = validateAndParseInput("AAPL");
  assert.strictEqual(us1.parsed?.symbol, "AAPL");
  assert.strictEqual(us1.parsed?.type, "US_STOCK");

  const c1 = validateAndParseInput("BTCUSDT");
  assert.strictEqual(c1.parsed?.symbol, "BTCUSDT");
  assert.strictEqual(c1.parsed?.type, "CRYPTO");

  // EVM 合约地址
  const evm = validateAndParseInput("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c");
  assert.strictEqual(evm.parsed?.type, "ALPHA_TOKEN");
  assert.strictEqual(isContractAddress("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"), true);

  // Solana 合约地址（测试以 sh 或 6位纯数字开头的边缘场景）
  const solWithSh = "shW7kF3Yc3pA9nL5xK8vQ2mR4tZ6jE1uB7hN9sC3wP2";
  const solWithNum = "688888F3Yc3pA9nL5xK8vQ2mR4tZ6jE1uB7hN9sC3wP2";
  assert.strictEqual(isContractAddress(solWithSh), true);
  assert.strictEqual(isContractAddress(solWithNum), true);
  assert.strictEqual(validateAndParseInput(solWithSh).parsed?.type, "ALPHA_TOKEN");
  assert.strictEqual(validateAndParseInput(solWithNum).parsed?.type, "ALPHA_TOKEN");

  // 腾讯前缀美股（如 usAMD, usNET）保留小写 us
  const usAmd = validateAndParseInput("usAMD");
  assert.strictEqual(usAmd.parsed?.symbol, "usAMD");
  assert.strictEqual(usAmd.parsed?.type, "US_STOCK");

  const usNet = validateAndParseInput("usNET");
  assert.strictEqual(usNet.parsed?.symbol, "usNET");

  // 美股类股（BRK.B, BRK-B, BF.B, us.BRK.B）测试
  const brkb = validateAndParseInput("BRK.B");
  assert.strictEqual(brkb.parsed?.symbol, "BRK.B");
  assert.strictEqual(brkb.parsed?.type, "US_STOCK");
  assert.strictEqual(brkb.parsed?.defaultGroup, "美股");

  const brkbDash = validateAndParseInput("BRK-B");
  assert.strictEqual(brkbDash.parsed?.symbol, "BRK.B");
  assert.strictEqual(brkbDash.parsed?.type, "US_STOCK");

  const bfb = validateAndParseInput("BF.B");
  assert.strictEqual(bfb.parsed?.symbol, "BF.B");
  assert.strictEqual(bfb.parsed?.type, "US_STOCK");

  const usBrkb = validateAndParseInput("us.BRK.B");
  assert.strictEqual(usBrkb.parsed?.symbol, "usBRK.B");
  assert.strictEqual(usBrkb.parsed?.type, "US_STOCK");

  // 加密货币 US 开头币对测试（防止被误判为美股）
  const usdcUsdt = validateAndParseInput("USDCUSDT");
  assert.strictEqual(usdcUsdt.parsed?.symbol, "USDCUSDT");
  assert.strictEqual(usdcUsdt.parsed?.type, "CRYPTO");

  const usdtTry = validateAndParseInput("USDTTRY");
  assert.strictEqual(usdtTry.parsed?.symbol, "USDTTRY");
  assert.strictEqual(usdtTry.parsed?.type, "CRYPTO");

  const usd1Usdt = validateAndParseInput("USD1USDT");
  assert.strictEqual(usd1Usdt.parsed?.symbol, "USD1USDT");
  assert.strictEqual(usd1Usdt.parsed?.type, "CRYPTO");

  // 异常拦截（如 4 位纯数字非法输入）
  const errNum = validateAndParseInput("1234");
  assert.ok(errNum.error);
});

test("marketHours - 真实源码时区与交易时段计算", () => {
  // 1. 测试北京时间 UTC 转换
  const mondayUtc = new Date("2026-09-07T02:00:00Z"); // UTC 02:00 -> 北京时间周一 10:00 (开市)
  const beijingParts = getZonedTimeParts(beijingFormatter, mondayUtc);
  assert.strictEqual(beijingParts.day, 1); // Mon
  assert.strictEqual(beijingParts.totalMinutes, 10 * 60);
  assert.strictEqual(isAShareMarketOpen(mondayUtc), true);
  assert.strictEqual(isHKMarketOpen(mondayUtc), true);

  // 2. 测试周末闭市
  const sundayUtc = new Date("2026-09-06T04:00:00Z"); // 周日
  assert.strictEqual(isAShareMarketOpen(sundayUtc), false);
  assert.strictEqual(isHKMarketOpen(sundayUtc), false);
  assert.strictEqual(isUSMarketOpen(sundayUtc), false);

  // 3. 测试美股交易时段（美东时间周一 10:30，UTC 14:30 处于夏令时常规时段）
  const usTradingUtc = new Date("2026-09-07T14:30:00Z");
  const nyParts = getZonedTimeParts(newYorkFormatter, usTradingUtc);
  assert.strictEqual(nyParts.day, 1); // Mon
  assert.strictEqual(nyParts.totalMinutes, 10 * 60 + 30);
  assert.strictEqual(isUSMarketOpen(usTradingUtc), true);
});

test("normalizeUSCode - 美股代码规范化与防双重前缀", () => {
  // 3字母带腾讯前缀：绝对不可变成 usUSAMD / usUSNET / usUSTSM / usUSARM
  assert.strictEqual(normalizeUSCode("usAMD"), "usAMD");
  assert.strictEqual(normalizeUSCode("usNET"), "usNET");
  assert.strictEqual(normalizeUSCode("usTSM"), "usTSM");
  assert.strictEqual(normalizeUSCode("usARM"), "usARM");

  // 4字母及长代码
  assert.strictEqual(normalizeUSCode("usAAPL"), "usAAPL");
  assert.strictEqual(normalizeUSCode("usNVDA"), "usNVDA");
  assert.strictEqual(normalizeUSCode("usIXIC"), "usIXIC");

  // 裸 ticker 补齐 us 前缀
  assert.strictEqual(normalizeUSCode("AMD"), "usAMD");
  assert.strictEqual(normalizeUSCode("AAPL"), "usAAPL");
  assert.strictEqual(normalizeUSCode("B"), "usB");
  assert.strictEqual(normalizeUSCode("USB"), "usUSB");
  assert.strictEqual(normalizeUSCode("USM"), "usUSM");
  assert.strictEqual(normalizeUSCode("USFD"), "usUSFD");

  // 带点号
  assert.strictEqual(normalizeUSCode(".IXIC"), "usIXIC");
  assert.strictEqual(normalizeUSCode("us.AMD"), "usAMD");
  assert.strictEqual(normalizeUSCode("us.USB"), "usUSB");

  // 美股类股（BRK.B, BRK-B, BF.B, usBRK.B, us.BRK.B）
  assert.strictEqual(normalizeUSCode("BRK.B"), "usBRK.B");
  assert.strictEqual(normalizeUSCode("BRK-B"), "usBRK.B");
  assert.strictEqual(normalizeUSCode("BF.B"), "usBF.B");
  assert.strictEqual(normalizeUSCode("usBRK.B"), "usBRK.B");
  assert.strictEqual(normalizeUSCode("us.BRK.B"), "usBRK.B");
});

test("bossKeyActive - 老板键状态与脱敏逻辑守卫校验（真实生产函数）", () => {
  // 1. 常规模式：取决于用户配置 maskMode
  assert.strictEqual(isDisplayMasked(false, false), false);
  assert.strictEqual(isDisplayMasked(false, true), true);

  // 2. 老板键激活中：无论用户配置中的 maskMode 为 true 还是 false，始终强制脱敏为 true
  assert.strictEqual(isDisplayMasked(true, false), true);
  assert.strictEqual(isDisplayMasked(true, true), true);
});

test("proxyUrl - 代理地址规范化与协议纠偏", () => {
  // 1. https 纠偏为 http（杜绝 EPROTO）
  assert.strictEqual(validateAndNormalizeProxyUrl("https://127.0.0.1:7890"), "http://127.0.0.1:7890");
  assert.strictEqual(validateAndNormalizeProxyUrl("https://localhost:10808"), "http://localhost:10808");

  // 2. socks5 / socks 剥离协议并规整为可用 http 代理形式（杜绝静默降级为 10808）
  assert.strictEqual(validateAndNormalizeProxyUrl("socks5://127.0.0.1:7890"), "http://127.0.0.1:7890");
  assert.strictEqual(validateAndNormalizeProxyUrl("socks://127.0.0.1:2080"), "http://127.0.0.1:2080");

  // 3. 无协议裸 host:port
  assert.strictEqual(validateAndNormalizeProxyUrl("127.0.0.1:7890"), "http://127.0.0.1:7890");
  assert.strictEqual(validateAndNormalizeProxyUrl("http://127.0.0.1:7890"), "http://127.0.0.1:7890");

  // 4. 企业/隧道代理账密认证信息保留（杜绝 407）
  assert.strictEqual(validateAndNormalizeProxyUrl("http://user:pass@proxy.corp.com:8080"), "http://user:pass@proxy.corp.com:8080");

  // 5. 远程代理不带端口时采用工业标准 8080
  assert.strictEqual(validateAndNormalizeProxyUrl("http://proxy.corp.com"), "http://proxy.corp.com:8080");

  // 6. 用户显式指定的各类代理端口必须严格忠实保留（杜绝历史 10808 哨兵篡改）
  const parsed10808 = parseProxy("http://127.0.0.1:10808");
  assert.strictEqual(parsed10808.port, 10808);
  assert.strictEqual(parsed10808.host, "127.0.0.1");

  const parsed7890 = parseProxy("http://127.0.0.1:7890");
  assert.strictEqual(parsed7890.port, 7890);

  const parsed2080 = parseProxy("http://127.0.0.1:2080");
  assert.strictEqual(parsed2080.port, 2080);

  // 7. 测试 resetProxyCache 能正确重置，在无系统代理环境变量时空值默认回退到 10808
  resetProxyCache();
  const originalHttpProxy = process.env.HTTP_PROXY;
  const originalHttpsProxy = process.env.HTTPS_PROXY;
  const originalAllProxy = process.env.ALL_PROXY;
  delete process.env.HTTP_PROXY;
  delete process.env.http_proxy;
  delete process.env.HTTPS_PROXY;
  delete process.env.https_proxy;
  delete process.env.ALL_PROXY;
  delete process.env.all_proxy;

  try {
    assert.strictEqual(validateAndNormalizeProxyUrl(""), "http://127.0.0.1:10808");

    // 8. 测试纯数字端口号解析
    assert.strictEqual(validateAndNormalizeProxyUrl("10808"), "http://127.0.0.1:10808");
    assert.strictEqual(validateAndNormalizeProxyUrl("7890"), "http://127.0.0.1:7890");
  } finally {
    if (originalHttpProxy !== undefined) process.env.HTTP_PROXY = originalHttpProxy;
    if (originalHttpsProxy !== undefined) process.env.HTTPS_PROXY = originalHttpsProxy;
    if (originalAllProxy !== undefined) process.env.ALL_PROXY = originalAllProxy;
  }
});

test("getSystemProxyUrl - 操作系统环境变量代理自适应回退", () => {
  const savedEnv: Record<string, string | undefined> = {
    HTTP_PROXY: process.env.HTTP_PROXY,
    http_proxy: process.env.http_proxy,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    https_proxy: process.env.https_proxy,
    ALL_PROXY: process.env.ALL_PROXY,
    all_proxy: process.env.all_proxy,
  };

  const clearProxyEnv = () => {
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.ALL_PROXY;
    delete process.env.all_proxy;
    resetProxyCache();
  };

  try {
    // 1. 无环境变量时返回 undefined
    clearProxyEnv();
    assert.strictEqual(getSystemProxyUrl(), undefined);
    assert.strictEqual(validateAndNormalizeProxyUrl(""), "http://127.0.0.1:10808");

    // 2. 支持 HTTPS_PROXY 标准环境变量
    clearProxyEnv();
    process.env.HTTPS_PROXY = "http://127.0.0.1:7890";
    assert.strictEqual(getSystemProxyUrl(), "http://127.0.0.1:7890");
    assert.strictEqual(validateAndNormalizeProxyUrl(""), "http://127.0.0.1:7890");

    // 3. 支持小写 http_proxy 与局域网/软路由 IP 代理
    clearProxyEnv();
    process.env.http_proxy = "http://192.168.1.100:7890";
    assert.strictEqual(getSystemProxyUrl(), "http://192.168.1.100:7890");
    assert.strictEqual(validateAndNormalizeProxyUrl(""), "http://192.168.1.100:7890");

    // 4. 支持 ALL_PROXY 及其 socks5 协议规整化
    clearProxyEnv();
    process.env.ALL_PROXY = "socks5://127.0.0.1:1080";
    assert.strictEqual(getSystemProxyUrl(), "http://127.0.0.1:1080");
    assert.strictEqual(validateAndNormalizeProxyUrl(""), "http://127.0.0.1:1080");

    // 5. 用户显式配置具有最高优先级（即使配置了系统环境变量，用户自定义端口仍获优先）
    assert.strictEqual(validateAndNormalizeProxyUrl("7897"), "http://127.0.0.1:7897");
    assert.strictEqual(validateAndNormalizeProxyUrl("http://127.0.0.1:2080"), "http://127.0.0.1:2080");
  } finally {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v !== undefined) {
        process.env[k] = v;
      } else {
        delete process.env[k];
      }
    }
    resetProxyCache();
  }
});

test("resolveItemAssetType & 分组板块判定策略（先看 item.type，彻底杜绝组名子串误伤）", () => {
  // 1. 显式 type 拥有最高裁决权（First-Class Citizen）
  assert.strictEqual(resolveItemAssetType({ symbol: "BTCUSDT", type: "CRYPTO" }, "crypto-us"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "ETHUSDT", type: "CRYPTO" }, "USDT仓位"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "SOLUSDT", type: "CRYPTO" }, "我的HK账户"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "AAPL", type: "US_STOCK" }, "USDT仓位"), "US_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "00700", type: "HK_STOCK" }, "美股自选"), "HK_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "600519", type: "A_SHARE" }, "我的港股"), "A_SHARE");

  // 2. 无显式 type 时，特征与上下文启发兜底
  assert.strictEqual(resolveItemAssetType({ symbol: "BTCUSDT" }, "临时组"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "00700" }, "临时组"), "HK_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "600519" }, "临时组"), "A_SHARE");
  assert.strictEqual(resolveItemAssetType({ symbol: "AAPL" }, "临时组"), "US_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "BRK.B" }, "临时组"), "US_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "BF.B" }, "临时组"), "US_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "BRK-B" }, "临时组"), "US_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "0x28cd1fc7b6eebf46b59001ff49c9d14f8bb97777" }, "临时组"), "ALPHA_TOKEN");

  // 3. 空组名场景启发（组内无 item 时）
  assert.strictEqual(resolveItemAssetType({ symbol: "" }, "USDT仓位"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "" }, "crypto-us"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "" }, "我的HK账户"), "HK_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "" }, "美股精选"), "US_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "" }, "A股主板"), "A_SHARE");

  // 4. 中立空组（无 item，组名无特定市场关键词）返回 undefined，不被误绑至 CRYPTO，权重归 100
  assert.strictEqual(resolveItemAssetType({ symbol: "" }, "自选"), undefined);
  assert.strictEqual(resolveItemAssetType({ symbol: "" }, "默认分组"), undefined);
  assert.strictEqual(resolveItemAssetType({ symbol: "" }, "我的关注"), undefined);

  // 5. 无 type 时，代码绝对强特征必须超越组名（物理属性优先，杜绝组名反客为主）
  assert.strictEqual(resolveItemAssetType({ symbol: "sh600519" }, "Binance长线"), "A_SHARE");
  assert.strictEqual(resolveItemAssetType({ symbol: "hk00700" }, "crypto-us"), "HK_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "usAAPL" }, "Binance长线"), "US_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "sh600519" }, "我的HK账户"), "A_SHARE");
  assert.strictEqual(resolveItemAssetType({ symbol: "600519" }, "美股精选"), "A_SHARE");
  assert.strictEqual(resolveItemAssetType({ symbol: "00700" }, "币安现货"), "HK_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: ".DJI" }, "A股主板"), "US_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "BTCUSDT" }, "A股主板"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" }, "美股精选"), "ALPHA_TOKEN");

  // 6. 特别校验：以 US 开头的真实币对（如 USTCUSDT, USDPUSDT, USUALUSDT）必须判定为 CRYPTO，彻底免疫美股 us 前缀截胡
  assert.strictEqual(resolveItemAssetType({ symbol: "USTCUSDT" }, "美股精选"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "USTCUSDT" }, "临时组"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "USDPUSDT" }, "美股精选"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "USDPUSDT" }, "临时组"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "USUALUSDT" }, "美股精选"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "USDCUSDT" }, "美股精选"), "CRYPTO");
  assert.strictEqual(resolveItemAssetType({ symbol: "usAAPL" }, "临时组"), "US_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "usAMD" }, "临时组"), "US_STOCK");
  assert.strictEqual(resolveItemAssetType({ symbol: "us.NVDA" }, "临时组"), "US_STOCK");
});

test("getWatchlistFingerprint - 自选指纹与防重复全量网络请求校验", () => {
  // 1. 基准配置
  const baseWatchlist = {
    "A股": [
      { symbol: "sh600030", name: "中信证券", type: "A_SHARE" },
      { symbol: "sz000001", name: "平安银行", type: "A_SHARE" },
    ],
    "Binance": [
      { symbol: "BTCUSDT", name: "BTC", type: "CRYPTO" },
      { symbol: "ETHUSDT", name: "ETH", type: "CRYPTO" },
    ],
  };

  const baseFingerprint = getWatchlistFingerprint(baseWatchlist);
  assert.strictEqual(baseFingerprint, "btcusdt,ethusdt,sh600030,sz000001");

  // 2. 同组拖拽重排测试：[sh600030, sz000001] -> [sz000001, sh600030]，指纹必须严格不变（阻止无意义打网）
  const reorderedWatchlist = {
    "A股": [
      { symbol: "sz000001", name: "平安银行", type: "A_SHARE" },
      { symbol: "sh600030", name: "中信证券", type: "A_SHARE" },
    ],
    "Binance": [
      { symbol: "ETHUSDT", name: "ETH", type: "CRYPTO" },
      { symbol: "BTCUSDT", name: "BTC", type: "CRYPTO" },
    ],
  };
  assert.strictEqual(getWatchlistFingerprint(reorderedWatchlist), baseFingerprint);

  // 3. 跨组移动测试：将 sh600030 挪到新分组 "自选1"，总监控集合不变，指纹必须严格不变
  const crossGroupWatchlist = {
    "A股": [
      { symbol: "sz000001", name: "平安银行", type: "A_SHARE" },
    ],
    "自选1": [
      { symbol: "sh600030", name: "中信证券", type: "A_SHARE" },
    ],
    "Binance": [
      { symbol: "BTCUSDT", name: "BTC", type: "CRYPTO" },
      { symbol: "ETHUSDT", name: "ETH", type: "CRYPTO" },
    ],
  };
  assert.strictEqual(getWatchlistFingerprint(crossGroupWatchlist), baseFingerprint);

  // 4. 大小写与首尾多余空白脱敏
  const messyWatchlist = {
    "A股": [
      { symbol: " SH600030  " },
      { symbol: "sz000001" },
    ],
    "Binance": [
      { symbol: "btcusdt" },
      { symbol: " ethusdt " },
    ],
  };
  assert.strictEqual(getWatchlistFingerprint(messyWatchlist), baseFingerprint);

  // 5. 组内重复标的去重
  const duplicateWatchlist = {
    "A股": [
      { symbol: "sh600030" },
      { symbol: "sh600030" },
      { symbol: "sz000001" },
    ],
    "Binance": [
      { symbol: "BTCUSDT" },
      { symbol: "ETHUSDT" },
    ],
  };
  assert.strictEqual(getWatchlistFingerprint(duplicateWatchlist), baseFingerprint);

  // 6. 新增标的：加入 SOLUSDT，指纹必须改变（正确触发重新打网）
  const addedWatchlist = {
    ...baseWatchlist,
    "Binance": [
      ...baseWatchlist["Binance"],
      { symbol: "SOLUSDT", name: "SOL", type: "CRYPTO" },
    ],
  };
  assert.notStrictEqual(getWatchlistFingerprint(addedWatchlist), baseFingerprint);
  assert.strictEqual(getWatchlistFingerprint(addedWatchlist), "btcusdt,ethusdt,sh600030,solusdt,sz000001");

  // 7. 删除标的：移除 sz000001，指纹必须改变
  const removedWatchlist = {
    "A股": [
      { symbol: "sh600030", name: "中信证券", type: "A_SHARE" },
    ],
    "Binance": baseWatchlist["Binance"],
  };
  assert.notStrictEqual(getWatchlistFingerprint(removedWatchlist), baseFingerprint);
  assert.strictEqual(getWatchlistFingerprint(removedWatchlist), "btcusdt,ethusdt,sh600030");

  // 8. 边界条件容错：空对象、空分组、空 symbol
  assert.strictEqual(getWatchlistFingerprint({}), "");
  assert.strictEqual(getWatchlistFingerprint({ "空组": [], "另一组": [{ symbol: "" }] }), "");
});

test("reorderWatchlist - 自选标的同组重排与跨组位移测试", () => {
  const initList = () => ({
    "A股": [
      { symbol: "sh600030", name: "中信证券" },
      { symbol: "sz000839", name: "国安股份" },
      { symbol: "sz002385", name: "大北农" },
    ],
    "Binance": [
      { symbol: "BTCUSDT", name: "BTC" },
      { symbol: "ETHUSDT", name: "ETH" },
    ],
  });

  // 1. 同组向下拖拽：把 sh600030 拖到 sz000839 后面
  const downRes = reorderWatchlist(initList(), "A股", "sh600030", "A股", "sz000839");
  assert.ok(downRes);
  assert.deepStrictEqual(downRes["A股"].map((x) => x.symbol), ["sz000839", "sh600030", "sz002385"]);

  // 2. 同组向上拖拽：把 sz002385 拖到 sh600030 前面
  const upRes = reorderWatchlist(initList(), "A股", "sz002385", "A股", "sh600030");
  assert.ok(upRes);
  assert.deepStrictEqual(upRes["A股"].map((x) => x.symbol), ["sz002385", "sh600030", "sz000839"]);

  // 3. 拖到组名（targetSymbol 未传）：将 sz002385 拖到组名置顶
  const pinRes = reorderWatchlist(initList(), "A股", "sz002385", "A股");
  assert.ok(pinRes);
  assert.deepStrictEqual(pinRes["A股"].map((x) => x.symbol), ["sz002385", "sh600030", "sz000839"]);

  // 4. 跨组拖拽拦截：禁止跨组移动到其它组，必须返回 null
  const crossRes = reorderWatchlist(initList(), "A股", "sh600030", "Binance", "ETHUSDT");
  assert.strictEqual(crossRes, null);

  // 5. 跨组拖拽到其他组名拦截：必须返回 null
  const crossAppend = reorderWatchlist(initList(), "A股", "sh600030", "Binance");
  assert.strictEqual(crossAppend, null);

  // 6. 异常与无效保护：源标的不存在、组不存在、拖到自己上面
  assert.strictEqual(reorderWatchlist(initList(), "不存在的组", "sh600030", "A股"), null);
  assert.strictEqual(reorderWatchlist(initList(), "A股", "non_existent", "A股", "sz000839"), null);
  assert.strictEqual(reorderWatchlist(initList(), "A股", "sh600030", "A股", "sh600030"), null);
});

test("batchReorderWatchlist - 多选批量拖拽原子重排测试", () => {
  const initList = () => ({
    "A股": [
      { symbol: "sh600030", name: "中信证券" },
      { symbol: "sz000839", name: "国安股份" },
      { symbol: "sz002385", name: "大北农" },
      { symbol: "sh601398", name: "工商银行" },
    ],
    "Binance": [
      { symbol: "BTCUSDT", name: "BTC" },
      { symbol: "ETHUSDT", name: "ETH" },
      { symbol: "SOLUSDT", name: "SOL" },
    ],
  });

  // 1. 同组向下批量拖拽：将 [sh600030, sz000839] 拖到 sz002385 后面
  const downRes = batchReorderWatchlist(
    initList(),
    [
      { sourceGroup: "A股", sourceSymbol: "sh600030" },
      { sourceGroup: "A股", sourceSymbol: "sz000839" },
    ],
    "A股",
    "sz002385"
  );
  assert.ok(downRes);
  assert.deepStrictEqual(
    downRes["A股"].map((x) => x.symbol),
    ["sz002385", "sh600030", "sz000839", "sh601398"]
  );

  // 2. 同组向上批量拖拽：将 [sz002385, sh601398] 拖到 sh600030 前面
  const upRes = batchReorderWatchlist(
    initList(),
    [
      { sourceGroup: "A股", sourceSymbol: "sz002385" },
      { sourceGroup: "A股", sourceSymbol: "sh601398" },
    ],
    "A股",
    "sh600030"
  );
  assert.ok(upRes);
  assert.deepStrictEqual(
    upRes["A股"].map((x) => x.symbol),
    ["sz002385", "sh601398", "sh600030", "sz000839"]
  );

  // 3. 同组拖到组名（targetSymbol 未传）：整批置顶
  const pinRes = batchReorderWatchlist(
    initList(),
    [
      { sourceGroup: "A股", sourceSymbol: "sz000839" },
      { sourceGroup: "A股", sourceSymbol: "sh601398" },
    ],
    "A股"
  );
  assert.ok(pinRes);
  assert.deepStrictEqual(
    pinRes["A股"].map((x) => x.symbol),
    ["sz000839", "sh601398", "sh600030", "sz002385"]
  );

  // 4. 跨组批量拖拽拦截：禁止跨组移入其它组，必须返回 null
  const crossTargetRes = batchReorderWatchlist(
    initList(),
    [
      { sourceGroup: "A股", sourceSymbol: "sh600030" },
      { sourceGroup: "A股", sourceSymbol: "sz000839" },
    ],
    "Binance",
    "ETHUSDT"
  );
  assert.strictEqual(crossTargetRes, null);

  // 5. 跨组批量移动到其他组名拦截：必须返回 null
  const crossAppendRes = batchReorderWatchlist(
    initList(),
    [
      { sourceGroup: "A股", sourceSymbol: "sh600030" },
      { sourceGroup: "A股", sourceSymbol: "sz000839" },
    ],
    "Binance"
  );
  assert.strictEqual(crossAppendRes, null);

  // 6. 自拖拽保护（Self-drop guard）：目标标的本身在移动项中，必须返回 null 防止产生脏数据
  const selfDropRes = batchReorderWatchlist(
    initList(),
    [
      { sourceGroup: "A股", sourceSymbol: "sh600030" },
      { sourceGroup: "A股", sourceSymbol: "sz000839" },
    ],
    "A股",
    "sh600030"
  );
  assert.strictEqual(selfDropRes, null);

  // 7. 空项保护与非法目标组保护
  assert.strictEqual(batchReorderWatchlist(initList(), [], "A股"), null);
  assert.strictEqual(
    batchReorderWatchlist(initList(), [{ sourceGroup: "A股", sourceSymbol: "sh600030" }], "不存在的分组"),
    null
  );
  assert.strictEqual(
    batchReorderWatchlist(initList(), [{ sourceGroup: "不存在的组", sourceSymbol: "sh600030" }], "A股"),
    null
  );
});

test("pruneQuoteCache - 活跃集对齐与死缓存回收测试 (Active-Set Prune)", () => {
  const activeWatchlist = {
    "A股": [
      { symbol: "sh600030", name: "中信证券" },
      { symbol: "sh600519", name: "贵州茅台" }, // 闭市标的，必须保留收盘价
    ],
    "Binance": [
      { symbol: "BTCUSDT", name: "BTC" },
    ],
    "Alpha": [
      { symbol: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", name: "WBNB", id: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" },
    ],
  };

  const quoteCache = new Map<string, any>();

  // 1. 灌入当前在自选中的标的缓存（含多别名注册）
  quoteCache.set("sh600030", { symbol: "sh600030", name: "中信证券", price: 28.5 });
  quoteCache.set("sh600519", { symbol: "sh600519", name: "贵州茅台", price: 1780.0 });
  quoteCache.set("btcusdt", { symbol: "BTCUSDT", name: "BTC", price: 65000 });
  quoteCache.set("BTCUSDT", { symbol: "BTCUSDT", name: "BTC", price: 65000 });
  // Alpha 代币合约与代币名
  quoteCache.set("0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", {
    symbol: "WBNB",
    id: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    price: 580,
  });
  quoteCache.set("WBNB", {
    symbol: "WBNB",
    id: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    price: 580,
  });

  // 2. 灌入历史死标的缓存（用户之前添加过、现已删除或替换的垃圾 Meme 币 / 旧股票）
  quoteCache.set("0x1111111111111111111111111111111111111111", {
    symbol: "DEADCOIN",
    id: "0x1111111111111111111111111111111111111111",
    price: 0.000001,
  });
  quoteCache.set("DEADCOIN", {
    symbol: "DEADCOIN",
    id: "0x1111111111111111111111111111111111111111",
    price: 0.000001,
  });
  quoteCache.set("sz000002", { symbol: "sz000002", name: "万科A", price: 9.2 });

  assert.strictEqual(quoteCache.size, 9);

  // 3. 执行活跃集对齐修剪
  const prunedCount = pruneQuoteCache(activeWatchlist, quoteCache);

  // 验证死缓存被彻底清理：0x1111..., DEADCOIN, sz000002 共 3 条
  assert.strictEqual(prunedCount, 3);
  assert.strictEqual(quoteCache.size, 6);

  // 验证死缓存完全不存在
  assert.strictEqual(quoteCache.has("0x1111111111111111111111111111111111111111"), false);
  assert.strictEqual(quoteCache.has("DEADCOIN"), false);
  assert.strictEqual(quoteCache.has("sz000002"), false);

  // 验证当前自选中的所有标的（包括闭市的贵州茅台、Alpha 合约与名称）均完整保留
  assert.strictEqual(quoteCache.get("sh600030")?.price, 28.5);
  assert.strictEqual(quoteCache.get("sh600519")?.price, 1780.0);
  assert.strictEqual(quoteCache.get("btcusdt")?.price, 65000);
  assert.strictEqual(quoteCache.get("BTCUSDT")?.price, 65000);
  assert.strictEqual(quoteCache.get("0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c")?.price, 580);
  assert.strictEqual(quoteCache.get("WBNB")?.price, 580);

  // 4. 测试一键清空自选场景：所有缓存必须被安全回收
  const prunedAllCount = pruneQuoteCache({}, quoteCache);
  assert.strictEqual(prunedAllCount, 6);
  assert.strictEqual(quoteCache.size, 0);

  // 5. 空 Map 容错保护
  assert.strictEqual(pruneQuoteCache(activeWatchlist, new Map()), 0);
});

test("extractTargetsFromWatchlist - 标的分桶过滤与闭市跳过测试", () => {
  const mockWatchlist = {
    "混合自选": [
      { symbol: "sh600519", type: "A_SHARE" },
      { symbol: "00700", type: "HK_STOCK" },
      { symbol: "AAPL", type: "US_STOCK" },
      { symbol: "BTCUSDT", type: "CRYPTO" },
      { symbol: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", type: "ALPHA_TOKEN" },
    ],
    "美股专属": [
      { symbol: "TSLA", type: "US_STOCK" },
      { symbol: "NVDA", type: "US_STOCK" },
    ],
  };

  // 1. 全开状态分桶提取
  const allTargets = extractTargetsFromWatchlist(mockWatchlist);
  assert.deepStrictEqual(allTargets.aShares, ["sh600519"]);
  assert.deepStrictEqual(allTargets.hkStocks, ["00700"]);
  assert.deepStrictEqual(allTargets.usStocks, ["AAPL", "TSLA", "NVDA"]);
  assert.deepStrictEqual(allTargets.cryptos, ["BTCUSDT"]);
  assert.deepStrictEqual(allTargets.bscTokens, ["0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"]);

  // 2. 板块关闭测试：禁用 A 股与加密货币
  const disabledTargets = extractTargetsFromWatchlist(mockWatchlist, {
    aShareEnabled: false,
    binanceEnabled: false,
  });
  assert.deepStrictEqual(disabledTargets.aShares, []);
  assert.deepStrictEqual(disabledTargets.cryptos, []);
  assert.strictEqual(disabledTargets.usStocks.length, 3);
  assert.strictEqual(disabledTargets.hkStocks.length, 1);

  // 3. 闭市跳过测试：A 股闭市跳过，美股不跳过
  const marketClosedTargets = extractTargetsFromWatchlist(mockWatchlist, {
    skipAShare: true,
    skipUSStock: false,
  });
  assert.deepStrictEqual(marketClosedTargets.aShares, []);
  assert.deepStrictEqual(marketClosedTargets.usStocks, ["AAPL", "TSLA", "NVDA"]);

  // 4. 特定分组提取：仅提取 "美股专属" 分组
  const groupSpecificTargets = extractTargetsFromWatchlist(mockWatchlist, {
    specificGroupName: "美股专属",
  });
  assert.deepStrictEqual(groupSpecificTargets.usStocks, ["TSLA", "NVDA"]);
  assert.deepStrictEqual(groupSpecificTargets.aShares, []);
  assert.deepStrictEqual(groupSpecificTargets.cryptos, []);
});

test("extractStatusBarQuotes - 底部状态栏49标的全量轮播与分板块开关即时过滤测试", () => {
  // 构建符合真实生产配置的 49 个预设标的 Watchlist
  // A股: 10, 港股: 6, 美股: 9, Binance: 12, Alpha: 12 = 49
  const defaultWatchlist = {
    "A股": [
      { symbol: "sh600030", name: "中信证券", type: "A_SHARE" },
      { symbol: "sz000839", name: "国安股份", type: "A_SHARE" },
      { symbol: "sz002385", name: "大北农", type: "A_SHARE" },
      { symbol: "sh603686", name: "福龙马", type: "A_SHARE" },
      { symbol: "sz002867", name: "周大生", type: "A_SHARE" },
      { symbol: "sh603031", name: "安孚科技", type: "A_SHARE" },
      { symbol: "sz000977", name: "浪潮信息", type: "A_SHARE" },
      { symbol: "sh688545", name: "兴福电子", type: "A_SHARE" },
      { symbol: "sh688584", name: "上海合晶", type: "A_SHARE" },
      { symbol: "sz301293", name: "三博脑科", type: "A_SHARE" },
    ],
    "港股": [
      { symbol: "hk06030", name: "中信证券", type: "HK_STOCK" },
      { symbol: "hk00700", name: "腾讯控股", type: "HK_STOCK" },
      { symbol: "hk03690", name: "美团-W", type: "HK_STOCK" },
      { symbol: "hk09988", name: "阿里巴巴-SW", type: "HK_STOCK" },
      { symbol: "hk00981", name: "中芯国际", type: "HK_STOCK" },
      { symbol: "hk01810", name: "小米集团-W", type: "HK_STOCK" },
    ],
    "美股": [
      { symbol: "usAAPL", name: "苹果", type: "US_STOCK" },
      { symbol: "usNVDA", name: "英伟达", type: "US_STOCK" },
      { symbol: "usTSLA", name: "特斯拉", type: "US_STOCK" },
      { symbol: "usNET", name: "Cloudflare", type: "US_STOCK" },
      { symbol: "usTSM", name: "台积电", type: "US_STOCK" },
      { symbol: "usAMD", name: "超威半导体", type: "US_STOCK" },
      { symbol: "usAVGO", name: "博通", type: "US_STOCK" },
      { symbol: "usARM", name: "安谋", type: "US_STOCK" },
      { symbol: "usIXIC", name: "纳斯达克综合指数", type: "US_STOCK" },
    ],
    "Binance": [
      { symbol: "BTCUSDT", name: "BTC/USDT", type: "CRYPTO" },
      { symbol: "ETHUSDT", name: "ETH/USDT", type: "CRYPTO" },
      { symbol: "ETCUSDT", name: "ETC/USDT", type: "CRYPTO" },
      { symbol: "SOLUSDT", name: "SOL/USDT", type: "CRYPTO" },
      { symbol: "BNBUSDT", name: "BNB/USDT", type: "CRYPTO" },
      { symbol: "ARBUSDT", name: "ARB/USDT", type: "CRYPTO" },
      { symbol: "OPUSDT", name: "OP/USDT", type: "CRYPTO" },
      { symbol: "APTUSDT", name: "APT/USDT", type: "CRYPTO" },
      { symbol: "DOGEUSDT", name: "DOGE/USDT", type: "CRYPTO" },
      { symbol: "ORDIUSDT", name: "ORDI/USDT", type: "CRYPTO" },
      { symbol: "ASTERUSDT", name: "ASTER/USDT", type: "CRYPTO" },
      { symbol: "LUNAUSDT", name: "LUNA/USDT", type: "CRYPTO" },
    ],
    "Alpha": [
      { symbol: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", name: "WBNB", type: "ALPHA_TOKEN" },
      { symbol: "0x55d398326f99059fF775485246999027B3197955", name: "USDT", type: "ALPHA_TOKEN" },
      { symbol: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", name: "USDC", type: "ALPHA_TOKEN" },
      { symbol: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", name: "ETH", type: "ALPHA_TOKEN" },
      { symbol: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", name: "BTCB", type: "ALPHA_TOKEN" },
      { symbol: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", name: "CAKE", type: "ALPHA_TOKEN" },
      { symbol: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", name: "BUSD", type: "ALPHA_TOKEN" },
      { symbol: "0x14016E85a25a55715135CE47bB891e4a1E4B9245", name: "XVS", type: "ALPHA_TOKEN" },
      { symbol: "0x570A5D26f7708833242CE6daC7601804157d3710", name: "BAKE", type: "ALPHA_TOKEN" },
      { symbol: "0x8f0528cE5eF7B51152A59745bEfDD91D97091d2F", name: "ALPACA", type: "ALPHA_TOKEN" },
      { symbol: "0x0D8Ce2A99Bb6e3B7Db580eD848240e4a0F9aE153", name: "FIL", type: "ALPHA_TOKEN" },
      { symbol: "0x1CE0c482752f2571085744e793707090449174fb", name: "DOT", type: "ALPHA_TOKEN" },
    ],
  };

  // 模拟从 initial load 填充的 quoteCache
  const mockCache = new Map<string, any>();
  for (const [_, items] of Object.entries(defaultWatchlist)) {
    for (const it of items) {
      mockCache.set(it.symbol, {
        id: it.symbol,
        name: it.name,
        symbol: it.symbol,
        type: it.type,
        price: 100,
        changePercent: 1.5,
      });
    }
  }

  // 1. 默认情况下（全开状态），应完整返回全部 49 个标的参与轮播（即使此时市场闭市跳过了周期打网）
  const fullQuotes = extractStatusBarQuotes(defaultWatchlist, mockCache);
  assert.strictEqual(fullQuotes.length, 49, "默认应有 49 个标的参与底部轮播");

  // 2. 关闭 A 股底部轮播（aShare.statusBar = false）
  const noAshareQuotes = extractStatusBarQuotes(defaultWatchlist, mockCache, {
    aShare: { enabled: true, statusBar: false },
  });
  assert.strictEqual(noAshareQuotes.length, 39, "关闭 A 股轮播后应有 39 个标的 (49 - 10)");
  assert.ok(!noAshareQuotes.some((q) => q.type === "A_SHARE"), "结果中不应包含任何 A 股标的");

  // 3. 关闭 Binance 底部轮播（binance.statusBar = false）
  const noBinanceQuotes = extractStatusBarQuotes(defaultWatchlist, mockCache, {
    binance: { enabled: true, statusBar: false },
  });
  assert.strictEqual(noBinanceQuotes.length, 37, "关闭 Binance 轮播后应有 37 个标的 (49 - 12)");
  assert.ok(!noBinanceQuotes.some((q) => q.type === "CRYPTO"), "结果中不应包含任何加密货币标的");

  // 4. 关闭整个板块（aShare.enabled = false）
  const aShareDisabled = extractStatusBarQuotes(defaultWatchlist, mockCache, {
    aShare: { enabled: false, statusBar: true },
  });
  assert.strictEqual(aShareDisabled.length, 39, "A股板块禁用后不应参与轮播");

  // 5. 5个板块轮播全部关闭时，应返回空数组并隐藏状态栏
  const allDisabled = extractStatusBarQuotes(defaultWatchlist, mockCache, {
    aShare: { enabled: true, statusBar: false },
    hkStock: { enabled: true, statusBar: false },
    usStock: { enabled: true, statusBar: false },
    binance: { enabled: true, statusBar: false },
    alpha: { enabled: true, statusBar: false },
  });
  assert.strictEqual(allDisabled.length, 0, "全部板块轮播关闭后应返回空数组");

  // 6. 一键清空自选列表后（watchlist 为空对象）
  const emptyQuotes = extractStatusBarQuotes({}, mockCache);
  assert.strictEqual(emptyQuotes.length, 0, "清空自选列表后应返回空数组并隐藏状态栏");

  // 7. 重复标的去重保护
  const dupWatchlist = {
    "组1": [{ symbol: "BTCUSDT", type: "CRYPTO" }],
    "组2": [{ symbol: "BTCUSDT", type: "CRYPTO" }],
  };
  const dupQuotes = extractStatusBarQuotes(dupWatchlist, mockCache);
  assert.strictEqual(dupQuotes.length, 1, "跨组同标的代码应自动去重");

  // 8. 状态栏总开关测试（statusBarEnabled = false 必须直接返回空数组，令状态栏即时隐藏）
  const disabledTotalQuotes = extractStatusBarQuotes(defaultWatchlist, mockCache, {
    statusBarEnabled: false,
  });
  assert.strictEqual(disabledTotalQuotes.length, 0, "状态栏轮播总开关关闭时，应直接返回空数组令状态栏立即隐藏");

  // 9. 联动逻辑判定测试：5个全开 -> 全局总开关为 true；任意一个关闭 -> 全局总开关为 false，但其余正常轮播
  const calcMaster = (a: boolean, h: boolean, u: boolean, b: boolean, al: boolean) => a && h && u && b && al;
  assert.strictEqual(calcMaster(true, true, true, true, true), true, "5个板块全部开启轮播时，全部标的参与轮播总开关为 true");
  assert.strictEqual(calcMaster(false, true, true, true, true), false, "A股关闭轮播时，全部标的参与轮播总开关为 false");
  assert.strictEqual(calcMaster(true, false, true, true, true), false, "港股关闭轮播时，全部标的参与轮播总开关为 false");
  assert.strictEqual(calcMaster(true, true, false, true, true), false, "美股关闭轮播时，全部标的参与轮播总开关为 false");
  assert.strictEqual(calcMaster(true, true, true, false, true), false, "Binance关闭轮播时，全部标的参与轮播总开关为 false");
  assert.strictEqual(calcMaster(true, true, true, true, false), false, "Alpha关闭轮播时，全部标的参与轮播总开关为 false");
});

test("proxyPort - 端口校验与提取规则", () => {
  function validatePort(val: any): number | null {
    let raw = String(val || "").trim();
    const match = raw.match(/:(\d{1,5})/);
    if (match) {
      raw = match[1];
    }
    const port = parseInt(raw, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return null;
    }
    return port;
  }

  // 合法端口数字
  assert.strictEqual(validatePort(10808), 10808);
  assert.strictEqual(validatePort(7890), 7890);
  assert.strictEqual(validatePort("10808"), 10808);
  assert.strictEqual(validatePort(1), 1);
  assert.strictEqual(validatePort(65535), 65535);

  // 粘贴完整地址时智能提取端口
  assert.strictEqual(validatePort("http://127.0.0.1:10808"), 10808);
  assert.strictEqual(validatePort("127.0.0.1:7890"), 7890);
  assert.strictEqual(validatePort("localhost:10809"), 10809);

  // 非法端口校验拦截
  assert.strictEqual(validatePort(""), null);
  assert.strictEqual(validatePort("0"), null);
  assert.strictEqual(validatePort(-1), null);
  assert.strictEqual(validatePort(65536), null);
  assert.strictEqual(validatePort("abc"), null);
  assert.strictEqual(validatePort("99999"), null);
});

test("extractContractAddressFromUrl - 网页URL合约提取与校验", () => {
  // DexScreener Solana URL
  const dexSolUrl = "https://dexscreener.com/solana/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
  assert.strictEqual(extractContractAddressFromUrl(dexSolUrl), "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R");

  // DexScreener BSC EVM URL
  const dexBscUrl = "https://dexscreener.com/bsc/0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
  assert.strictEqual(extractContractAddressFromUrl(dexBscUrl), "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c");

  // Pump.fun URL
  const pumpUrl = "https://pump.fun/coin/7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
  assert.strictEqual(extractContractAddressFromUrl(pumpUrl), "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr");

  // GeckoTerminal URL
  const geckoUrl = "https://www.geckoterminal.com/solana/pools/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
  assert.strictEqual(extractContractAddressFromUrl(geckoUrl), "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R");

  // BscScan / Etherscan Token URL
  const bscScanUrl = "https://bscscan.com/token/0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
  assert.strictEqual(extractContractAddressFromUrl(bscScanUrl), "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c");
  const ethTokenUrl = "https://etherscan.io/token/0x55d398326f99059ff775485246999027b3197955";
  assert.strictEqual(extractContractAddressFromUrl(ethTokenUrl), "0x55d398326f99059ff775485246999027b3197955");

  // 交易哈希链接（Etherscan/BscScan tx 等 64位 hex）：绝不能被截断提取成假代币
  const ethTxUrl = "https://etherscan.io/tx/0x90f8bf944c659c253d8e107d6b50b076b92316bc3b42d80ceea30b93b5819d33";
  assert.strictEqual(extractContractAddressFromUrl(ethTxUrl), null, "Etherscan 交易链接不能被提取为代币合约");
  const bscTxUrl = "https://bscscan.com/tx/0x90f8bf944c659c253d8e107d6b50b076b92316bc3b42d80ceea30b93b5819d33";
  assert.strictEqual(extractContractAddressFromUrl(bscTxUrl), null, "BscScan 交易链接不能被提取为代币合约");

  // validateAndParseInput 直接支持粘贴 URL
  const parsed = validateAndParseInput(dexSolUrl);
  assert.strictEqual(parsed.error, undefined);
  assert.strictEqual(parsed.parsed?.type, "ALPHA_TOKEN");
  assert.strictEqual(parsed.parsed?.symbol, "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R");
  assert.strictEqual(parsed.parsed?.defaultGroup, "Alpha");

  // validateAndParseInput 对 Tx Hash 给出友好精准拦截提示
  const txParsed = validateAndParseInput(ethTxUrl);
  assert.ok(txParsed.error && txParsed.error.includes("Tx Hash"), "交易链接应明确提示为 Tx Hash");
  const rawTxHash = "0x90f8bf944c659c253d8e107d6b50b076b92316bc3b42d80ceea30b93b5819d33";
  const rawTxParsed = validateAndParseInput(rawTxHash);
  assert.ok(rawTxParsed.error && rawTxParsed.error.includes("Tx Hash"), "裸交易哈希应明确提示为 Tx Hash");
});

test("extractStatusBarQuotes - 状态栏总控与分板块开关精准过滤", () => {
  const sampleWatchlist = {
    "A股": [
      { symbol: "sh600519", name: "贵州茅台", type: "A_SHARE" },
      { symbol: "sz000001", name: "平安银行", type: "A_SHARE" },
    ],
    "港股": [
      { symbol: "hk00700", name: "腾讯控股", type: "HK_STOCK" },
    ],
    "美股": [
      { symbol: "AAPL", name: "Apple", type: "US_STOCK" },
    ],
    "Binance": [
      { symbol: "BTCUSDT", name: "Bitcoin", type: "CRYPTO" },
    ],
    "Alpha": [
      { symbol: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", name: "WBNB", type: "ALPHA_TOKEN" },
    ],
  };

  const cache = new Map<string, any>();
  cache.set("sh600519", { symbol: "sh600519", name: "贵州茅台", price: 1800, changePercent: 1.2 });
  cache.set("sz000001", { symbol: "sz000001", name: "平安银行", price: 12, changePercent: -0.5 });
  cache.set("hk700", { symbol: "hk00700", name: "腾讯控股", price: 380, changePercent: 2.1 });
  cache.set("aapl", { symbol: "AAPL", name: "Apple", price: 230, changePercent: 0.8 });
  cache.set("btcusdt", { symbol: "BTCUSDT", name: "Bitcoin", price: 65000, changePercent: 3.5 });
  cache.set("0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", { symbol: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", name: "WBNB", price: 580, changePercent: 4.0 });

  // 1. 全开启状态：返回所有 6 个标的
  const allOpen = extractStatusBarQuotes(sampleWatchlist, cache, {
    statusBarEnabled: true,
    aShare:  { enabled: true, statusBar: true },
    hkStock: { enabled: true, statusBar: true },
    usStock: { enabled: true, statusBar: true },
    binance: { enabled: true, statusBar: true },
    alpha:   { enabled: true, statusBar: true },
  });
  assert.strictEqual(allOpen.length, 6);

  // 2. 总控关闭：立即返回空数组
  const masterDisabled = extractStatusBarQuotes(sampleWatchlist, cache, {
    statusBarEnabled: false,
    aShare:  { enabled: true, statusBar: true },
    hkStock: { enabled: true, statusBar: true },
    usStock: { enabled: true, statusBar: true },
    binance: { enabled: true, statusBar: true },
    alpha:   { enabled: true, statusBar: true },
  });
  assert.strictEqual(masterDisabled.length, 0);

  // 3. 仅关闭 A 股轮播（用户报告的场景）：总控依然开启，A股标的退出，其余4个板块标的正常参与轮播
  const aShareOff = extractStatusBarQuotes(sampleWatchlist, cache, {
    statusBarEnabled: true,
    aShare:  { enabled: true, statusBar: false },
    hkStock: { enabled: true, statusBar: true },
    usStock: { enabled: true, statusBar: true },
    binance: { enabled: true, statusBar: true },
    alpha:   { enabled: true, statusBar: true },
  });
  assert.strictEqual(aShareOff.length, 4);
  assert.ok(!aShareOff.some(q => q.symbol === "sh600519" || q.symbol === "sz000001"));
  assert.ok(aShareOff.some(q => q.symbol === "hk00700"));
  assert.ok(aShareOff.some(q => q.symbol === "AAPL"));
  assert.ok(aShareOff.some(q => q.symbol === "BTCUSDT"));
  assert.ok(aShareOff.some(q => q.symbol === "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"));

  // 4. 所有分板块均关闭轮播：返回 0 条
  const allSubOff = extractStatusBarQuotes(sampleWatchlist, cache, {
    statusBarEnabled: true,
    aShare:  { enabled: true, statusBar: false },
    hkStock: { enabled: true, statusBar: false },
    usStock: { enabled: true, statusBar: false },
    binance: { enabled: true, statusBar: false },
    alpha:   { enabled: true, statusBar: false },
  });
  assert.strictEqual(allSubOff.length, 0);
});

test("computeStatusBarEnabled - 状态栏总控与分板块开关聚合判定", () => {
  // 1. 用户显式设置 statusBar.enabled: false，无论分板块如何开启，状态栏必须彻底关闭
  assert.strictEqual(computeStatusBarEnabled(false, true), false, "显式关闭总控时，即使有活跃板块也必须关闭");
  assert.strictEqual(computeStatusBarEnabled(false, false), false, "显式关闭总控时，无活跃板块也必须关闭");

  // 2. 用户显式设置 statusBar.enabled: true
  assert.strictEqual(computeStatusBarEnabled(true, true), true, "显式开启总控且有活跃板块时，状态栏开启");
  assert.strictEqual(computeStatusBarEnabled(true, false), false, "显式开启总控但无活跃板块时，状态栏关闭");

  // 3. 用户未显式配置（undefined，默认开启状态）
  assert.strictEqual(computeStatusBarEnabled(undefined, true), true, "未显式配置且有活跃板块时，状态栏默认开启");
  assert.strictEqual(computeStatusBarEnabled(undefined, false), false, "未显式配置但无活跃板块时，状态栏默认关闭");
});

test("AlertManager - 价格上限突破预警 (above > threshold)", () => {
  const manager = new AlertManager();
  const config: any = {
    alerts: {
      sh600519: { symbol: "sh600519", name: "贵州茅台", above: 1800, enabled: true },
    },
    alertNotificationMode: "notification",
    alertCooldownMinutes: 15,
  };

  const quotes: any[] = [
    { id: "sh600519", symbol: "sh600519", name: "贵州茅台", price: 1850, changePercent: 2.5 },
    { id: "sz000001", symbol: "sz000001", name: "平安银行", price: 12, changePercent: 0.5 },
  ];

  const events = manager.checkQuotes(quotes, config);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].symbolKey, "sh600519");
  assert.strictEqual(events[0].type, "above");
  assert.strictEqual(events[0].currentValue, 1850);
  assert.strictEqual(events[0].thresholdValue, 1800);

  // 未突破上限不触发
  manager.resetCooldown();
  const belowThresholdQuotes: any[] = [
    { id: "sh600519", symbol: "sh600519", name: "贵州茅台", price: 1799, changePercent: -0.5 },
  ];
  const noEvents = manager.checkQuotes(belowThresholdQuotes, config);
  assert.strictEqual(noEvents.length, 0);
});

test("AlertManager - 价格下限跌破预警 (below < threshold)", () => {
  const manager = new AlertManager();
  const config: any = {
    alerts: {
      btcusdt: { symbol: "BTCUSDT", name: "比特币", below: 60000, enabled: true },
    },
    alertNotificationMode: "notification",
    alertCooldownMinutes: 15,
  };

  const breachedQuotes: any[] = [
    { id: "BTCUSDT", symbol: "BTCUSDT", name: "比特币", price: 59500, changePercent: -3.2 },
  ];
  const events = manager.checkQuotes(breachedQuotes, config);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, "below");
  assert.strictEqual(events[0].currentValue, 59500);
  assert.strictEqual(events[0].thresholdValue, 60000);

  // 未跌破下限不触发
  manager.resetCooldown();
  const safeQuotes: any[] = [
    { id: "BTCUSDT", symbol: "BTCUSDT", name: "比特币", price: 60001, changePercent: 0.1 },
  ];
  const noEvents = manager.checkQuotes(safeQuotes, config);
  assert.strictEqual(noEvents.length, 0);
});

test("AlertManager - 单日剧烈涨跌幅绝对值预警 (|%| >= threshold)", () => {
  const manager = new AlertManager();
  const config: any = {
    alerts: {
      aapl: { symbol: "AAPL", name: "Apple", changePercent: 5.0, enabled: true },
    },
    alertNotificationMode: "notification",
    alertCooldownMinutes: 15,
  };

  // 剧烈上涨
  const rallyQuotes: any[] = [
    { id: "AAPL", symbol: "AAPL", name: "Apple", price: 200, changePercent: 6.2 },
  ];
  const rallyEvents = manager.checkQuotes(rallyQuotes, config);
  assert.strictEqual(rallyEvents.length, 1);
  assert.strictEqual(rallyEvents[0].type, "changePercent");
  assert.strictEqual(rallyEvents[0].currentValue, 6.2);

  // 剧烈暴跌 (| -7.5% | >= 5.0%)
  manager.resetCooldown();
  const crashQuotes: any[] = [
    { id: "AAPL", symbol: "AAPL", name: "Apple", price: 170, changePercent: -7.5 },
  ];
  const crashEvents = manager.checkQuotes(crashQuotes, config);
  assert.strictEqual(crashEvents.length, 1);
  assert.strictEqual(crashEvents[0].type, "changePercent");
  assert.strictEqual(crashEvents[0].currentValue, -7.5);

  // 正常波动不触发
  manager.resetCooldown();
  const normalQuotes: any[] = [
    { id: "AAPL", symbol: "AAPL", name: "Apple", price: 185, changePercent: 3.1 },
  ];
  const normalEvents = manager.checkQuotes(normalQuotes, config);
  assert.strictEqual(normalEvents.length, 0);
});

test("AlertManager - 冷却防轰炸机制与静音拦截", () => {
  const manager = new AlertManager();
  const config: any = {
    alerts: {
      sh600519: { symbol: "sh600519", name: "贵州茅台", above: 1800, enabled: true },
    },
    alertNotificationMode: "notification",
    alertCooldownMinutes: 15,
  };

  const quotes: any[] = [
    { id: "sh600519", symbol: "sh600519", name: "贵州茅台", price: 1850, changePercent: 2.5 },
  ];

  // 第一次触发
  const first = manager.checkQuotes(quotes, config);
  assert.strictEqual(first.length, 1);

  // 15分钟冷静期内再次检测同一标的：被内存冷却拦截，返回 0 条
  const second = manager.checkQuotes(quotes, config);
  assert.strictEqual(second.length, 0, "冷却期内应彻底静音拦截");

  // 手动重置冷却后，恢复触发
  manager.resetCooldown();
  const third = manager.checkQuotes(quotes, config);
  assert.strictEqual(third.length, 1, "重置冷却后恢复触发");

  // 手动设置静音
  manager.mute("sh600519", 15);
  const muted = manager.checkQuotes(quotes, config);
  assert.strictEqual(muted.length, 0, "手动静音后不触发");
});

test("AlertManager - 老板键激活状态一票否决与静音守卫", () => {
  let isBossActive = true;
  const mockStatusBar: any = {
    isBossKeyActive: () => isBossActive,
    flashAlert: () => {},
  };
  const manager = new AlertManager(mockStatusBar);
  const config: any = {
    alerts: {
      sh600519: { symbol: "sh600519", name: "贵州茅台", above: 1800, enabled: true },
    },
    alertNotificationMode: "both",
    alertCooldownMinutes: 15,
  };

  const quotes: any[] = [
    { id: "sh600519", symbol: "sh600519", name: "贵州茅台", price: 1900, changePercent: 5.0 },
  ];

  // 老板键激活时：一票否决，绝对静音
  const suppressed = manager.checkQuotes(quotes, config);
  assert.strictEqual(suppressed.length, 0, "老板键状态下必须完全禁止触发预警");

  // 老板键退出后：恢复正常监测
  isBossActive = false;
  const resumed = manager.checkQuotes(quotes, config);
  assert.strictEqual(resumed.length, 1, "老板键退出后正常响应");
});

test("AlertManager - 状态栏与通知通道联动分发", () => {
  let flashedText = "";
  const mockStatusBar: any = {
    isBossKeyActive: () => false,
    flashAlert: (text: string) => { flashedText = text; },
  };
  const manager = new AlertManager(mockStatusBar);

  // 1. 仅通知通道 (notification)：不闪烁状态栏
  const configNotification: any = {
    alerts: {
      sh600519: { symbol: "sh600519", name: "贵州茅台", above: 1800, enabled: true },
    },
    alertNotificationMode: "notification",
    alertCooldownMinutes: 15,
  };
  manager.checkQuotes([{ id: "sh600519", symbol: "sh600519", name: "贵州茅台", price: 1850, changePercent: 1.0 }], configNotification);
  assert.strictEqual(flashedText, "", "notification 模式下不应触发状态栏闪烁");

  // 2. 状态栏通道 (statusBarOnly)：触发状态栏闪烁
  manager.resetCooldown();
  const configStatusBarOnly: any = {
    ...configNotification,
    alertNotificationMode: "statusBarOnly",
  };
  manager.checkQuotes([{ id: "sh600519", symbol: "sh600519", name: "贵州茅台", price: 1850, changePercent: 1.0 }], configStatusBarOnly);
  assert.ok(flashedText.includes("突破预警") && flashedText.includes("贵州茅台"), "statusBarOnly 模式下必须调用 flashAlert");

  // 3. 模态脱敏模式 (maskMode)
  manager.resetCooldown();
  flashedText = "";
  const configMasked: any = {
    ...configNotification,
    alertNotificationMode: "statusBarOnly",
    maskMode: true,
  };
  manager.checkQuotes([{ id: "sh600519", symbol: "sh600519", name: "贵州茅台", price: 1850, changePercent: 1.0 }], configMasked);
  assert.ok(flashedText.includes("****"), "maskMode 开启时标的名称必须脱敏");
});

test("AlertManager - 禁用开关与空配置容错保护", () => {
  const manager = new AlertManager();

  // 规则被禁用 enabled: false
  const configDisabled: any = {
    alerts: {
      sh600519: { symbol: "sh600519", name: "贵州茅台", above: 1800, enabled: false },
    },
    alertNotificationMode: "notification",
    alertCooldownMinutes: 15,
  };
  const disabledEvents = manager.checkQuotes([{ id: "sh600519", symbol: "sh600519", name: "贵州茅台", price: 1900, changePercent: 2.0 }], configDisabled);
  assert.strictEqual(disabledEvents.length, 0, "enabled: false 规则不应被触发");

  // 空预警字典或空行情
  assert.strictEqual(manager.checkQuotes([], configDisabled).length, 0);
  assert.strictEqual(manager.checkQuotes([{ symbol: "sh600519" } as any], { alerts: {} } as any).length, 0);
});

test("AlertManager - 币对斜杠 (SOL/USDT vs SOLUSDT) 跨格式匹配预警", () => {
  const manager = new AlertManager();
  const config: any = {
    alerts: {
      solusdt: { symbol: "SOL/USDT", name: "SOL", below: 110, enabled: true },
    },
    alertNotificationMode: "notification",
    alertCooldownMinutes: 15,
  };

  const quotes: any[] = [
    { id: "SOLUSDT", symbol: "SOLUSDT", name: "SOL", price: 100, changePercent: -3.63 },
  ];

  const events = manager.checkQuotes(quotes, config);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, "below");
  assert.strictEqual(events[0].currentValue, 100);
});

test("resolveItemDisplayName - 侧边栏与设置面板标的名称一致性与优先级解析", () => {
  // 1. 用户显式配置自定义名称（如 usNET 配置为 Cloudflare），即便腾讯接口返回机器译名“科赋锐”，仍应锁定展示 Cloudflare
  const cfName = resolveItemDisplayName("Cloudflare", "usNET", { name: "科赋锐", symbol: "NET" });
  assert.strictEqual(cfName, "Cloudflare", "应优先使用用户配置的 Cloudflare");

  // 2. 指数全称（usIXIC 配置为 纳斯达克综合指数），即便接口缩写为“纳斯达克”，应保留全称
  const ixicName = resolveItemDisplayName("纳斯达克综合指数", "usIXIC", { name: "纳斯达克", symbol: "IXIC" });
  assert.strictEqual(ixicName, "纳斯达克综合指数", "应保留纳斯达克综合指数全称");

  // 3. 用户添加标的时未填名称或名称与代码相同（如 600030），行情到达后应智能使用接口标准名称（中信证券）
  const stockName = resolveItemDisplayName("600030", "600030", { name: "中信证券", symbol: "600030" });
  assert.strictEqual(stockName, "中信证券", "未自定义名称时应回退到实时行情标准名称");

  // 4. 用户给加密货币自定义昵称（BTCUSDT 备注为 大饼），应显示自定义昵称
  const btcCustom = resolveItemDisplayName("大饼", "BTCUSDT", { name: "BTC/USDT", symbol: "BTCUSDT" });
  assert.strictEqual(btcCustom, "大饼", "自定义币种昵称应生效");

  // 5. 标的名称为币对斜杠格式（BTC/USDT 与 BTCUSDT 属于同一标的），非自定义昵称，行情到达后使用 BTC/USDT
  const btcNormal = resolveItemDisplayName("BTC/USDT", "BTCUSDT", { name: "BTC/USDT", symbol: "BTCUSDT" });
  assert.strictEqual(btcNormal, "BTC/USDT", "标准币对格式正常使用");

  // 6. 行情未到达且无自定义名称时，兜底展示代码
  const fallbackSym = resolveItemDisplayName("000001", "000001", undefined);
  assert.strictEqual(fallbackSym, "000001", "行情未到达时兜底展示代码");
});

test("resolveTrendColors - 涨跌配色习惯切换 (greenUpRedDown vs redUpGreenDown) 与颜色脱敏", () => {
  // 1. 默认国际/加密/美股习惯：greenUpRedDown (绿涨红跌)
  const intlUp = resolveTrendColors(2.5, false, "greenUpRedDown");
  assert.strictEqual(intlUp.colorHint, "🟢", "国际惯例上涨应为绿色圆点");
  assert.strictEqual(intlUp.themeColor, "charts.green", "国际惯例上涨主题色应为 charts.green");
  assert.strictEqual(intlUp.isUp, true);

  const intlDown = resolveTrendColors(-1.8, false, "greenUpRedDown");
  assert.strictEqual(intlDown.colorHint, "🔴", "国际惯例下跌应为红色圆点");
  assert.strictEqual(intlDown.themeColor, "charts.red", "国际惯例下跌主题色应为 charts.red");
  assert.strictEqual(intlDown.isUp, false);

  const intlZero = resolveTrendColors(0, false, "greenUpRedDown");
  assert.strictEqual(intlZero.colorHint, "🟢", "平盘视为非负绿色");
  assert.strictEqual(intlZero.themeColor, "charts.green");

  // 2. 国内 A 股传统金融盘面习惯：redUpGreenDown (红涨绿跌)
  const cnUp = resolveTrendColors(5.0, false, "redUpGreenDown");
  assert.strictEqual(cnUp.colorHint, "🔴", "国内传统上涨应为红色圆点");
  assert.strictEqual(cnUp.themeColor, "charts.red", "国内传统上涨主题色应为 charts.red");
  assert.strictEqual(cnUp.isUp, true);

  const cnDown = resolveTrendColors(-3.2, false, "redUpGreenDown");
  assert.strictEqual(cnDown.colorHint, "🟢", "国内传统下跌应为绿色圆点");
  assert.strictEqual(cnDown.themeColor, "charts.green", "国内传统下跌主题色应为 charts.green");
  assert.strictEqual(cnDown.isUp, false);

  const cnZero = resolveTrendColors(0, false, "redUpGreenDown");
  assert.strictEqual(cnZero.colorHint, "🔴", "平盘视为非负红色");
  assert.strictEqual(cnZero.themeColor, "charts.red");

  // 3. 颜色脱敏模式：colorNeutral 为 true 时，不暴露红绿
  const neutralUp = resolveTrendColors(4.0, true, "redUpGreenDown");
  assert.strictEqual(neutralUp.colorHint, "•", "脱敏模式应返回中性点号");
  assert.strictEqual(neutralUp.themeColor, undefined, "脱敏模式无主题色，使用编辑器默认前景文本色");

  const neutralDown = resolveTrendColors(-4.0, true, "greenUpRedDown");
  assert.strictEqual(neutralDown.colorHint, "•", "脱敏模式应返回中性点号");
  assert.strictEqual(neutralDown.themeColor, undefined, "脱敏模式无主题色");
});

test("marketHours - 节假日离线日历与休市精准判定", () => {
  // 1. A股法定休市日拦截（2026国庆节周四 10:00，非周末，通常为交易时段）
  const aNationalDayUtc = new Date("2026-10-01T02:00:00Z"); // 北京时间 2026-10-01 10:00
  assert.strictEqual(isAShareHoliday(aNationalDayUtc), true, "2026-10-01 应被识别为 A 股国庆休市日");
  assert.strictEqual(isAShareMarketOpen(aNationalDayUtc), false, "A股国庆法定休市日应一票否决判定为闭市");

  // A股春节（2026-02-18 周三 10:00）
  const aSpringFestivalUtc = new Date("2026-02-18T02:00:00Z"); // 北京时间 2026-02-18 10:00
  assert.strictEqual(isAShareHoliday(aSpringFestivalUtc), true, "2026-02-18 应为 A 股春节休市日");
  assert.strictEqual(isAShareMarketOpen(aSpringFestivalUtc), false, "春节休市日应判定为闭市");

  // 普通交易日（2026-09-07 周一 10:00）
  const aNormalDayUtc = new Date("2026-09-07T02:00:00Z");
  assert.strictEqual(isAShareHoliday(aNormalDayUtc), false, "普通工作日不应误判为休市");
  assert.strictEqual(isAShareMarketOpen(aNormalDayUtc), true);

  // 2. 港股休市日拦截（2026耶稣受难节 2026-04-03 周五 10:00）
  const hkGoodFridayUtc = new Date("2026-04-03T02:00:00Z");
  assert.strictEqual(isHKHoliday(hkGoodFridayUtc), true, "2026-04-03 应为港股受难节休市日");
  assert.strictEqual(isHKMarketOpen(hkGoodFridayUtc), false, "港股节假日应判定为闭市");

  // 3. 美股休市日拦截（2026圣诞节 2026-12-25 周五美东 10:30）
  const usChristmasUtc = new Date("2026-12-25T15:30:00Z"); // 冬令时 UTC 15:30 -> NY 10:30
  assert.strictEqual(isUSHoliday(usChristmasUtc), true, "2026-12-25 应为美股圣诞休市日");
  assert.strictEqual(isUSMarketOpen(usChristmasUtc), false, "美股圣诞节应一票否决判定为闭市");

  // 美股马丁路德金日（2026-01-19 周一美东 10:30）
  const usMlkUtc = new Date("2026-01-19T15:30:00Z");
  assert.strictEqual(isUSHoliday(usMlkUtc), true, "2026-01-19 应为美股马丁路德金日");
  assert.strictEqual(isUSMarketOpen(usMlkUtc), false);
});

test("evaluateAdaptiveThrottle - 休市与无行情变动自适应降频评估", () => {
  const normalTradingUtc = new Date("2026-09-07T02:00:00Z"); // A股开盘
  const holidayUtc = new Date("2026-10-01T02:00:00Z"); // 国庆休市

  // 1. 股票市场开市期间：维持标准高频，不降频
  const r1 = evaluateAdaptiveThrottle({
    aShareEnabled: true,
    hkStockEnabled: false,
    usStockEnabled: false,
    has24HourCrypto: false,
    hasPriceChanged: false,
    consecutiveUnchangedCount: 1,
    now: normalTradingUtc,
  });
  assert.strictEqual(r1.isThrottled, false, "开市期间应维持高频");
  assert.strictEqual(r1.consecutiveUnchangedCount, 2);

  // 2. 纯股票标的，在节假日休市：检测到休市且无变动，立即降频
  const r2 = evaluateAdaptiveThrottle({
    aShareEnabled: true,
    hkStockEnabled: false,
    usStockEnabled: false,
    has24HourCrypto: false,
    hasPriceChanged: false,
    consecutiveUnchangedCount: 0,
    now: holidayUtc,
  });
  assert.strictEqual(r2.isThrottled, true, "节假日休市纯股票持仓应立即激活降频");
  assert.strictEqual(r2.consecutiveUnchangedCount, 1);

  // 3. 包含 24/7 加密资产：在股市休市期间，前 2 次无变动不降频，连续第 3 次无变动触发降频节能
  let cryptoThrottle = evaluateAdaptiveThrottle({
    aShareEnabled: true,
    hkStockEnabled: false,
    usStockEnabled: false,
    has24HourCrypto: true,
    hasPriceChanged: false,
    consecutiveUnchangedCount: 1,
    now: holidayUtc,
  });
  assert.strictEqual(cryptoThrottle.isThrottled, false, "加密资产第2次无变动暂不降频");
  assert.strictEqual(cryptoThrottle.consecutiveUnchangedCount, 2);

  cryptoThrottle = evaluateAdaptiveThrottle({
    aShareEnabled: true,
    hkStockEnabled: false,
    usStockEnabled: false,
    has24HourCrypto: true,
    hasPriceChanged: false,
    consecutiveUnchangedCount: 2,
    now: holidayUtc,
  });
  assert.strictEqual(cryptoThrottle.isThrottled, true, "连续3次无变动应自适应降频至 60s");
  assert.strictEqual(cryptoThrottle.consecutiveUnchangedCount, 3);

  // 4. 一旦行情发生价格波动：立即恢复标准高频并重置计数
  const rPriceChange = evaluateAdaptiveThrottle({
    aShareEnabled: true,
    hkStockEnabled: false,
    usStockEnabled: false,
    has24HourCrypto: true,
    hasPriceChanged: true,
    consecutiveUnchangedCount: 3,
    now: holidayUtc,
  });
  assert.strictEqual(rPriceChange.isThrottled, false, "价格波动应立即解除降频");
  assert.strictEqual(rPriceChange.consecutiveUnchangedCount, 0, "计数器归零");
});

test("chunkArray - 大批量标的切片保护与边界分块校验", () => {
  // 1. 空数组或非法大小容错
  assert.deepStrictEqual(chunkArray([], 40), []);
  assert.deepStrictEqual(chunkArray(["a"], 0), []);
  assert.deepStrictEqual(chunkArray(["a"], -1), []);

  // 2. 数量小于切片大小时单批返回
  const small = ["sh600519", "sz000001", "hk00700"];
  assert.deepStrictEqual(chunkArray(small, 40), [small]);

  // 3. 数量刚好整除
  const exact80 = Array.from({ length: 80 }, (_, i) => `s${i}`);
  const chunks80 = chunkArray(exact80, 40);
  assert.strictEqual(chunks80.length, 2);
  assert.strictEqual(chunks80[0].length, 40);
  assert.strictEqual(chunks80[1].length, 40);

  // 4. 数量有余数（如 95 个标的切片为 40 + 40 + 15）
  const items95 = Array.from({ length: 95 }, (_, i) => `s${i}`);
  const chunks95 = chunkArray(items95, 40);
  assert.strictEqual(chunks95.length, 3);
  assert.strictEqual(chunks95[0].length, 40);
  assert.strictEqual(chunks95[1].length, 40);
  assert.strictEqual(chunks95[2].length, 15);
  assert.deepStrictEqual(chunks95.flat(), items95);
});

test("decodeGbk - 原生零依赖 GBK 解码与多级容错兜底", () => {
  // 1. 标准 ASCII 腾讯数据流解析（最关键的行情数字/符号验证）
  const asciiData = 'v_sh600519="1~Moutai~600519~1700.50~1680.00~1690.00~1000~...~";';
  const asciiBuf = Buffer.from(asciiData, "utf-8");
  assert.strictEqual(decodeGbk(asciiBuf), asciiData);

  // 2. 支持 ArrayBuffer 与 Uint8Array
  const u8Array = new Uint8Array(asciiBuf);
  assert.strictEqual(decodeGbk(u8Array), asciiData);
  assert.strictEqual(decodeGbk(u8Array.buffer), asciiData);

  // 3. 空 Buffer 边界防护
  assert.strictEqual(decodeGbk(new Uint8Array(0)), "");

  // 4. GBK 编码中文字符（Node.js full-icu 环境测试）
  const gbkDecoder = new TextDecoder("gbk");
  if (gbkDecoder.encoding === "gbk") {
    // 模拟一段 GBK 字节流
    const gbkBytes = new Uint8Array([
      118, 95, 115, 104, 54, 48, 48, 53, 49, 57, 61, 34, 49, 126, // v_sh600519="1~
      0xb9, 0xf3, 0xd4, 0xdd, 0xc3, 0xa9, 0xcc, 0xa8,
      126, 54, 48, 48, 53, 49, 57, 126, 49, 55, 48, 48, 46, 48, 48, 126, 34, 59 // ~600519~1700.00~";
    ]);
    const decoded = decodeGbk(gbkBytes);
    // 验证核心 ASCII 股票代码与数值未损坏
    assert.ok(decoded.includes("600519"));
    assert.ok(decoded.includes("1700.00"));
  }
});

test("inferAShareExchange - A股交易所前缀精确推断（修复 ETF/债券/深B 被误判为北交所）", () => {
  // ── 1. 沪市：5xxxxx 基金/ETF、6xxxxx 股票、9xxxxx B股 ──
  assert.strictEqual(inferAShareExchange("600519"), "sh"); // 贵州茅台
  assert.strictEqual(inferAShareExchange("601318"), "sh"); // 中国平安
  assert.strictEqual(inferAShareExchange("603686"), "sh"); // 福龙马
  assert.strictEqual(inferAShareExchange("688981"), "sh"); // 中芯国际(科创板)
  assert.strictEqual(inferAShareExchange("510300"), "sh"); // 沪深300ETF
  assert.strictEqual(inferAShareExchange("512880"), "sh"); // 证券ETF
  assert.strictEqual(inferAShareExchange("900901"), "sh"); // 沪市B股

  // ── 2. 深市：0xxxxx 股票、3xxxxx 创业板、1xxxxx 债/基金、2xxxxx B股 ──
  assert.strictEqual(inferAShareExchange("000001"), "sz"); // 平安银行
  assert.strictEqual(inferAShareExchange("002385"), "sz"); // 大北农
  assert.strictEqual(inferAShareExchange("300750"), "sz"); // 宁德时代
  assert.strictEqual(inferAShareExchange("159915"), "sz"); // 创业板ETF（旧逻辑误判为 bj）
  assert.strictEqual(inferAShareExchange("159919"), "sz"); // 沪深300ETF(深)
  assert.strictEqual(inferAShareExchange("200011"), "sz"); // 深市B股（旧逻辑误判为 bj）

  // ── 3. 北交所：43/83/87/88/92 开头 ──
  assert.strictEqual(inferAShareExchange("430047"), "bj");
  assert.strictEqual(inferAShareExchange("830799"), "bj");
  assert.strictEqual(inferAShareExchange("871981"), "bj");
  assert.strictEqual(inferAShareExchange("920002"), "bj");

  // ── 4. 可转债与债券：明确段位优先于首位兜底 ──
  assert.strictEqual(inferAShareExchange("113050"), "sh"); // 沪市可转债
  assert.strictEqual(inferAShareExchange("110043"), "sh"); // 沪市可转债
  assert.strictEqual(inferAShareExchange("123456"), "sz"); // 深市可转债
  assert.strictEqual(inferAShareExchange("127045"), "sz"); // 深市可转债
  assert.strictEqual(inferAShareExchange("128145"), "sz"); // 深市可转债

  // ── 5. 边界与非 6 位输入兜底 ──
  assert.strictEqual(inferAShareExchange(""), "sh");
  assert.strictEqual(inferAShareExchange("60051"), "sh");
  assert.strictEqual(inferAShareExchange("6005199"), "sh");
});

test("normalizeAShareCode - 输入解析端与行情抓取端前缀规则绝对一致", () => {
  // 已带前缀：原样返回，不做二次推断
  assert.strictEqual(normalizeAShareCode("sh600519"), "sh600519");
  assert.strictEqual(normalizeAShareCode("sz159915"), "sz159915");
  assert.strictEqual(normalizeAShareCode("bj830799"), "bj830799");
  assert.strictEqual(normalizeAShareCode("SH600519"), "sh600519");

  // 裸 6 位代码：按代码段补齐正确交易所
  assert.strictEqual(normalizeAShareCode("600519"), "sh600519");
  assert.strictEqual(normalizeAShareCode("000001"), "sz000001");
  assert.strictEqual(normalizeAShareCode("510300"), "sh510300");
  assert.strictEqual(normalizeAShareCode("159915"), "sz159915");
  assert.strictEqual(normalizeAShareCode("200011"), "sz200011");
  assert.strictEqual(normalizeAShareCode("830799"), "bj830799");

  // 非标准位数：保持历史兜底语义
  assert.strictEqual(normalizeAShareCode("60051"), "sh60051");
  assert.strictEqual(normalizeAShareCode("001"), "sz001");
});

test("validateAndParseInput - ETF/债券代码端到端前缀正确（P0 回归守卫）", () => {
  // 用户直接输入裸 6 位 ETF / 债券代码，必须落到正确交易所
  assert.strictEqual(validateAndParseInput("159915").parsed?.symbol, "sz159915");
  assert.strictEqual(validateAndParseInput("510300").parsed?.symbol, "sh510300");
  assert.strictEqual(validateAndParseInput("200011").parsed?.symbol, "sz200011");
  assert.strictEqual(validateAndParseInput("113050").parsed?.symbol, "sh113050");
  assert.strictEqual(validateAndParseInput("830799").parsed?.symbol, "bj830799");

  // 上述标的均应被识别为 A 股并归入 A股 分组
  for (const code of ["159915", "510300", "200011", "113050", "830799"]) {
    const res = validateAndParseInput(code);
    assert.strictEqual(res.parsed?.type, "A_SHARE", `${code} 应识别为 A_SHARE`);
    assert.strictEqual(res.parsed?.defaultGroup, "A股", `${code} 应归入 A股 分组`);
  }

  // 用户显式带前缀时，尊重用户输入，不覆盖
  assert.strictEqual(validateAndParseInput("sh600519").parsed?.symbol, "sh600519");
  assert.strictEqual(validateAndParseInput("sz000001").parsed?.symbol, "sz000001");

  // 解析出的 A 股代码再经抓取端规范化，结果必须保持幂等（两端零漂移）
  for (const code of ["159915", "510300", "200011", "113050", "830799", "600519", "000001"]) {
    const parsed = validateAndParseInput(code).parsed!.symbol;
    assert.strictEqual(normalizeAShareCode(parsed), parsed, `${code} 解析与抓取端前缀应完全一致`);
  }
});

test("DexScreenerService - Alpha 无效/已下架合约地址抑制黑名单机制", async () => {
  const service = new DexScreenerService();
  const deadAddr = "0x000000000000000000000000000000000000dead";

  // 1. 初始状态未被抑制
  assert.strictEqual(service.isAddressSuppressed(deadAddr), false);

  // 2. 标记失效后进入抑制状态（大小写不敏感）
  (service as any).markAddressInvalid(deadAddr);
  assert.strictEqual(service.isAddressSuppressed(deadAddr), true);
  assert.strictEqual(service.isAddressSuppressed(deadAddr.toUpperCase()), true);

  // 3. 处于抑制期内，fetchQuotes 自动短路跳过，不发起任何网络请求，直接返回空数组
  const res = await service.fetchQuotes([deadAddr]);
  assert.deepStrictEqual(res, []);

  // 4. 清理缓存后抑制解除
  service.clearInvalidCache();
  assert.strictEqual(service.isAddressSuppressed(deadAddr), false);

  // 5. 模拟两轮连续返回空（无流动性池）触发自动抑制机制
  let networkCalls = 0;
  (service as any).fetchBatch = async () => {
    networkCalls++;
    return { items: [], networkError: false };
  };

  // 第 1 轮：batch (1) + fallback (1) = 2 calls
  await service.fetchQuotes([deadAddr]);
  assert.strictEqual(service.isAddressSuppressed(deadAddr), false, "第 1 轮失败尚不进入黑名单");

  // 第 2 轮：batch (1) + fallback (1) = 2 calls -> 达到阈值自动进入黑名单
  await service.fetchQuotes([deadAddr]);
  assert.strictEqual(service.isAddressSuppressed(deadAddr), true, "连续 2 轮确认无流动性池后自动进入抑制黑名单");

  // 第 3 轮：被黑名单拦截，networkCalls 计数不再增加
  const callsBefore = networkCalls;
  await service.fetchQuotes([deadAddr]);
  assert.strictEqual(networkCalls, callsBefore, "处于抑制期内的坏地址完全不再打网");
});

test("Tencent行情解析 - A股/港股/美股 Golden Sample 契约测试与三角数学自洽自愈", () => {
  // ── 1. A 股 Golden Sample 契约解析测试 ──────────────────────────────
  const aService = new AShareService();
  // 模拟标准 50 字段腾讯 A 股报文（以茅台为例）
  const aShareRaw =
    'v_sh600519="1~贵州茅台~600519~1800.00~1780.00~1790.00~25000~13000~12000~1799.00~10~1798.00~20~1797.00~30~1796.00~40~1795.00~50~1801.00~15~1802.00~25~1803.00~35~1804.00~45~1805.00~55~15:00:00/1800.00/25000/S/45000000/1234|~20260915150000~20.00~1.12~1815.00~1785.00~1800.00/25000/45000000~25000~45000~0.85~32.50~~1815.00~1785.00~1.69~22610.00~22610.00~11.50~1958.00~1602.00~0.55";';
  const aItems = aService.parseResponse(aShareRaw);
  assert.strictEqual(aItems.length, 1);
  const a0 = aItems[0];
  assert.strictEqual(a0.id, "sh600519");
  assert.strictEqual(a0.name, "贵州茅台");
  assert.strictEqual(a0.symbol, "600519");
  assert.strictEqual(a0.type, "A_SHARE");
  assert.strictEqual(a0.price, 1800.00);
  assert.strictEqual(a0.prevClose, 1780.00);
  assert.strictEqual(a0.open, 1790.00);
  assert.strictEqual(a0.high, 1815.00);
  assert.strictEqual(a0.low, 1785.00);
  assert.strictEqual(a0.change, 20.00);
  assert.strictEqual(a0.changePercent, 1.12);
  assert.strictEqual(a0.volume, 2500000); // 25000 手 × 100
  assert.strictEqual(a0.turnover, 450000000); // 45000 万元 × 10000
  assert.strictEqual(a0.currency, "CNY");

  // 模拟 A 股字段位移（F.CHANGE_AMT 变为 99999.00 离奇错值），验证三角数学自愈机制
  const aShareShifted =
    'v_sh600519="1~贵州茅台~600519~1800.00~1780.00~1790.00~25000~13000~12000~1799.00~10~1798.00~20~1797.00~30~1796.00~40~1795.00~50~1801.00~15~1802.00~25~1803.00~35~1804.00~45~1805.00~55~15:00:00/1800.00/25000/S/45000000/1234|~20260915150000~99999.00~888.88~1815.00~1785.00~1800.00/25000/45000000~25000~45000~0.85~32.50~~1815.00~1785.00~1.69~22610.00~22610.00~11.50~1958.00~1602.00~0.55";';
  const aHealedItems = aService.parseResponse(aShareShifted);
  assert.strictEqual(aHealedItems.length, 1);
  // 必须自愈为正确的 1800 - 1780 = 20.00 与 1.12%
  assert.strictEqual(aHealedItems[0].change, 20.00);
  assert.strictEqual(aHealedItems[0].changePercent, 1.12);

  // ── 2. 港股 Golden Sample 契约解析测试 ──────────────────────────────
  const hkService = new HKStockService();
  const hkF = new Array(50).fill("0");
  hkF[0] = "100";
  hkF[1] = "腾讯控股";
  hkF[2] = "00700";
  hkF[3] = "380.20";
  hkF[4] = "375.00";
  hkF[5] = "376.00";
  hkF[6] = "15200000";
  hkF[30] = "2026/09/15 16:08:24";
  hkF[31] = "5.20";
  hkF[32] = "1.39";
  hkF[33] = "382.00";
  hkF[34] = "375.20";
  hkF[37] = "5779040000";
  const hkRaw = `v_hk00700="${hkF.join("~")}";`;
  const hkItems = hkService.parseResponse(hkRaw);
  assert.strictEqual(hkItems.length, 1);
  const hk0 = hkItems[0];
  assert.strictEqual(hk0.id, "hk00700");
  assert.strictEqual(hk0.name, "腾讯控股");
  assert.strictEqual(hk0.symbol, "00700");
  assert.strictEqual(hk0.type, "HK_STOCK");
  assert.strictEqual(hk0.price, 380.20);
  assert.strictEqual(hk0.prevClose, 375.00);
  assert.strictEqual(hk0.change, 5.20);
  assert.strictEqual(hk0.changePercent, 1.39);
  assert.strictEqual(hk0.high, 382.00);
  assert.strictEqual(hk0.low, 375.20);
  assert.strictEqual(hk0.turnover, 5779040000);
  assert.strictEqual(hk0.currency, "HKD");

  // 港股字段缺失空值容错
  hkF[31] = "";
  hkF[32] = "0";
  const hkEmptyChange = `v_hk00700="${hkF.join("~")}";`;
  const hkHealed = hkService.parseResponse(hkEmptyChange);
  assert.strictEqual(hkHealed[0].change, 5.20);
  assert.strictEqual(hkHealed[0].changePercent, 1.39);

  // ── 3. 美股 Golden Sample 契约解析测试 ──────────────────────────────
  const usService = new USStockService();
  const usF = new Array(50).fill("0");
  usF[0] = "200";
  usF[1] = "Apple Inc";
  usF[2] = "AAPL.OQ";
  usF[3] = "230.50";
  usF[4] = "225.00";
  usF[5] = "226.00";
  usF[6] = "45000000";
  usF[30] = "2026-09-15 16:00:01";
  usF[31] = "5.50";
  usF[32] = "2.44";
  usF[33] = "232.00";
  usF[34] = "225.50";
  usF[37] = "10372500000";
  const usRaw = `v_usAAPL="${usF.join("~")}";`;
  const usItems = usService.parseResponse(usRaw);
  assert.strictEqual(usItems.length, 1);
  const us0 = usItems[0];
  assert.strictEqual(us0.id, "usAAPL");
  assert.strictEqual(us0.name, "Apple Inc");
  assert.strictEqual(us0.symbol, "AAPL"); // 必须成功剥离后缀 .OQ
  assert.strictEqual(us0.type, "US_STOCK");
  assert.strictEqual(us0.price, 230.50);
  assert.strictEqual(us0.prevClose, 225.00);
  assert.strictEqual(us0.change, 5.50);
  assert.strictEqual(us0.changePercent, 2.44);
  assert.strictEqual(us0.high, 232.00);
  assert.strictEqual(us0.low, 225.50);
  assert.strictEqual(us0.turnover, 10372500000);
  assert.strictEqual(us0.currency, "USD");

  // 美股字段错位自愈测试
  usF[31] = "-999.00";
  usF[32] = "-50.00";
  const usShifted = `v_usAAPL="${usF.join("~")}";`;
  const usHealed = usService.parseResponse(usShifted);
  assert.strictEqual(usHealed[0].change, 5.50);
  assert.strictEqual(usHealed[0].changePercent, 2.44);
});

test("escapeHtml - Webview 预警矩阵与 HTML 转义防御校验 (CWE-79)", () => {
  // 基础特殊字符转义
  assert.strictEqual(escapeHtml('<script>alert("xss")</script>'), "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  assert.strictEqual(escapeHtml("Tom & Jerry's \"Token\""), "Tom &amp; Jerry&#39;s &quot;Token&quot;");
  assert.strictEqual(escapeHtml(null), "");
  assert.strictEqual(escapeHtml(undefined), "");
  assert.strictEqual(escapeHtml(123.45), "123.45");

  // 属性双引号逃逸防御（恶意代币名称注入样式与标签）
  const maliciousTokenName = 'DEX" style="position:fixed;top:0" data-fake="';
  const escaped = escapeHtml(maliciousTokenName);
  assert.strictEqual(escaped.includes('"'), false);
  assert.strictEqual(escaped.includes("&quot;"), true);

  // 标签注入防御（图片外链与内联事件）
  const maliciousImg = '<img src="https://attacker.com/x" onerror="alert(1)">';
  const escapedImg = escapeHtml(maliciousImg);
  assert.strictEqual(escapedImg.includes("<"), false);
  assert.strictEqual(escapedImg.includes(">"), false);
  assert.strictEqual(escapedImg, "&lt;img src=&quot;https://attacker.com/x&quot; onerror=&quot;alert(1)&quot;&gt;");
});

test("BinanceService - 币安代码归一化、展示名格式化、报文解析与失效抑制黑名单", () => {
  const service = new BinanceService();

  // 1. 代码归一化与前缀处理
  assert.strictEqual(service.normalizeSymbol("btc/usdt"), "BTCUSDT");
  assert.strictEqual(service.normalizeSymbol("eth_usdt"), "ETHUSDT");
  assert.strictEqual(service.normalizeSymbol("sol-usdc"), "SOLUSDC");
  assert.strictEqual(service.normalizeSymbol("DOGEUSDT"), "DOGEUSDT");

  // 2. 展示名称格式化
  assert.strictEqual(service.formatDisplayName("BTCUSDT"), "BTC/USDT");
  assert.strictEqual(service.formatDisplayName("ETHUSDC"), "ETH/USDC");
  assert.strictEqual(service.formatDisplayName("SOLFDUSD"), "SOL/FDUSD");
  assert.strictEqual(service.formatDisplayName("DOGE"), "DOGE");

  // 3. 报文解析 (Golden Sample)
  const goldenSample = {
    symbol: "BTCUSDT",
    priceChange: "1250.50",
    priceChangePercent: "1.95",
    lastPrice: "65432.10",
    openPrice: "64181.60",
    highPrice: "66000.00",
    lowPrice: "64000.00",
    prevClosePrice: "64181.60",
    volume: "12345.678",
    quoteVolume: "807800000.50",
  };

  const parsed = service.parseTickerItem(goldenSample);
  assert.strictEqual(parsed.id, "BTCUSDT");
  assert.strictEqual(parsed.symbol, "BTCUSDT");
  assert.strictEqual(parsed.name, "BTC/USDT");
  assert.strictEqual(parsed.type, "CRYPTO");
  assert.strictEqual(parsed.price, 65432.10);
  assert.strictEqual(parsed.changePercent, 1.95);
  assert.strictEqual(parsed.open, 64181.60);
  assert.strictEqual(parsed.prevClose, 64181.60);
  assert.strictEqual(parsed.high, 66000.00);
  assert.strictEqual(parsed.low, 64000.00);
  assert.strictEqual(parsed.change, 1250.50);
  assert.strictEqual(parsed.volume, 12345.678);
  assert.strictEqual(parsed.turnover, 807800000.50);
  assert.strictEqual(parsed.currency, "USD");

  // 4. 失效抑制黑名单与复位
  assert.strictEqual(service.isSymbolSuppressed("INVALIDCOIN"), false);
  service.markSymbolInvalidForTest("INVALIDCOIN");
  assert.strictEqual(service.isSymbolSuppressed("INVALIDCOIN"), true);
  service.clearInvalidCache();
  assert.strictEqual(service.isSymbolSuppressed("INVALIDCOIN"), false);
});

test("shouldSkipMarketPolling - 闭市跳过轮询 5 维决策矩阵边界测试", () => {
  // 1. 满足全部 5 项条件：开启闭市停止 + 闭市中 + 已拉取过首轮 + 非强制刷新 + 非单组刷新 => 允许跳过
  assert.strictEqual(
    shouldSkipMarketPolling({
      stopOnMarketClosed: true,
      isMarketOpen: false,
      hasLoadedInitialQuotes: true,
      forceAll: false,
      specificGroupName: undefined,
    }),
    true
  );

  // 2. 开市时段 (isMarketOpen: true) => 绝不跳过
  assert.strictEqual(
    shouldSkipMarketPolling({
      stopOnMarketClosed: true,
      isMarketOpen: true,
      hasLoadedInitialQuotes: true,
      forceAll: false,
    }),
    false
  );

  // 3. 用户关闭了「闭市时停止轮询」配置项 (stopOnMarketClosed: false) => 绝不跳过
  assert.strictEqual(
    shouldSkipMarketPolling({
      stopOnMarketClosed: false,
      isMarketOpen: false,
      hasLoadedInitialQuotes: true,
      forceAll: false,
    }),
    false
  );

  // 4. 冷启动阶段首次拉取 (hasLoadedInitialQuotes: false) => 绝不跳过（必须拉取收盘价填充盘面）
  assert.strictEqual(
    shouldSkipMarketPolling({
      stopOnMarketClosed: true,
      isMarketOpen: false,
      hasLoadedInitialQuotes: false,
      forceAll: false,
    }),
    false
  );

  // 5. 用户触发全局强制刷新 (forceAll: true) => 绝不跳过
  assert.strictEqual(
    shouldSkipMarketPolling({
      stopOnMarketClosed: true,
      isMarketOpen: false,
      hasLoadedInitialQuotes: true,
      forceAll: true,
    }),
    false
  );

  // 6. 用户触发指定分组定向刷新 (specificGroupName: "A股") => 绝不跳过
  assert.strictEqual(
    shouldSkipMarketPolling({
      stopOnMarketClosed: true,
      isMarketOpen: false,
      hasLoadedInitialQuotes: true,
      forceAll: false,
      specificGroupName: "A股",
    }),
    false
  );
});

test("Active-Set Prune 内存基准与堆内存稳定性测试", () => {
  const quoteCache = new Map<string, any>();
  const initialHeap = process.memoryUsage().heapUsed;

  // 模拟 1000 轮高频自选变动与缓存注入
  for (let i = 0; i < 1000; i++) {
    const activeSymbols = [`sym_${i % 10}`, `sym_${(i + 1) % 10}`];
    const dummyWatchlist = {
      "动态测试组": activeSymbols.map((s) => ({ symbol: s, name: `标的_${s}` })),
    };

    // 注入当前轮次新行情 + 混入已被删除的孤儿历史标的
    quoteCache.set(`sym_${i % 10}`, { price: 100 + i, symbol: `sym_${i % 10}` });
    quoteCache.set(`sym_${(i + 1) % 10}`, { price: 200 + i, symbol: `sym_${(i + 1) % 10}` });
    quoteCache.set(`orphan_dead_${i}`, { price: 999, symbol: `orphan_dead_${i}` });

    // 执行活跃集对齐与死缓存回收
    pruneQuoteCache(dummyWatchlist, quoteCache);

    // 断言活跃集中仅保留当前有效标的与其标准 Key
    assert.ok(quoteCache.size <= 4, `缓存大小应严格受控 (当前: ${quoteCache.size})`);
    assert.strictEqual(quoteCache.has(`orphan_dead_${i}`), false);
  }

  const finalHeap = process.memoryUsage().heapUsed;
  const heapDeltaMB = (finalHeap - initialHeap) / 1024 / 1024;

  // 1000 次循环后增量堆内存应严格低于 10MB（通常近乎 0 增量）
  assert.ok(heapDeltaMB < 10, `循环后堆内存增量过大: ${heapDeltaMB.toFixed(2)} MB`);
});



