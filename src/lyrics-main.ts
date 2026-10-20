// 桌面悬浮歌词入口(lyrics.html)——QQ音乐风格重置版:
// - 单行/双行:双行第二行为当前句译文(固定开启),无译文时回退下一句原文
// - 对齐:居中/左/右;字体;粗体;文字透明度
// - 窗口大小:未锁定时拖右下手柄自由调节(宽度跟手),字号贴合窗口高度自适应并写回设置
// - 颜色:未播放字色,不做已播放字色(整行单色)、不做描边
// - 背景:未锁定=半透明黑气泡,锁定=无背景(纯文字悬浮);圆角由设置驱动
// - 悬停控制条:上一首/播放暂停/下一首 | 锁定/设置/关闭(事件经 tray:action 回主窗口)
// - 锁定由 Rust 侧 set_ignore_cursor_events 实现,锁定时整窗忽略鼠标
import './api/install'
import { listen, emit } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { currentMonitor } from '@tauri-apps/api/window'
import { PhysicalSize } from '@tauri-apps/api/dpi'

interface DlwSettings {
  fontSize: number
  fontFamily: string
  lines: number          // 1=单行 2=双行
  align: 'center' | 'left' | 'right'
  color: string          // 未播放字色(整行唯一色,无已播放渐变)
  bold: boolean
  textOpacity: number    // 仅作用于文字,不含气泡底
  borderRadius: number
  textShadow: boolean    // 兼容保留:额外柔影
  locked: boolean
}

const DEFAULTS: DlwSettings = {
  fontSize: 28,
  fontFamily: 'default',
  lines: 2,
  align: 'center',
  color: '#ffffff',
  bold: true,
  textOpacity: 1,
  borderRadius: 16,
  textShadow: true,
  locked: false
}

const api = (window as any).api

// 导入字体:悬浮窗文档也要注册 @font-face,族名才能被字体样式引用
import { CUSTOM_FONTS_KEY, registerFontFace, CustomFont } from './utils/fonts'

async function registerImportedFonts() {
  try {
    const list = await api.settings.get(CUSTOM_FONTS_KEY, [])
    ;(Array.isArray(list) ? list : []).forEach((f: CustomFont) => registerFontFace(f.name, f.path))
  } catch { /* 无字体清单按空处理 */ }
}
void registerImportedFonts()

const dlw = document.getElementById('dlw')!
const currentEl = document.getElementById('dlw-current')!
const secondEl = document.getElementById('dlw-second')!
const controlsEl = document.getElementById('dlw-controls')!

let settings: DlwSettings = { ...DEFAULTS }
let isPlaying = false
let lastUpdate = { line: '', translation: '', next: '' }

// ---------- 控制条(内联 SVG,悬停出现) ----------

const ICONS: Record<string, string> = {
  prev: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2.2v14H6zM20 5v14L10.5 12z"/></svg>',
  play: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z"/></svg>',
  next: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M18 5h-2.2v14H18zM4 5v14l9.5-7z"/></svg>',
  lock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0"/></svg>',
  unlock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-1.9"/></svg>',
  settings: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15 1.7 1.7 0 0 0 3.09 14H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64 1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.34.4.62.73.78.26.13.55.2.84.22H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/></svg>',
  close: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg>'
}

function makeCtl(id: string, svgKey: string, title: string, cls = ''): HTMLButtonElement {
  const b = document.createElement('button')
  b.id = id
  b.className = `dlw-ctl ${cls}`
  b.title = title
  b.innerHTML = ICONS[svgKey]
  return b
}

const prevBtn = makeCtl('ctl-prev', 'prev', '上一首')
const playBtn = makeCtl('ctl-play', 'play', '播放/暂停', 'dlw-ctl-play')
const nextBtn = makeCtl('ctl-next', 'next', '下一首')
const sepEl = document.createElement('span')
sepEl.className = 'dlw-sep'
const lockBtn = makeCtl('ctl-lock', 'unlock', '锁定(设置页解锁)')
const settingsBtn = makeCtl('ctl-settings', 'settings', '设置')
const closeBtn = makeCtl('ctl-close', 'close', '关闭')
controlsEl.append(prevBtn, playBtn, nextBtn, sepEl, lockBtn, settingsBtn, closeBtn)

function act(type: string) {
  void emit('tray:action', { type })
}

prevBtn.addEventListener('click', () => act('prev'))
nextBtn.addEventListener('click', () => act('next'))
playBtn.addEventListener('click', () => act('togglePlay'))
settingsBtn.addEventListener('click', () => act('lyricsSettings')) // 设置页直接落到「桌面悬浮歌词」分区
closeBtn.addEventListener('click', () => {
  api.lyricsWindow.setSetting('enabled', false)
  api.lyricsWindow.hide()
})
lockBtn.addEventListener('click', () => {
  const next = !settings.locked
  api.lyricsWindow.setSetting('locked', next)
  settings = { ...settings, locked: next }
  renderLock()
})
function renderLock() {
  lockBtn.innerHTML = ICONS[settings.locked ? 'lock' : 'unlock']
  lockBtn.title = settings.locked ? '已锁定(在设置页解锁)' : '锁定(设置页解锁)'
  dlw.classList.toggle('dlw-locked', settings.locked)
}

// ---------- 歌词数据 ----------

api.lyricsWindow.onUpdate((data: { line: string; translation?: string; next?: string }) => {
  lastUpdate = { line: data.line || '', translation: data.translation || '', next: data.next || '' }
  renderLines()
})

function renderLines() {
  if (lastUpdate.line) {
    currentEl.textContent = lastUpdate.line
    currentEl.classList.remove('dlw-empty')
  } else {
    currentEl.textContent = '暂无歌词'
    currentEl.classList.add('dlw-empty')
  }
  // 第二行(双行):优先当前句译文(固定开启),无译文回退下一句原文;单行不显示
  let second = ''
  if (settings.lines === 2) {
    second = lastUpdate.translation || lastUpdate.next || ''
  }
  secondEl.textContent = second
  secondEl.classList.toggle('dlw-hidden', !second)
}

// 播放状态:主窗口广播(Rust app.emit 全局可见)
void listen<{ isPlaying?: boolean }>('tray:state', (e) => {
  if (typeof e.payload?.isPlaying === 'boolean') {
    isPlaying = e.payload.isPlaying
    playBtn.innerHTML = ICONS[isPlaying ? 'pause' : 'play']
  }
})

// ---------- 窗口大小(完全由用户拖拽决定)与字号手动档位 ----------
// 尺寸公式与 lyrics.html 布局同源:外框上下留白 26 + 控制行预留带 34,行高 1.32,次行比例 0.62

const appWin = getCurrentWebviewWindow()
let draggingSize = false

function applyFontStyles(size: number) {
  currentEl.style.fontSize = `${size}px`
  secondEl.style.fontSize = `${Math.max(12, Math.round(size * 0.62))}px`
  const fam = settings.fontFamily
  currentEl.style.fontFamily =
    fam === 'system'
      ? '\'Segoe UI\', \'Microsoft YaHei\', sans-serif'
      : fam && fam !== 'default'
        ? fam.includes(' ') || /^[0-9]/.test(fam) ? `"${fam}"` : fam // 导入族名带空格/数字开头要包引号
        : '\'MiSans\', \'Segoe UI\', \'Microsoft YaHei\', sans-serif'
  secondEl.style.fontFamily = currentEl.style.fontFamily
  currentEl.style.fontWeight = settings.bold ? '700' : '400'
  secondEl.style.fontWeight = settings.bold ? '600' : '400'
}

// 内容高度估算(与 CSS 布局同源),仅在内容超出用户拖好的高度时用于"只长不缩"兜底
function contentHeightCss(size: number): number {
  const secondH = settings.lines === 2 ? 2 + Math.max(12, Math.round(size * 0.62)) * 1.32 : 0
  return Math.ceil(12 + 34 + 14 + size * 1.32 + secondH)
}

let fitTimer = 0
function fitHeight() {
  if (draggingSize) return // 拖拽期间窗口大小由用户决定
  window.clearTimeout(fitTimer)
  fitTimer = window.setTimeout(() => {
    void (async () => {
      try {
        // 只长不缩:拖小的窗口保持原样;字号加大导致内容放不下时按内容撑高
        const neededCss = Math.max(72, contentHeightCss(Number(settings.fontSize) || 28))
        const sf = await appWin.scaleFactor()
        const cur = await appWin.innerSize()
        const needPhys = Math.round(neededCss * sf)
        if (needPhys > cur.height + 2) {
          await appWin.setSize(new PhysicalSize(cur.width, needPhys))
          forceRepaint()
        }
      } catch { /* 窗口可能正在关闭 */ }
    })()
  }, 120)
}

// Windows 透明窗 setSize 后新合成区域可能留白底残影:强制整帧重绘
function forceRepaint() {
  document.body.style.transform = 'translateZ(0)'
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { document.body.style.transform = '' })
  })
}

// 拖拽改窗口高度 → 字号贴合高度反推(公式与 fit 同源;拖拽期间窗口大小不再被反改,无反馈环)
function deriveFontFromHeight(hCss: number) {
  const lines2 = settings.lines === 2
  const fixed = 12 + 34 + 14 + (lines2 ? 2 : 0)
  const coeff = lines2 ? 1.32 + 0.62 * 1.32 : 1.32
  const size = Math.max(12, Math.min(96, Math.round((hCss - fixed) / coeff)))
  if (size !== settings.fontSize) {
    settings.fontSize = size
    applyFontStyles(size)
  }
}

// 右下拖拽手柄:未锁定时自由拖拽定窗口大小(宽度完全跟手),字号贴合窗口高度自适应
const grip = document.getElementById('dlw-grip')!
grip.addEventListener('pointerdown', (e) => {
  if (settings.locked || draggingSize || e.button !== 0) return
  draggingSize = true
  grip.setPointerCapture(e.pointerId)
  void (async () => {
    try {
      const sf = await appWin.scaleFactor()
      const cur = await appWin.innerSize()
      const startX = e.clientX
      const startY = e.clientY
      let pending: { w: number; h: number } | null = null
      let rafId = 0
      const flush = () => {
        rafId = 0
        if (pending) {
          const { w, h } = pending
          pending = null
          void appWin.setSize(new PhysicalSize(w, h)).catch(() => {})
          deriveFontFromHeight(h / sf)
        }
      }
      const move = (ev: PointerEvent) => {
        // rAF 合帧:与浏览器刷新率同步节流,规避高频 set_size 造成的透明窗合成残影
        pending = {
          w: Math.max(320, cur.width + Math.round((ev.clientX - startX) * sf)),
          h: Math.max(72, cur.height + Math.round((ev.clientY - startY) * sf))
        }
        if (!rafId) rafId = requestAnimationFrame(flush)
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        cancelAnimationFrame(rafId)
        pending = {
          w: Math.max(320, cur.width + Math.round((ev.clientX - startX) * sf)),
          h: Math.max(72, cur.height + Math.round((ev.clientY - startY) * sf))
        }
        flush()
        draggingSize = false
        forceRepaint()
        // 提交一次:贴合窗口高度的字号写回设置存档(设置页同步)
        api.lyricsWindow.setSetting('fontSize', Number(settings.fontSize))
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up, { once: true })
    } catch {
      draggingSize = false
    }
  })()
})

// ---------- 顶边检测:窗口贴住屏幕上边时,悬停控制行翻转到歌词下方 ----------
// 预约带(34px)是布局常量,翻转只交换 padding 方向,总高度与内容不变

let topEdgeTimer = 0
async function checkTopEdge() {
  try {
    const pos = await appWin.outerPosition()
    const sf = await appWin.scaleFactor()
    const mon = await currentMonitor()
    const monTop = mon ? mon.position.y : 0
    const distCss = (pos.y - monTop) / sf
    dlw.classList.toggle('dlw-at-top', distCss <= 6)
  } catch { /* 窗口可能正在关闭 */ }
}
function scheduleTopEdge() {
  window.clearTimeout(topEdgeTimer)
  topEdgeTimer = window.setTimeout(() => { void checkTopEdge() }, 80)
}
// 拖动窗口时持续检测
void appWin.onMoved(() => scheduleTopEdge())

// ---------- 设置应用 ----------

function applySettings(s: Partial<DlwSettings>) {
  settings = {
    ...settings,
    ...(s as DlwSettings),
    lines: [1, 2].includes(Number(s.lines)) ? Number(s.lines) : settings.lines
  }

  const root = document.documentElement
  const size = Number(settings.fontSize) || 28
  root.style.setProperty('--dlw-color', settings.color || '#ffffff')
  applyFontStyles(size)

  dlw.style.textAlign = settings.align || 'center'
  // 背景:未锁定=半透明黑气泡;锁定=无背景(纯文字悬浮,窗口整层强制透明)
  const effectiveBg = settings.locked ? 'transparent' : 'rgba(0,0,0,0.3)'
  dlw.style.background = effectiveBg
  dlw.style.borderRadius = effectiveBg === 'transparent' ? '0' : `${Number(settings.borderRadius) || 16}px`
  dlw.style.backdropFilter = effectiveBg === 'transparent' ? 'none' : 'blur(18px) saturate(160%)'
  ;(dlw.style as any).webkitBackdropFilter = dlw.style.backdropFilter
  // 兜底:窗口各层透明,绝不残留底色
  root.style.background = 'transparent'
  document.body.style.background = 'transparent'

  // 文字透明度仅作用于文字行(气泡底色不受影响)
  currentEl.style.opacity = String(settings.textOpacity)
  secondEl.style.opacity = String(Math.min(1, (settings.textOpacity || 1) * 0.92))

  currentEl.style.textShadow = settings.textShadow ? '0 2px 10px rgba(0,0,0,0.55)' : 'none'
  secondEl.style.textShadow = settings.textShadow ? '0 2px 8px rgba(0,0,0,0.55)' : 'none'

  renderLock()
  renderLines()
  fitHeight()
  scheduleTopEdge()
}

api.lyricsWindow.onSettings((s: Partial<DlwSettings>) => applySettings(s))
api.lyricsWindow.getSettings().then((s: Partial<DlwSettings>) => applySettings(s))
