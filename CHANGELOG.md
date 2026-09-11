# Changelog / 更新日志

All notable changes to the "MarketLens" extension will be documented in this file.  
本项目的所有重要版本更新与改动记录均将在此文档中呈现。

## [1.1.4] - 2026-09-11

### 🚀 新增特性与核心优化 (New Features & Improvements)

- **⚡ 价格阈值与剧烈波动预警监控 (Price Alert System)**：
    - 支持为任意自选标的设置目标价突破预警（≥ 目标价）、跌破预警（≤ 目标价）与单日剧烈波动预警（|涨跌幅| ≥ 设定百分比）；
    - 支持双通道告警：VS Code 右下角轻量通知弹窗与底部状态栏高亮闪烁；
    - 内置 15 分钟智能防轰炸冷却机制（可自定义冷却时间），避免关键点位反复震荡频繁弹窗；
    - 老板键静音守卫：老板键激活期间一票否决全部预警通知，防止摸鱼时意外弹窗露馅；
    - 标的行常驻持久化 `🔔` 标记，悬停气泡可实时查看当前生效的预警规则；
    - Webview 设置面板新增「⚡ 到价预警」集中监控矩阵，支持批量查看、编辑阈值与总开关控制，与侧边栏 0ms 双向实时同频联动。
- **🖱️ 多选批量拖拽排序 (Multi-Select Batch Reorder)**：
    - 支持按住 `Shift`（连续多选）或 `Ctrl` / `Cmd`（离散多选）选中多只标的，一次性批量拖拽重排；
    - 严格的同组拖拽边界隔离守卫，彻底拦截跨板块误拖拽；
    - 单次原子化写入配置，防止并发 I/O 冲突，排序变更实时推送到设置面板。
- **🧹 内存行情缓存活跃集对齐与动态垃圾回收 (Active-Set Pruning & LRU)**：
    - 实现全量自选活跃集指纹比对算法，自动清理已删除标的的历史残留死缓存；
    - 深度优化后台长期运行的内存占用（通常 <15MB），彻底杜绝内存泄漏。
- **🔄 恢复出厂设置联动清空预警**：
    - 执行“恢复出厂默认设置”时，同步清空重置所有价格预警规则字典与冷却状态，彻底还原为最干净的安装初态。
- **🏷️ 标的名称跨端一致性修复**：
    - 引入统一名称解析器，优先尊重用户在配置中定义的自定义名称（如 Cloudflare、纳斯达克综合指数或个人昵称），杜绝被行情接口返回的机器译名（如“科赋锐”）意外覆盖。
- **📖 开源社区与反馈渠道强化**：
    - 项目现已全面开源，README 与关于页面新增 GitHub Issues 与 GitHub 开源仓库入口。

## [1.1.3] - 2026-09-10

### 🚀 稳定性与体验修复 (Fixes & Usability)

- **状态栏总控与分板块开关彻底解耦**：
    - 修复关闭 A 股轮播时状态栏意外消失的问题；
    - 修复设置中显式关闭 `marketlens.statusBar.enabled` 状态栏未隐藏的逻辑硬伤，确保全局总开关一票否决；
- **新增美股类股（Class Shares）支持**：
    - 全面支持 `BRK.B`（伯克希尔·哈撒韦）、`BF.B`、`BRK.A` 等带点号/连字符的美股核心标的实时行情添加与解析；
- **链上代币添加与防误触防护**：
    - 拦截复制 Etherscan / BscScan 交易详情（Tx Hash）时被截断添加为假代币的问题，并提供精准引导提示；
- **配置与交互体验优化**：
    - 统一本地代理默认端口为 `10808`（适配 v2rayN/Clash 等主流客户端）；
    - 修复快捷键表格 `Alt + M`、`Alt + K`、`Alt + L` 与 package.json 声明不一致的问题；
    - 设置面板切换 Tab 状态精准保留，代理端口修改后即时生效无需重启。

## [1.1.1] - 2026-09-07

### 🚀 Comprehensive Enhancements & Usability Upgrades / 功能增强与交互体验升级

#### English

- **Status Bar Smooth Carousel & Independent Controls**:
    - Resolved carousel freezing issue caused by background quote refreshes, allowing all symbols across all markets to rotate seamlessly.
    - Added global status bar carousel toggle in General Settings (`marketlens.statusBar.enabled`).
    - Added independent carousel toggles for each market: A-Shares (`marketlens.aShare.statusBar`), HK Stocks (`marketlens.hkStock.statusBar`), US Stocks (`marketlens.usStock.statusBar`), Binance (`marketlens.binance.statusBar`), and Alpha (`marketlens.alpha.statusBar`).
- **Drag & Drop Reordering & Pinning**:
    - Implemented native VS Code `TreeDragAndDropController` support. Users can long-press and drag any stock/token to reorder items within categories.
    - Added a pin button (`$(pin)`) on hover to instantly pin any symbol to the top of its category.
- **One-Click Clear Watchlist & Factory Reset**:
    - Added "Clear Watchlist" in General Settings to wipe all preset symbols across all markets with safe confirmation dialog, allowing users to start from scratch.
    - Added "Restore Factory Defaults" to reset all symbols and configs back to fresh installation state anytime.
- **Official Telegram Community & Support**:
    - Added official Telegram community group link (`https://t.me/+-eZR0R--jyUwN2Nl`) and author direct Telegram link (`https://t.me/Dev_QQQQQ`) with one-click open and copy buttons in the About panel.
- **Documentation & Packaging Restructure**:
    - Separated developer packaging instructions into dedicated `RELEASE.md`.
    - Comprehensive rewrite of `README.md` showcasing all features and quick-start guides.
- **Dynamic Versioning & Startup Optimization**:
    - Settings panel automatically and dynamically fetches and displays the current extension version (`v1.1.1`) directly from package metadata.
    - Replaced legacy `*` star activation with official `onStartupFinished` to improve startup performance.

#### 中文

- **底部状态栏丝滑轮播与各板块独立开关**：
    - 彻底修复后台刷新重置索引导致的轮播卡顿在前两项的问题，实现全市场标的（A股/港股/美股/Binance/Alpha）丝滑滚动展示。
    - 在【通用设置】中新增“全部标的参与底部轮播”总控开关（`marketlens.statusBar.enabled`），关闭后状态栏彻底隐藏。
    - 在【A股】、【港股】、【美股】、【Binance】、【Alpha】各板块页面中分别新增独立的“参与底部轮播”开关，自由定制轮播内容。
- **长按拖拽上下排序与一键置顶**：
    - 支持 VS Code 原生 `TreeDragAndDropController` 拖拽规范，长按标的即可在当前分组内自由上下拖动调整排序。
    - 标的悬停新增置顶图钉图标（`$(pin)`），点击即可一键置顶到当前分组顶部。
- **一键清空标的与出厂默认恢复**：
    - 新增“一键清空自选标的”卡片（带二次确认），方便从零开始添加自己关注的资产。
    - 新增“恢复出厂默认设置”卡片，随时一键还原为系统出厂预设标的。
- **官方 Telegram 社区与作者直联反馈**：
    - 在“关于与帮助”页面新增官方 Telegram 交流群链接（`https://t.me/+-eZR0R--jyUwN2Nl`）及作者个人 TG 对话（`https://t.me/Dev_QQQQQ`），支持一键唤起与一键复制。
- **文档与发布体系重构**：
    - 将开发者打包发布指南分离至独立 `RELEASE.md`，主 `README.md` 全面扩充各项功能使用说明。
- **动态版本号展示与启动优化**：
    - 设置中心动态读取运行时包元数据展示版本号（`MarketLens v1.1.1`）。
    - 规范化激活事件为 `onStartupFinished`，彻底消除性能警告。

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
