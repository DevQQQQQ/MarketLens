# 📦 MarketLens 打包与发布指南 (Packaging & Release)

本文档面向开发者，说明如何进行生产环境构建、打包生成 `.vsix` 离线扩展安装包、本地安装测试以及发布至微软 VS Code 插件市场。

---

## 🛠️ 1. 环境准备与生产构建

本项目使用 `esbuild` 进行极致体积优化与单文件编译。

```powershell
# 1. 安装依赖
npm install

# 2. 执行生产环境构建 (产物输出至 dist/extension.js)
npm run build
```

---

## 📦 2. 生成 `.vsix` 离线安装包

本项目通过官方 `@vscode/vsce` 工具打包。

### 方式一：npm 脚本一键打包（最便捷）
```powershell
npm run package
```

### 方式二：指定输出版本文件名
```powershell
npx @vscode/vsce package -o marketlens-1.1.1.vsix --allow-missing-repository --no-dependencies
```

> **参数解析**：
> - `--allow-missing-repository`：允许私有仓库或自建仓库跳过代码仓库强制检测；
> - `--no-dependencies`：配合 esbuild 打包，避免将整个庞大的 `node_modules` 重复打进安装包，使得最终生成的 `.vsix` 仅约 **100KB**，轻量便携秒安装。

---

## 💻 3. 本地安装与测试 `.vsix`

生成的 `.vsix` 文件可直接在内网机器、朋友电脑或本地环境中离线安装：

### 终端一键强制安装
```powershell
code --install-extension marketlens-1.1.1.vsix --force
```

### VS Code 图形界面安装
1. 打开 VS Code，按下 `Ctrl + Shift + P`（Mac: `Cmd + Shift + P`）；
2. 输入并选择：`Extensions: Install from VSIX...`（从 VSIX 安装...）；
3. 选中生成的 `marketlens-*.vsix` 文件即可完成安装；
4. 按 `Ctrl + Shift + P` 执行 `Developer: Reload Window` 重载窗口使其立即生效。

---

## 🚀 4. 发布至 VS Code Marketplace 官方市场

### 网页端管理后台上传（最简单直观）
1. 访问 [Visual Studio Marketplace Management Portal](https://marketplace.visualstudio.com/manage)；
2. 登录您的 Publisher 开发者账号（如 `devqqqqq`）；
3. 点击 **New extension** -> **Visual Studio Code**；
4. 上传生成的 `.vsix` 文件，平台自动完成病毒扫描与签名，数分钟内全球同步上线。

### 命令行一键发布（需要 Personal Access Token）
```powershell
npx @vscode/vsce publish -p <YOUR_PAT_TOKEN>
```

---

## 🏷️ 5. 版本号管理与规范

- 发布新版本前，请确保在 `package.json` 中递增 `version`（遵循 [SemVer 语义化版本](https://semver.org/lang/zh-CN/)，如 `1.1.0` -> `1.1.1`）；
- 同步在 `CHANGELOG.md` 中记录新版本的更新项；
- MarketLens 设置中心的【关于与帮助】面板会自动读取运行时的最新版本号展示给用户。
