# Changelog / 更新日志

All notable changes to the "MarketLens" extension will be documented in this file.  
本项目的所有重要版本更新与改动记录均将在此文档中呈现。

---

## [1.1.1] - 2026-09-07

### 🎨 UI & Usability Enhancements / 体验优化与出厂重置功能

#### English
- **Canonical Watchlist Ordering**: Fixed watchlist group order to strictly follow the standard sequence: `A-Shares` -> `HK Stocks` -> `US Stocks` -> `Binance` -> `Alpha` regardless of configuration key insertion order.
- **Restore Factory Defaults**: Added a one-click "Restore Default Settings" card in General Settings to allow users to easily reset all watchlist groups (A-Shares, HK, US, Binance, Alpha) and configurations back to fresh installation defaults with confirmation protection.
- **Activation Optimization**: Replaced legacy `*` star activation with official `onStartupFinished` to improve startup performance and eliminate editor warnings.

#### 中文
- **自选分组标准排序**：锁定自选侧边栏分组排序规则，始终严格按照 `A股` -> `港股` -> `美股` -> `Binance` -> `Alpha` 标准顺序展示，不受用户配置先后影响。
- **恢复出厂默认设置**：在【通用设置】顶部新增一键“恢复默认设置”卡片及独立命令（带二次确认弹窗），方便用户在自定义操作后一键将所有板块（A股/港股/美股/币安/Alpha）与配置还原为首次安装时的默认标的。
- **启动事件规范化**：将旧版 `*` 激活事件替换为 VS Code 官方标准的 `onStartupFinished`，彻底消除性能警告并提升编辑器启动流畅度。

---

## [1.1.0] - 2026-09-07

### 🚀 Major Feature Release: HK & US Stocks / 重磅新增：港股与美股市场支持

#### English
- **Hong Kong Stocks (HK Stocks)**:
  - Full support for HK stocks via Tencent Finance API (`hk00700`, `hk03690`, `hk09988`, `hk06030`, `hk01810`, etc.).
  - Multi-currency display with `HK$` Hong Kong Dollars in tooltips, tree items, and detail cards.
  - Intelligent closed-market detection for HK trading hours (09:30-12:00, 13:00-16:10).
- **US Stocks & Indices**:
  - Full support for US stocks (`AAPL`, `NVDA`, `TSLA`, `NET`, `TSM`, `AMD`, `AVGO`, `ARM`, etc.) and market indices (`.IXIC`, etc.).
  - Multi-currency display with `$` US Dollars.
  - Intelligent trading hours detection for US market (21:00 to 05:00 next day).
- **Settings & Management**:
  - Independent settings tabs in the Settings Webview for HK and US stocks, supporting direct connection or proxy routing, stop polling during market closure, and auto proxy detection.
  - Smart input parser automatically identifies 5-digit codes as HK stocks, English letter codes as US stocks, and provides instant group suggestions.
- **Default Watchlists & Instant Display**:
  - Expanded Binance default crypto list (`BTC`, `ETH`, `SOL`, `BNB`, `DOGE`, `ARB`, `OP`, `APT`, `ORDI`, `ASTER`, `ETC`, `LUNA`).
  - Added popular on-chain Alpha tokens deduplicated and automatically resolved with readable token symbols (`翻身币`, `quq`, `人生K线`, `PALU`, `恶俗企鹅`, `我踏马来了`, `DONKEY`, `4`, `客服小何`, `哈基米`, `币安人生`, etc.).
  - Pre-configured trending US tech stocks and HK blue-chip stocks.
  - Zero-wait initial display: Immediately renders the tree skeleton on startup and guarantees instant first-load quote retrieval even during market closure or weekends.

#### 中文
- **港股市场板块**：
  - 接入腾讯官方港股接口，支持全部港股标的（如 `hk00700` 腾讯控股、`hk03690` 美团、`hk09988` 阿里巴巴、`hk00981` 中芯国际、`hk06030` 中信证券、`hk01810` 小米集团等）。
  - 支持 `HK$` 港币多币种专属结算与悬停卡片展示（含开盘、昨收、高低、成交量(股)、成交额(港币)）。
  - 港股智能休市检测（工作日 09:30-12:00, 13:00-16:10），闭市期间自动停止高频轮询节约资源。
- **美股市场板块**：
  - 接入腾讯官方美股接口，支持美股个股（`AAPL` 苹果、`NVDA` 英伟达、`TSLA` 特斯拉、`NET` Cloudflare、`TSM` 台积电、`AMD` 超威半导体、`AVGO` 博通、`ARM` 安谋等）及主要指数（如 `.IXIC` 纳斯达克指数）。
  - 支持 `$` 美元专属结算展示。
  - 美股智能交易时段检测（工作日 21:00 至次日凌晨 05:00），夜间盘中自动跟踪。
- **设置与交互体验升级**：
  - 设置面板中新增独立的【港股市场】与【美股市场】专栏配置，支持开关、闭市休眠、直连/代理切换与一键代理探测。
  - 添加自选智能识别器升级：输入 5 位数字或 `hk` 前缀自动匹配港股；输入纯英文字母代码（如 `AAPL`）自动推荐美股。
- **自选预设与秒级开箱体验**：
  - 扩充出厂默认自选库：Binance 新增 SOL、BNB、DOGE、ARB、OP、APT、ORDI、ASTER 等主流与热门币种；Alpha 板块新增 11 个经过链上去重并智能解析出代币简称（翻身币、quq、人生K线、PALU、恶俗企鹅、我踏马来了、DONKEY、4、客服小何、哈基米、币安人生等）的链上标的；美股预设包含 Cloudflare 及热门芯片龙头股。
  - 首次启动秒级展示：启动时立即展示标的骨架，无需空白等待；首次刷新强制穿透拉取最新收盘价，彻底解决“安装后首次打开无价格”问题。

---

## [1.0.0] - 2026-09-06

### 🚀 Major Release / 正式发布

#### English
- **Multi-Asset Coverage**:
  - Full support for China A-Shares (Shanghai, Shenzhen, Beijing markets) via Tencent Finance API with intelligent closed-market detection.
  - Real-time mainstream crypto tracking via Binance (BTC, ETH, SOL, and all USDT/USDC pairs).
  - On-chain token tracking via DexScreener across Solana, BSC, Base, Ethereum, and more by contract address.
- **Focus & Workplace Privacy**:
  - **Focus Mode**: Instant toggle (`Ctrl + Alt + M` / `Alt + M` on Win/Linux, `Cmd + Alt + M` on Mac) to hide or restore the sidebar, status bar tickers, and settings webview simultaneously.
  - **Compact Mode**: Shortcut (`Ctrl + Alt + K` / `Alt + K`) to display status bar prices in compact build log format (e.g. `git:(main) build: 65.2k`).
  - **Color Neutral Mode**: Shortcut (`Ctrl + Alt + C` / `Alt + C`) to eliminate red/green color stimulation, rendering all tickers in neutral editor colors.
  - **Customizable Shortcuts**: One-click quick link to VS Code native keyboard shortcuts configuration.
- **Network & Enterprise Security**:
  - Zero-latency direct domestic connection for A-Shares.
  - Optional proxy routing for Binance & Alpha for enhanced connectivity.
  - Automatic proxy port detector supporting Clash, Clash Verge, v2rayN, etc.
- **UI & Usability**:
  - Interactive graphical Settings Webview panel with real-time toggle switches.
  - Asset deletion with confirmation prompts and treeview synchronization.
  - Instant input validation for symbol search and contract address parsing.
  - Guaranteed initial quote fetch upon opening, even during market closure.

#### 中文
- **全市场资产三合一覆盖**：
  - **A股市场**：直连腾讯官方金融行情接口，全面支持沪深京全市场股票与指数，支持闭市期间智能休眠。
  - **币安主流币**：实时获取 BTC、ETH、SOL 等主流币及山寨币 24h 最新价格与涨跌幅。
  - **Alpha 链上新币**：接入 DexScreener 全球链上聚合源，输入合约地址即可实时追踪 Solana、BSC、Base、以太坊等全链资产。
- **工作区隐私与专注模式**：
  - **专注模式（一键隐藏/恢复）**：快捷键 `Ctrl + Alt + M` 或 `Alt + M`（Mac: `Cmd + Alt + M`），瞬间收起自选侧边栏、隐藏状态栏行情、关闭设置面板，再次按下瞬间复原。
  - **极简展示模式**：快捷键 `Ctrl + Alt + K` 或 `Alt + K`，将状态栏行情展示为简洁构建日志样式（如 `git:(main) build: 65.2k`）。
  - **颜色脱敏模式**：快捷键 `Ctrl + Alt + C` 或 `Alt + C`，一键褪去红绿色视觉刺激，所有涨跌幅与图标采用编辑器默认中性色。
  - **自定义快捷键**：设置面板提供一键直达 VS Code 原生快捷键配置界面的按钮，随心改键。
- **网络代理支持**：
  - A股默认境内零延迟直连。
  - 币安与 Alpha 支持配置独立代理服务器，保障跨境行情接口连通性。
  - 支持一键自动探测本机活跃代理端口（兼容 Clash、Clash Verge、v2rayN 等）。
- **交互与用户体验**：
  - 专属图形化设置面板（Webview），所见即所得。
  - 自选列表支持悬停快速删除与确认弹窗防误触。
  - 完善的输入校验：支持代码/代币/合约地址自动识别与非法输入拦截。
  - 首次打开插件即刻抓取最新收盘行情，即使周末闭市也能一览无余。

---

## [0.2.0]

### Added / 新增
- **EN**: Integrated DexScreener API for DEX on-chain token tracking (Alpha tab) by pasting contract addresses.
- **ZH**: 接入 DexScreener 链上行情接口（Alpha 分组），支持粘贴合约地址一键添加全链新币。
- **EN**: Added network proxy settings with auto-detect proxy port for enhanced privacy.
- **ZH**: 新增网络代理配置面板与本机代理端口一键自动探测功能。
- **EN**: Added hover tooltip detail cards showing open, high, low, volume, and liquidity depth.
- **ZH**: 新增自选条目悬停详情卡片，可查看今开、昨收、最高、最低、成交额及链上流动性池深度。

### Improved / 优化
- **EN**: Optimized polling timers to reduce CPU and network usage during market non-trading hours.
- **ZH**: 优化轮询调度器，在非交易时间段大幅降低网络与 CPU 资源占用。

---

## [0.1.2]

### Added / 新增
- **EN**: Introduced Compact Mode (`Ctrl + Alt + K`) to display tickers in concise build log format.
- **ZH**: 引入极简展示模式（快捷键 `Ctrl + Alt + K`），将状态栏行情展示为简洁构建日志样式。
- **EN**: Added Color Neutral mode (`Ctrl + Alt + C`) to mute red and green color highlights.
- **ZH**: 引入颜色脱敏模式（快捷键 `Ctrl + Alt + C`），消除红绿视觉刺激。

### Fixed / 修复
- **EN**: Fixed tab switching and Webview message communication event handlers.
- **ZH**: 修复设置面板 Tab 切换以及 Webview 消息通信监听机制。

---

## [0.1.1]

### Added / 新增
- **EN**: Implemented Focus Mode (`Ctrl + Alt + M`) to instantly toggle visibility of all market elements.
- **ZH**: 实现一键专注模式（快捷键 `Ctrl + Alt + M`），瞬间隐藏与恢复所有行情相关界面。
- **EN**: Added multi-asset rotation for VS Code status bar display.
- **ZH**: 新增状态栏多资产轮播滚动展示功能。

### Fixed / 修复
- **EN**: Resolved ticker update delay under unstable network conditions.
- **ZH**: 优化弱网环境下的重试逻辑，解决行情刷新偶发延迟的问题。

---

## [0.1.0]

### Added / 新增
- **EN**: Initial project release.
- **ZH**: 项目初始版本发布。
- **EN**: Basic China A-Share market quote fetching (Shanghai & Shenzhen exchanges).
- **ZH**: 支持 A 股沪深基础行情数据拉取。
- **EN**: Basic Binance cryptocurrency quote fetching (BTC / ETH USDT pairs).
- **ZH**: 支持币安主流加密货币行情（BTC / ETH 等 USDT 币对）。
- **EN**: Left sidebar watchlist treeview to manage and view favorite assets.
- **ZH**: 左侧侧边栏自选列表，支持资产展示与基础自选管理。
