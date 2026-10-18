# NexBox UI 移植映射规范

> 阶段 2 产物。记录 NexBox(参考,GPL-3.0)→ Yachiyo(Project-REbuild)的组件级映射。
> 当前状态:**设计基座已建立,正式组件尚未替换**。本表是后续逐个替换的工作清单与验收依据。

## 参考源码位置

- NexBox:`C:\Users\ASUS\AppData\Local\Temp\nexbox`(v10.2.1,GPL-3.0)
- 提取依据文件(均为实际读取):
  - `src/components/ui/main-layout.tsx`(背景层交叉淡化、内容区滚动、果冻弹跳触发)
  - `src/components/ui/sidebar.tsx`(玻璃配方、48px 导航、active 色块、拖拽排序)
  - `src/components/ui/title-bar.tsx`(36px 窗口圆钮、玻璃 tooltip 参数)
  - `src/components/ui/global-search.tsx`(搜索胶囊配色、Ctrl+K)
  - `src/contexts/theme-color-context.tsx`(强调色状态系统:hover/active/border 透明度、对比文字色)
  - `src/contexts/background-context.tsx`(壁纸模式/模糊/液态玻璃开关/tooltip 玻璃映射)
  - `src/index.css`(隐藏滚动条、果冻弹跳 keyframes、字体注册)
  - `src/lib/theme.ts`(light/dark/system、Chakra extendTheme)

## 设计令牌(nexbox-tokens.css,前缀 --nbf-*)

| 令牌组 | 内容 | NexBox 依据 |
|---|---|---|
| 面板 | `--nbf-panel-solid`(白/#111)、`--nbf-glass-bg`(白.25/黑.25)、`--nbf-glass-bg-strong`(.55/.4) | sidebar.tsx glassBgColor / global-search inputBg |
| 边框 | `--nbf-glass-border`(白.2/白.1)、`--nbf-glass-border-solid`(灰.3/灰.5) | sidebar.tsx glassBorderColor |
| 文字 | `--nbf-fg`(#1a202c/#e2e2e8)、muted(灰.5/.4)、input 文字(灰.700/#fff) | global-search.tsx textColor/placeholder |
| 强调色 | `--nbf-accent`(可换,展示页联动 `--nb-accent`)、hover 20%(暗 30%)、active 实色、border 40%、对比文字色 | theme-color-context hoverOpacity/activeOpacity/borderOpacity/getContrastTextColor |
| 窗口控制 | `--nbf-win-*`(白.8/黑.8 底、icon 灰.6/.8、hover、close 红) | title-bar.tsx WindowButton |
| 形状 | panel 16px(chakra xl)、card 12px、full 胶囊 | sidebar/button borderRadius="xl"/"full" |
| 尺寸 | nav 高 48px、窗口钮 36px | sidebar.tsx h="48px" / title-bar h="36px" |
| 动效 | fast 0.15s、base 0.3s、ease cubic-bezier(.4,0,.2,1)、bg 淡入 0.5s、tooltip 延迟 150ms | main-layout transition / Tooltip defaultProps |
| 玻璃参数 | `--nbf-blur-glass`(默认 18px,可调)、`--nbf-blur-tooltip: blur(12px) saturate(1.4)` | background-context liquidGlassBlur / tooltip 映射 |

## 组件映射表

| # | Yachiyo 现有组件(路径) | 职责 | NexBox 参考 | 目标组件(nexbox-ui) | 涉及文件 | 布局变化 | 业务逻辑 | 风险 | 验收方式 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `src/app/Layout.tsx` | 壁纸层 + 三区骨架 | `ui/main-layout.tsx` | `nb-glass-panel` 类 + 背景层组件(待建) | Layout.tsx、nexbox-glass.css | 无(保持侧栏/内容/播放栏位置) | 无 | 低:纯样式覆盖 | smoke-test 22 项 + 截图 |
| 2 | `src/components/sidebar/Sidebar.tsx` | 文字导航 + 折叠 + 主题切换 | `ui/sidebar.tsx` | `NBNavItem`(已有)封装 | Sidebar.tsx、sidebar.css | 无(保留折叠动画与 88/240 宽度) | 无 | 中:active/折叠态样式需逐态核对 | 截图 + 折叠动画手测 |
| 3 | 顶栏窗口按钮(Sidebar/Layout 内联) | 窗口控制 | `ui/title-bar.tsx` | `NBWindowButtons`(已有) | 顶栏所在文件 | 无 | 调 Tauri window API 不变 | 低 | 最小化/最大化/关闭实测 |
| 4 | `src/components/common/SearchBar.tsx` | 搜索提交 | `ui/global-search.tsx` | `NBInput` 搜索胶囊(已有) | SearchBar.tsx | 无 | invoke streaming_search 不变 | 低 | 冒烟:搜索渲染/分页 |
| 5 | `src/components/common/GlassPanel.tsx` | 玻璃面板 | sidebar/main-layout 玻璃容器 | `NBGlassPanel`(已有) | GlassPanel.tsx 或直接替换类名 | 无 | 无 | 低 | 截图 |
| 6 | Tooltip(散落 title 属性) | 悬停提示 | theme.ts Tooltip baseStyle + background-context 映射 | `NBTooltip`(已有) | 各使用点 | 无 | 无 | 低 | 悬停目测 |
| 7 | 右键菜单 `common/ContextMenu.tsx` | 上下文菜单 | Chakra Menu(各页面) | `NBContextMenu`(已有) | ContextMenu.tsx / TrackItem.tsx | 无 | 菜单项回调不变 | 中:菜单项回调需逐个接线 | 手测每项动作 |
| 8 | `pages/SettingsPage.tsx` 外观分区 | 主题/外观 | theme-mode/background contexts 设置面 | 已完成(`AppearanceGlassSettings`) | 已提交 | 无 | 无 | — | 已验证 |
| 9 | `components/player/PlayerBar.tsx` | 播放栏 | 无直接对应(NexBox 音乐模块独立) | 仅玻璃换肤(已由 nexbox-glass.css 覆盖) | player.css | 无 | **播放逻辑禁改** | 低 | 冒烟:起播/暂停 |
| 10 | `pages/*`(8 个业务页) | 业务页面 | 无对应(域不同) | 仅玻璃类名替换 | 各页面 css 引用 | 无 | 不变 | 低 | 冒烟 22 项 |
| 11 | 滚动条(全局) | 滚动 | `index.css` 隐藏滚动条 + main-layout 6px 玻璃滚动条 | tokens 文件已含 `.nb-scope` 版本 | 正式页面引入待定 | 无 | 无 | 低 | 目测 |
| 12 | 沉浸式歌词 `components/lyrics/*` | 歌词显示 | NotoSerifSC-900 字体方案(未深入) | 待定 | — | 待定 | 无 | 待定 | 待定 |

## 替换顺序建议(阶段 3+,每步一个提交)

1. #1 #5 #6(纯样式,零逻辑)→ 冒烟 + 截图
2. #2 #3(侧栏与窗口钮)→ 折叠/窗口控制手测
3. #4(搜索胶囊)→ 冒烟搜索项
4. #7(右键菜单)→ 逐菜单项手测
5. #11(滚动条策略)→ 全页面目测
6. #9 #10(播放栏与业务页玻璃化,逐页提交)
7. #12 视需要

## 明确不移植(阶段 2 结论)

- SVG 折射 real 模式、MR WebGL 霓虹背景、壁纸轮播/视频背景、导航拖拽排序(高复杂度,阶段 1 已标记排除)
- Chakra UI / i18next / react-router(NexBox 依赖;Yachiyo 用状态导航 + 自研令牌,阶段 2 无需引入)
- NexBox 业务页面(游戏工具域)
