# 希 · Xi 会话检查点（2026-10-23 更新）

> 给下个会话的接续摘要：版本状态、架构铁律、打包四步、坑清单、遗留事项。

## 项目状态
- **Tauri 音乐播放器「希」v3.2.0**，仓库 `github.com/firefly20041001/Xi`（public，main，GPL-3.0-only），工作目录 `D:\File\Project-REbuild`
- main 最新：`f9264b6 chore: 版本号 3.1.9 -> 3.2.0`（远端同步，无 ahead）
- 提交链：`4c12c69` 全功能 → `cea899b` GPL v3 → `61222fa` README → `d245891` 打包工程化 → `e86cb65` 检查更新指向新仓库 → `977e651` 首页右键菜单+屏蔽默认右键 → `f9264b6` 版本 3.2.0

## 发布状态
- **v3.1.9** release 已发（id 418067500，双资产 uploaded，55/58MB，还带内嵌墙脂的旧形态）
- **v3.2.0** release 已发（id 418080364）：`Xi_Setup_3.2.0.exe` 55.0MB + `unpack-win-v3.2.0.zip` 58.5MB，均 uploaded
  - 说明含：新增首页右键菜单/屏蔽系统右键，修复静音按钮/歌词监听/检查更新指向，散装分发声明
- 本地 `release\`（gitignored）：两个 3.2.0 产物 + `release-notes.md`；`release\unpack\` 散装目录实就绪（xi.exe 15MB @10-20 14:37 + app\ + LICENSE.txt + 使用说明 v3.2.0）
- **检查更新闭环**：`SettingsPage.tsx` 拉 `repos/firefly20041001/Xi/releases/latest`；3.1.9 老包→「发现新版本 v3.2.0」跳 release 页；3.2.0 包→「已是最新版本」

## 架构铁律
- **散装分发**：exe 不嵌资源（`cargo build --release` **无** `--features`，~15MB）；`web_page_url()` 三层判定：
  1. exe 旁有 `app\index.html` → `app://localhost/{page}` 盘上跑（协议处理器 pct_decode、防 `..` 越界、mime_of）
  2. 无盘上目录且 dev 构建 → vite 5180
  3. 兜底 `app://`（若开 `custom-protocol` 则回退内嵌资源，代码不动）
- 主窗 Rust 创建（`tauri.conf.json` `windows: []`，无 BOM）；托盘/歌词窗 `WebviewUrl::External(web_page_url("*.html"))`
- 托盘双击/单实例唤起必须 emit `tray:action: showMain`（否则前端不知已恢复→白屏）；`mainHidden`（最小化）与 `trayParked`（×收托盘卸页面树）分立
- WebView2 省内存用 `MemoryUsageTargetLevel(Low)`（禁 TrySuspend——会冻 JS，切歌/悬浮词全挂）
- 首页右键：HomePage `homeMenu` 状态 + `copyHomeTrack()`（`navigator.clipboard`）+ `ContextMenu` 组件（`items:{icon,label,onClick}`）；`GlassPanel` 可选 `onContextMenu` 透传；App.tsx 全局 `contextmenu preventDefault`（input/textarea/contenteditable 豁免，保系统复制粘贴）
- 静音：`playbackStore.toggleMute` 早有 → `usePlayback` 转发 `toggleMuteFn`；歌词监听 unlisten 要链 return（勿 `void listen(...)` 后再 `.then`）
- 开机自启键统一 `autoLaunch`；前端启动绝不回写（防反转）

## 打包四步（现行）
```powershell
Get-Process xi -ErrorAction SilentlyContinue | Stop-Process -Force   # exe 占用会断链接
npm run build                                                         # __APP_VERSION__ 随 package.json version 烤入
(gi src-tauri\src\lib.rs).LastWriteTime = Get-Date
cd src-tauri; cargo build --release                                   # 无 --features
cd ..
Copy-Item src-tauri\target\release\xi.exe release\unpack\xi.exe -Force
Remove-Item release\unpack\app -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item dist release\unpack\app -Recurse
Copy-Item LICENSE release\unpack\LICENSE.txt -Force
& "D:\Inno Setup 7\ISCC.exe" "D:\File\Project-REbuild\installer\setup.iss"
```
- iss：`#define MyAppVersion` 在第 7 行（改版先改它 + package.json/Cargo.toml/tauri.conf.json 四处）；`DefaultGroupName=希`；**需 UTF-8 BOM**；Win11 判定用注册表 CurrentBuildNumber≥22000；WebView2 引导 fwlink 2099617
- GitHub release：API `POST /repos/firefly20041001/Xi/releases`（tag v{X.Y.Z}, target main, body=release-notes.md）→ `curl.exe -X POST` 传双资产；**上传 URL 硬编码字符串**（`?name=` 变量拼接在 PS 会 Bad hostname）；token 用 `git credential fill` 取、不回显

## 坑清单（在案）
1. PS 5.1 `Set-Content -Encoding UTF8` 会加 BOM → JSON 炸 vite/tauri；用 `[IO.File]::WriteAllText($p,$t,(New-Object Text.UTF8Encoding($false)))`，首字节验证（`{`=123、`[`=91）；setup.iss 反要保留 BOM
2. PS `-replace '^version…'` 的 `^` 只匹配整串开头，多行文本去 `^`
3. tsc 预存量老错 6 条（非新引入）：Showcase.tsx、SearchPage.tsx（`artist` 类型 ×3）、SettingsPage `__APP_VERSION__`、tray-main webviewWindow 导入
4. git push 偶发 `Connection reset / hung up` → 重试或用户自推（备选 `-c http.version=HTTP/1.1`、代理 7890）
5. exe 运行中会占 `target\release\xi.exe`（链接失败先 Stop-Process）；cargo 锁串行；验证用 unpack 副本不碰链接
6. 体积大头：public\assets ~90MB 用户壁纸 + 20MB 字体会被烧进 exe+app\（exe 已瘦但安装包 app 目录仍大）
7. WebView2 现场调试：`$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'` → `http://127.0.0.1:9222/json` 列目标；单实例插件会把二次启动转发给在运行实例（先杀干净）

## 遗留/可做
- 未实测验收：首页右键菜单手感、静音按钮、托盘双击/单实例唤起非白屏、全新机器 unpack 结构、换包后开机自启
- 可选瘦身未动：壁纸改存 %APPDATA%（90MB 大头）
- 预存量可顺手修：SearchPage `artist` 类型签名放宽（可消 3 条 tsc 错）
- v3.1.9 与 v3.2.0 release 并存远端（未要求删，可留作历史版本）
