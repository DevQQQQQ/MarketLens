# MarketLens — 全球资产行情看板 (A股 / 港股 / 美股 / 加密货币)

<p align="center">
  <b>📊 专为开发者打造的专业行情看板与效率工具</b><br>
  实时盯盘 A股 (沪深京)、港股 (恒生/腾讯/美团等)、美股 (纳斯达克/标普/英伟达/苹果等)、Binance 主流加密货币、全链 DEX 链上资产 (Solana / BSC / Base / 以太坊等)。
</p>

---

## ✨ 核心亮点

- 🌲 **全市场资产五合一**：
  - 🇨🇳 **A股市场**：直连腾讯官方金融行情源，支持沪深京全市场股票与指数，支持闭市期间智能停止轮询；
  - 🇭🇰 **港股市场**：腾讯官方行情源，支持 5 位代码（如 `00700` 腾讯、`03690` 美团），智能休市节流与多币种（`HK$`）结算展示；
  - 🇺🇸 **美股市场**：腾讯官方美股/指数源，支持英文代码（如 `AAPL` 苹果、`NVDA` 英伟达、`TSLA` 特斯拉、`.IXIC` 纳指），夜间交易时段自动轮询；
  - 🟡 **Binance 币安**：覆盖 BTC、ETH、SOL 等主流及山寨代币，实时 24h 涨跌与价格拉取；
  - 🦄 **Alpha 链上新币**：接入 DexScreener 全球链上聚合接口，输入代币合约地址即可实时追踪全链资产行情。
- 🛡️ **专注模式与极简展示**：
  - 🕶️ **专注模式（一键隐藏 / 恢复）**：快捷键 `Ctrl + Alt + M` 或 `Alt + M` (Mac: `Cmd + Alt + M`)，瞬间收起自选侧边栏、隐藏状态栏行情、关闭设置面板，屏幕瞬间只留纯代码！
  - 🎭 **简洁展示模式**：快捷键 `Ctrl + Alt + K` 或 `Alt + K`，将状态栏展示为极简构建日志风格（如 `git:(main) build: 65.2k`）。
  - ⚪ **颜色脱敏 (Color Neutral)**：快捷键 `Ctrl + Alt + C` 或 `Alt + C`，一键褪去红绿色视觉刺激，所有价格与图标使用编辑器中性字体颜色。
- 🌐 **网络代理支持**：
  - A股、港股、美股默认零延迟境内直连，亦可根据需要开启代理；
  - Binance 与 Alpha 支持自定义代理服务器访问；
  - 支持一键自动探测本机活跃代理端口（Clash / Clash Verge / v2rayN 等）。
- ⚙️ **专属图形化设置面板**：
  - 点击自选栏顶部 `⚙️` 齿轮按钮，即可在独立 Webview 界面中随心调整刷新频率、各板块开关、网络代理与快捷键自定义。

---

## ⌨️ 快捷键速查

| 功能 | Windows 快捷键 | 极速备用 | Mac 快捷键 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| **专注模式 (一键隐藏/恢复)** | `Ctrl + Alt + M` | `Alt + M` | `Cmd + Alt + M` | 瞬间关闭侧边栏/状态栏/设置，再次按下恢复 |
| **简洁展示模式** | `Ctrl + Alt + K` | `Alt + K` | `Cmd + Alt + K` | 价格展示为极简构建日志格式 |
| **颜色脱敏模式** | `Ctrl + Alt + C` | `Alt + C` | `Cmd + Alt + C` | 消除红绿涨跌刺激，使用系统默认中性颜色 |
| **自定义快捷键** | - | - | - | 在设置面板点击 `[⌨️ 自定义快捷键]` 即可自由改键 |

---

## 🚀 快速上手

### 1. 添加自选
点击左侧自选栏顶部的 **`+`** 号：
- **添加 A 股**：输入 6 位数字代码（如 `600519` 或 `sh600519`），自动识别并推荐进入 `A股` 分组；
- **添加港股**：输入 5 位代码或带前缀（如 `00700` 或 `hk00700`），自动识别并推荐进入 `港股` 分组；
- **添加美股**：输入美股代码（如 `AAPL`、`NVDA`、`TSLA` 或指数 `.IXIC`），自动识别进入 `美股` 分组；
- **添加主流币**：输入币对名称（如 `BTCUSDT`），自动规范化进入 `Binance` 分组；
- **添加链上新币**：粘贴任意公链合约地址（`0x...` 或 Solana 地址），自动识别进入 `Alpha` 分组。

### 2. 删除自选
鼠标悬停至任意资产上，点击右侧的 **🗑️ 垃圾桶** 图标，确认后即可秒删。

### 3. 查看资产详情卡片
将鼠标悬停在自选条目上，即可查看今开、昨收、最高、最低、成交量、成交额及链上流动性池深度。

---

## 📦 打包与发布指南 (Packaging & Release)

### 1. 生成 `.vsix` 离线安装包

本项目通过官方 `@vscode/vsce` 工具打包。

- **方式一：通过 npm 快捷指令打包（推荐）**
  ```powershell
  npx @vscode/vsce package --allow-missing-repository --allow-star-activation --no-dependencies
  ```
- **方式二：指定输出文件名**
  ```powershell
  npx @vscode/vsce package -o marketlens-1.1.0.vsix --allow-missing-repository --allow-star-activation --no-dependencies
  ```

> **参数说明**：
> - `--allow-missing-repository`：允许私有仓库（非公开开源）跳过代码仓库地址检测；
> - `--allow-star-activation`：允许插件全局激活，保证打开 VS Code 即可展示状态栏与看板；
> - `--no-dependencies`：配合 esbuild 单文件打包，无需重复将整个 node_modules 打入安装包，体积极致精简至 ~90KB。

### 2. 本地安装与测试 `.vsix`
生成的 `.vsix` 文件可直接发给朋友或在本地离线安装：
1. 打开 VS Code，按下 `Ctrl + Shift + P`（Mac: `Cmd + Shift + P`）；
2. 输入并回车：`Extensions: Install from VSIX...`（从 VSIX 安装...）；
3. 选中生成的 `marketlens-1.1.0.vsix` 文件即可完成安装。

### 3. 发布至 VS Code Marketplace 官方市场
- **网页端上传（最便捷）**：访问 [Visual Studio Marketplace Management Portal](https://marketplace.visualstudio.com/manage)，点击 **New extension** -> **Visual Studio Code**，上传生成的 `.vsix` 文件即可。

---

## 📄 免责声明
- 本插件所展示的行情数据均来源于公开合法 API，行情可能存在微秒级延迟，不构成任何投资建议。
