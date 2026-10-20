# 希 · Xi

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-GPL--3.0--only-blue" />
  <img alt="version" src="https://img.shields.io/badge/version-3.1.9-green" />
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows-lightgrey" />
  <img alt="stack" src="https://img.shields.io/badge/Tauri%202%20%2B%20React%2018-244B5A?logo=rust" />
</p>

**希** 是一款 Windows 桌面音乐播放器（Tauri 2 + React 18），主打双平台流媒体聚合 +
本地曲库一体化的「玻璃拟态」体验。取名自问候语里那个默认称呼——「希，来听一点音乐吧～」。

## ✨ 功能一览

### 🎧 双平台流媒体
- **网易云音乐 / QQ 音乐**聚合搜索：歌曲、歌手、歌单、榜单四路并发
- **推荐歌单**页：双源交错聚合，卡面标注来源平台（`MUSIKEY · QQ 音乐`）
- **歌手检索**：双平台圆形头像网格 → 歌手详情（自动回退三级接口），50 首分页「加载更多 / 已经到底啦～」
- **歌单搜索 / 平台歌单同步**：自建、收藏、「我喜欢」全部本地化进歌单宝藏库
- 音质按源可选，未登录也能浏览官方榜单与热门内容

### 🎲 首页智能推荐
- **主推卡**：从你的平台歌单池完全随机 30 首的队列，封面/播放位随控制栏实时跟随，每次启动重新洗牌
- **宝藏好歌**：解析你歌单名里的关键词（如「日系/伤感/致郁/情歌/女声」，按出现频次加权）→ 对应平台定向搜歌 ∪ 我喜欢的歌 → 听歌行为引擎打分出 9 首；无平台登录时自动落官方热歌榜 + 本地曲库兜底
- **问候称呼**：`Hi X · 今日为你推荐 / 「X」，这是你的宝藏好歌`，默认取 Windows 登录用户名，可在设置改

### 💿 本地曲库
- 目录扫描深度 0~5 可调，MP3/FLAC 等主流格式，封面按专辑聚合
- 本地曲目与流媒体曲目同构混排、跨源无缝切歌播放

### 🖼 桌面集成
- **悬浮歌词窗**：独立歌词进程、置顶锁定、控制条与设置直通
- **全屏歌词**壁纸化展示
- **托盘**：玻璃质拟菜单、播放/切歌/音量/歌词开关、双击唤起主窗、进度图标
- **全局快捷键**、单实例幂等启动、开机自启（键值双写对齐 + 防误反关）
- **收进托盘极致省电**：× 后卸载页面树 + 停渲染 + WebView2 `MemoryUsageTargetLevel(Low)` 修剪缓存——音频引擎与悬浮歌词照常，回来即用

### 🎨 外观
- 深色/浅色主题、NexBox 三层壁纸玻璃骨架、MiSans 可变字体系统（支持用户导入）
- 控制栏三段固定布局，播放键恒定落在控制栏正中

## 🏗 技术栈

| 层 | 技术 |
|---|---|
| 壳 | Tauri 2（Rust + WebView2） |
| UI | React 18 · TypeScript · zustand · CSS（无重框架） |
| 音频 | HTMLAudio 引擎（主窗 webview 内，托盘/快捷键事件桥） |
| 数据 | 平台接口 Rust 侧聚合（去身份化匿名通道），KV 设置持久化 |

## 🚀 构建

```bash
# 依赖:Node 18+ · Rust stable · WebView2 Runtime
npm install
npm run dev          # 前端 dev + Rust 编译运行(开发)
npm run build        # 前端产物 → src-tauri/dist
cd src-tauri
cargo build --release
# 产物:src-tauri/target/release/xi.exe
```

## 📄 许可证

本项目以 [GPL-3.0-only](LICENSE) 发行。仅在个人学习与交流场景使用；
所播放/展示的音乐内容版权归各自平台与音乐人所有。
