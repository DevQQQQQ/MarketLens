# Changelog / 更新日志

All notable changes to the "MarketLens" extension will be documented in this file.  
本项目的所有重要版本更新与改动记录均将在此文档中呈现。

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
