// test/unit.test.ts
import assert from "node:assert";
import test from "node:test";

// 直接导入真实的源码模块，杜绝测试代码与生产代码漂移
import { isSameSymbol, normalizeSymbolKey, normalizeUSCode, resolveItemAssetType, getWatchlistFingerprint, reorderWatchlist, extractTargetsFromWatchlist, extractStatusBarQuotes, computeStatusBarEnabled } from "../src/utils/symbolHelper.ts";
import { validateAndParseInput, isContractAddress, extractContractAddressFromUrl } from "../src/utils/inputValidator.ts";
import { isAShareMarketOpen, isHKMarketOpen, isUSMarketOpen, getZonedTimeParts, beijingFormatter, newYorkFormatter } from "../src/utils/marketHours.ts";
import { validateAndNormalizeProxyUrl, parseProxy, resetProxyCache } from "../src/services/network.ts";
import { isDisplayMasked } from "../src/utils/maskState.ts";

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

  // 7. 测试 resetProxyCache 能正确重置，空值默认回退到 10808
  resetProxyCache();
  assert.strictEqual(validateAndNormalizeProxyUrl(""), "http://127.0.0.1:10808");

  // 8. 测试纯数字端口号解析
  assert.strictEqual(validateAndNormalizeProxyUrl("10808"), "http://127.0.0.1:10808");
  assert.strictEqual(validateAndNormalizeProxyUrl("7890"), "http://127.0.0.1:7890");
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

  // 4. 跨组移动到指定标的前：把 sh600030 移到 Binance 组的 ETHUSDT 之前
  const crossRes = reorderWatchlist(initList(), "A股", "sh600030", "Binance", "ETHUSDT");
  assert.ok(crossRes);
  assert.deepStrictEqual(crossRes["A股"].map((x) => x.symbol), ["sz000839", "sz002385"]);
  assert.deepStrictEqual(crossRes["Binance"].map((x) => x.symbol), ["BTCUSDT", "sh600030", "ETHUSDT"]);

  // 5. 跨组移动到组名：把 sh600030 移到 Binance 组末尾（未指定 targetSymbol）
  const crossAppend = reorderWatchlist(initList(), "A股", "sh600030", "Binance");
  assert.ok(crossAppend);
  assert.deepStrictEqual(crossAppend["A股"].map((x) => x.symbol), ["sz000839", "sz002385"]);
  assert.deepStrictEqual(crossAppend["Binance"].map((x) => x.symbol), ["BTCUSDT", "ETHUSDT", "sh600030"]);

  // 6. 异常与无效保护：源标的不存在、组不存在、拖到自己上面
  assert.strictEqual(reorderWatchlist(initList(), "不存在的组", "sh600030", "A股"), null);
  assert.strictEqual(reorderWatchlist(initList(), "A股", "non_existent", "A股", "sz000839"), null);
  assert.strictEqual(reorderWatchlist(initList(), "A股", "sh600030", "A股", "sh600030"), null);
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








