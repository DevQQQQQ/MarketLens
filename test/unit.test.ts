// test/unit.test.ts
import assert from "node:assert";
import test from "node:test";

// 直接导入真实的源码模块，杜绝测试代码与生产代码漂移
import { isSameSymbol, normalizeSymbolKey, normalizeUSCode, resolveItemAssetType, getWatchlistFingerprint, reorderWatchlist, extractTargetsFromWatchlist } from "../src/utils/symbolHelper.ts";
import { validateAndParseInput, isContractAddress } from "../src/utils/inputValidator.ts";
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

  // 7. 测试 resetProxyCache 能正确重置
  resetProxyCache();
  assert.strictEqual(validateAndNormalizeProxyUrl(""), "http://127.0.0.1:7890");
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





