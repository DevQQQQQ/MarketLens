# MarketLens — VS Code 行情插件

实时在 VS Code 侧边栏追踪 A股、Crypto、BSC 行情。

## 功能特性

- 🌲 **树形自选列表**：分组展示（A股 / Crypto / BSC）
- 📊 **实时行情**：可配置刷新间隔（默认 5s）
- 🎭 **伪装模式**：一键将价格替换为 `****`，防止他人窥屏
- 📌 **状态栏摘要**：底部展示第一只票的即时行情

## 快速开始

```bash
npm install
npm run dev        # 开发（watch 模式）
# 按 F5 在扩展宿主中调试
```

## 项目结构

```
MarketLens/
├── src/
│   ├── extension.ts          # 插件入口，生命周期管理
│   ├── types/
│   │   └── index.ts          # 全局类型（WatchItem, Quote, …）
│   ├── services/
│   │   └── dataService.ts    # 数据层（MarketFetcher 抽象 + Mock）
│   └── ui/
│       ├── watchlistProvider.ts  # TreeDataProvider（侧边栏树视图）
│       └── statusBarManager.ts   # 状态栏管理
├── package.json
├── tsconfig.json
└── esbuild.js
```

## VS Code Settings

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `marketlens.refreshInterval` | number | `5000` | 刷新间隔（ms），范围 1000-60000 |
| `marketlens.maskMode` | boolean | `false` | 伪装模式开关 |
| `marketlens.watchlist` | object | 示例数据 | 自选列表（按分组配置） |

## 下一步

- [ ] 接入 A股真实 API（新浪 / 腾讯行情接口）
- [ ] 接入 Binance REST / WebSocket
- [ ] 接入 BSC DEX 价格（PancakeSwap v3 子图）
- [ ] 添加/删除自选持久化（写回 settings）
- [ ] 涨跌色彩主题适配（亮色 / 暗色）
