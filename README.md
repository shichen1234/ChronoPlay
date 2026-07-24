# 🎮 ChronoPlay游戏中心

[![Electron](https://img.shields.io/badge/Electron-v43.0.0-47848F?logo=electron)](https://www.electronjs.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.x-4FC08D?logo=vuedotjs)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-4.x-646CFF?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**ChronoPlay** 是一款专为游戏爱好者打造的高颜值、全能型游戏库管理与复古游戏娱乐桌面客户端。项目采用 Vue 3 + Vite 构建现代响应式 UI，融合 Node.js Express 后端服务，并基于 Electron 封装为独立的 Windows 原生客户端应用。

---

## ✨ 核心特色功能

### 1. 👾 内嵌复古游戏厅 (Retro Game Hall)
无需安装任何外部复杂模拟器或环境配置，点开即玩！基于底层 WebAssembly 模拟器核心（JSNES、FBNeo、mGBA），完美支持离线自托管：
- **FC / 红白机经典**：超级马里奥、魂斗罗、双截龙、冒险岛、热血足球、坦克大战、中国象棋、五子棋等。
- **街机 / NeoGeo 殿堂**：合金弹头全系列（1~5、X）、拳皇 97 / 98、恐龙快打等。
- **GBA 掌机王国**：精灵宝可梦（火红/叶绿）、逆转裁判三部曲（1~3）、火焰之纹章三部曲（封印之剑/烈火之剑/圣魔之光石）、塞尔达传说：缩小帽、星之卡比：镜之迷宫、恶魔城：晓月圆舞曲。
- **手柄与键盘映射系统**：支持自动识别外接 Xbox/PS 手柄与单手柄/双手柄 1P/2P 快速互换，并为 GBA 与街机游戏提供专属键位调整与快照 Save State 存档功能。

### 2. 📉 Steam 史低价格与变动追踪
对接 IsThereAnyDeal (ITAD) API 并结合 Supabase 云端 Edge Function 自动化任务：
- **可视化折线图**：精准记录并绘制数百款热门 Steam 游戏的历史价格波动曲线。
- **智能降价警报与比对**：自动比对国区现价与历史最低价，助您精明选购。

### 3. 🚀 Steam 加速器与网络配置
内置网络服务节点代理测试与一键开关逻辑，快速改善 Steam 商店与创意工坊图片及社区数据的加载体验。

### 4. 🖥️ 原生桌面级体验
- **单例进程保护**：防重复启动与端口占用（EADDRINUSE 自动修复）。
- **系统托盘驻留**：支持最小化至任务栏右下角托盘，随用随唤。
- **CORS放行与扩展适配**：内置 SteamDB 浏览器插件适配与自动化接口放行。

---

## 🛠️ 技术栈一览

- **前端 UI (Frontend)**: Vue 3, Vue Router, Pinia, Vite, ECharts (图表绘制), Vanilla CSS (现代化暗黑玻璃风)
- **后端服务 (Server)**: Node.js, Express, Axios
- **模拟器引擎 (Emulators)**: JSNES, EmulatorJS (mGBA / FBNeo WebAssembly Cores)
- **云端与数据库 (Cloud & Database)**: Supabase (PostgreSQL), Supabase Edge Functions (Deno Cron)
- **桌面包装 (Desktop Packager)**: Electron 43, Electron-Packager, Inno Setup

---

## 📁 目录结构说明

```text
game-collection/
├── data/                  # 本地数据缓存目录 (如商店离线预载数据 store_cache.json)
├── dist/                  # Vite 编译产物 (前端与工程静态资源)
├── public/                # 静态文件、游戏卡带 ROM 及矢量封面
│   ├── covers/            # 模拟器游戏高清 SVG/PNG 矢量封面
│   └── emulatorjs/        # EmulatorJS WebAssembly 核心资源包
├── src/                   # Vue 3 源码目录
│   ├── assets/            # 样式与图片资源
│   ├── components/        # 公用组件
│   ├── store/             # Pinia 状态管理
│   └── views/             # 页面视图 (Retro.vue 复古游戏厅, Store.vue 商店等)
├── server/                # Express 后端本地服务器与 SQLite/JSON 数据库
├── supabase/              # Supabase Edge Function 自动化任务配置
├── electron-main.js       # Electron 主进程入口脚本
├── build.js               # 打包优化与二进制体积瘦身脚本
├── setup.iss              # Inno Setup 一键安装向导打包配置脚本
└── package.json           # 项目依赖与运行命令
```

---

## 🚀 快速开始与开发指南

### 1. 环境准备
请确保您的电脑已安装 Node.js (推荐 v18.x 或更高版本)。

### 2. 克隆项目与安装依赖
```bash
# 克隆仓库
git clone https://github.com/YourUsername/ChronoPlay.git

# 进入目录
cd ChronoPlay

# 安装依赖包
npm install
```

### 3. 本地开发模式启动
```bash
# 启动本地 Vite 前端与 Express 后端开发服务器
npm run dev
```

---

## 📦 打包与发布

### 1. 编译前端与生成 Electron 解压版客户端
```bash
# 自动编译并打包至 desktop-app/ChronoPlay-win32-x64 目录
npm run package:desktop
```

### 2. 构建 Windows 一键安装向导程序 (`Setup.exe`)
项目内置了标准的 **Inno Setup** 打包配置文件 `setup.iss`：
1. 下载并安装 [Inno Setup Compiler](https://jrsoftware.org/isdl.php)；
2. 双击打开项目根目录下的 `setup.iss`；
3. 点击工具栏的 **Compile (编译)** 按钮；
4. 即可在 `release/` 目录生成体积仅约 300MB 的单文件安装包 `ChronoPlay_Setup_v1.0.exe`！

---

## 📜 许可证 (License)

本项目基于 [MIT License](LICENSE) 开源许可。可自由用于学习、二次开发与个人分享。
