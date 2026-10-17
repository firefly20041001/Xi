# Yachiyo (Rust + Tauri 2)

Yachiyo 音乐播放器的 Rust + Tauri 2 移植版。React 渲染层整体复用自 Electron 版(`D:\File\Project`),主进程逻辑(Node)重写为 Rust,`window.api` 通过兼容层(`src/api/index.ts`)映射到 Tauri command/event,渲染层业务代码零改动。

## 功能

- 双音源(网易云 / QQ 音乐):搜索(分页)、播放地址解析(音质级联降级)、歌单/专辑/榜单获取
- 逐行歌词 + 翻译,双源自动回退;桌面悬浮歌词窗(透明、置顶、可锁定、位置记忆)
- 账号:网页登录窗口自动捕获 cookie,账号信息刷新
- 歌单:本地创建 / 远程导入 / 刷新(保留手排顺序、新歌置顶)
- 收听画像存储、系统托盘、全局快捷键、开机自启、单实例

## 开发

```bash
pnpm install
pnpm tauri dev
```

## 构建安装包

```bash
pnpm tauri build
```

产物在 `src-tauri/target/release/bundle/nsis/`(Tauri 原生 NSIS 打包)。

## 结构

```text
src/              渲染层(Electron 版 React 代码 + api 兼容层)
  api/index.ts    window.api → Tauri invoke/listen 映射
  main.tsx        主窗口入口(先安装 window.api 再渲染)
  lyrics-main.ts  歌词窗入口
  shared/         主进程/渲染层共享类型(与 Electron 版一致)
src-tauri/        Rust 后端
  src/net.rs      HTTP + cookie/GTK 工具
  src/providers.rs 网易云/QQ 流媒体、歌词、日推
  src/accounts.rs cookie 存储、账号信息、登录窗流程
  src/playlist.rs 歌单服务
  src/store.rs    settings/accounts/listening/playlists JSON 存储
  src/tray.rs     托盘
  src/lyrics_win.rs 桌面歌词窗
```

## 与 Electron 版的差异

- 窗口缩略图工具栏(Windows Thumbnail Toolbar)Tauri 不支持,命令保留为空实现
- 未移植:二维码登录模态(Electron 版中本就未被引用)
- 用户数据目录:`%APPDATA%\com.yachiyo.app`(与 Electron 版的 `%APPDATA%\yachiyo` 隔离,首次使用需重新登录账号)
