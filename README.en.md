# MarketLens — Global Market Ticker (A-Share / HK / US / Crypto / DEX)

<p align="center">
  <b>📊 Real-time Financial & Crypto Market Ticker for Developers</b><br>
  Track A-shares (SSE/SZSE/BSE), Hong Kong stocks, US stocks (NASDAQ/S&P 500), Binance crypto, and on-chain DEX tokens directly inside VS Code.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/VS_Code-^1.85.0-007ACC?logo=visualstudiocode" alt="VS Code Version">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/Release-v1.1.7-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-orange" alt="Platform">
</p>

---

## 🌟 Why MarketLens?

As developers, staying focused on code while keeping an eye on your portfolio (stocks, crypto, on-chain tokens) often means constantly switching windows.

**MarketLens** seamlessly integrates market data into your editor:

- 🌲 **6-in-1 Unified Market Coverage**: Funds/ETFs, A-Shares, HK Stocks, US Stocks, Binance Crypto, and DEX Tokens in one unified view;
- ⚡ **Price Alert System**: Instant notifications for target prices and volatility without constant chart-watching;
- 🖱️ **Multi-Select Batch Drag & Drop**: Easily select multiple items with `Shift` or `Ctrl`/`Cmd` to reorder in batches;
- 🕶️ **Privacy & Boss Key**: One-key instant hide (`Ctrl+Alt+M`), disguise mask mode, and color-neutral view;
- 📊 **Status Bar Carousel**: Customizable ticker in the bottom status bar with independent market toggles;
- 🧹 **Ultra-low Memory Usage**: Automatic cache pruning and active-set GC keep incremental heap footprint < 15MB~25MB 24/7;
- 🛡️ **Flexible Proxy Support**: Support for local HTTP/SOCKS proxies (v2rayN, Clash) with auto-detection.

---

## ✨ Key Features

### 1. Unified Multi-Market Coverage
- **Funds & ETFs**: On-chain and exchange-traded index funds (CSI 300, ChiNext, STAR 50, Gold, Nasdaq ETFs) with dedicated settings tab;
- **A-Shares (Shanghai, Shenzhen, Beijing)**: Low-latency domestic data with intelligent trading hour detection;
- **Hong Kong Stocks**: Hang Seng Index, Tencent, Meituan, Alibaba with HK$ currency formatting;
- **US Stocks**: NASDAQ, S&P 500, Dow Jones, AAPL, NVDA, TSLA, and more;
- **Binance Crypto**: BTC, ETH, SOL, BNB, DOGE with 24/7 continuous price updates;
- **Alpha DEX Tokens**: Support for Solana, BSC, Base, and Ethereum on-chain tokens via DexScreener.

### 2. Price Alerts & Volatility Notification
- Set target price alerts (`>=` or `<=`) and intraday volatility percentage thresholds;
- 15-minute anti-spam cooldown protection;
- Boss Key muting: alerts are completely muted when hidden to prevent disruption.

### 3. Keyboard Shortcuts
| Action | Windows / Linux | Alternate | macOS |
| :--- | :--- | :--- | :--- |
| **Boss Key (Hide / Restore)** | `Ctrl + Alt + M` | `Alt + M` | `Cmd + Option + M` |
| **Toggle Disguise Mode** | `Ctrl + Alt + K` | `Alt + K` | `Cmd + Option + K` |
| **Toggle Color Neutral** | `Ctrl + Alt + L` | `Alt + L` | `Cmd + Option + L` |
| **Open Settings Panel** | `Ctrl + Alt + S` | - | `Cmd + Option + S` |

---

## 📦 Installation

- **VS Code Marketplace**: Search for `MarketLens` and click Install.
- **Open VSX Registry**: Available for VSCodium and Gitpod users.
- **Manual VSIX**: Download `.vsix` from GitHub Releases and install via `Extensions: Install from VSIX...`.

---

## 📄 License

MIT © [DevQQQQQ](https://github.com/DevQQQQQ)
