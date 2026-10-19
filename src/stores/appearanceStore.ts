// 液态玻璃外观状态(移植自 NexBox 的 background/theme-color 上下文):
// 壁纸模式与模糊、液态玻璃开关、强调色。全部持久化到 localStorage。
import { create } from 'zustand'
import wall1 from '../../images/wall_1792144628.png'
import wall2 from '../../images/wall_1792144642.png'
import wall3 from '../../images/wall_1792148685.png'
import wall4 from '../../images/wall_1792148691.png'
import wall5 from '../../images/wall_1792220153.png'
import wall6 from '../../images/wall_1792314136.png'
import wall7 from '../../images/wall_1792314138.png'
import wall8 from '../../images/wall_1792314140.png'
import wall9 from '../../images/wall_1792314146.png'

export interface WallpaperPreset {
  id: string
  name: string
  src: string // 图片地址(缩略图与背景共用)
  light: string // CSS background(打包资源 URL,浅暗共用一图)
  dark: string
}

const cover = (src: string) => `url("${src}") center / cover no-repeat`

const WALL_SOURCES = [
  { src: wall1, name: '壁纸 1' },
  { src: wall2, name: '壁纸 2' },
  { src: wall3, name: '壁纸 3' },
  { src: wall4, name: '壁纸 4' },
  { src: wall5, name: '壁纸 5' },
  { src: wall6, name: '壁纸 6' },
  { src: wall7, name: '壁纸 7' },
  { src: wall8, name: '壁纸 8' },
  { src: wall9, name: '壁纸 9' }
]

export const WALLPAPER_PRESETS: WallpaperPreset[] = WALL_SOURCES.map((w, i) => ({
  id: `wall${i + 1}`,
  name: w.name,
  src: w.src,
  light: cover(w.src),
  dark: cover(w.src)
}))

// 预设强调色与新镜盒(NexBox)保持一致
export const ACCENT_PRESETS = [
  { id: 'cyan', name: '青色', color: '#98DDD0' },
  { id: 'blue', name: '蓝色', color: '#60A5FA' },
  { id: 'purple', name: '紫色', color: '#A78BFA' },
  { id: 'pink', name: '粉色', color: '#F472B6' },
  { id: 'orange', name: '橙色', color: '#FB923C' },
  { id: 'green', name: '绿色', color: '#4ADE80' },
  { id: 'red', name: '红色', color: '#F87171' },
  { id: 'yellow', name: '黄色', color: '#FBBF24' }
]

// 新镜盒默认强调色(青色),同时用于归一不在预设内的旧值
export const DEFAULT_ACCENT = '#98DDD0'

function darken(hex: string, ratio = 0.82): string {
  const n = hex.replace('#', '')
  const r = Math.round(parseInt(n.slice(0, 2), 16) * ratio)
  const g = Math.round(parseInt(n.slice(2, 4), 16) * ratio)
  const b = Math.round(parseInt(n.slice(4, 6), 16) * ratio)
  return `rgb(${r}, ${g}, ${b})`
}

function soft(hex: string, alpha = 0.12): string {
  const n = hex.replace('#', '')
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface AppearanceState {
  wallpaperMode: 'preset' | 'custom'
  presetId: string
  customUrl: string // session object URL
  customName: string
  backgroundBlur: number
  liquidGlass: boolean
  glassBlur: number
  accent: string
  setWallpaperMode: (m: 'preset' | 'custom') => void
  setPresetId: (id: string) => void
  setCustom: (url: string, name: string) => void
  setBackgroundBlur: (v: number) => void
  setLiquidGlass: (v: boolean) => void
  setGlassBlur: (v: number) => void
  setAccent: (color: string) => void
  init: () => void
  apply: () => void
}

function persist(state: AppearanceState) {
  localStorage.setItem(
    'nb.appearance',
    JSON.stringify({
      wallpaperMode: state.wallpaperMode,
      presetId: state.presetId,
      customName: state.customName,
      backgroundBlur: state.backgroundBlur,
      liquidGlass: state.liquidGlass,
      glassBlur: state.glassBlur,
      accent: state.accent
    })
  )
}

function applyToDom(s: AppearanceState) {
  const root = document.documentElement
  const scheme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  const bgEl = document.querySelector('.app-background') as HTMLElement | null

  let image = ''
  if (s.wallpaperMode === 'custom' && s.customUrl) {
    image = `url("${s.customUrl}") center / cover no-repeat`
  } else {
    const preset = WALLPAPER_PRESETS.find((p) => p.id === s.presetId) || WALLPAPER_PRESETS[0]
    image = scheme === 'dark' ? preset.dark : preset.light
  }
  if (bgEl) {
    bgEl.style.background = image
    bgEl.style.filter = `blur(${s.backgroundBlur}px)`
  }
  root.style.setProperty('--nb-wallpaper-blur', `${s.backgroundBlur}px`)
  root.style.setProperty('--nb-glass-blur', `${s.glassBlur}px`)
  if (!s.liquidGlass) {
    // 关闭液态玻璃:面板用高不透明实底,保留布局
    root.style.setProperty('--nb-glass', scheme === 'dark' ? 'rgba(24,24,28,0.97)' : 'rgba(255,255,255,0.97)')
    root.style.setProperty('--nb-glass-strong', scheme === 'dark' ? 'rgba(24,24,28,0.99)' : 'rgba(255,255,255,0.99)')
    root.style.setProperty('--nb-glass-border', scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')
  } else {
    root.style.setProperty('--nb-glass', scheme === 'dark' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)')
    root.style.setProperty('--nb-glass-strong', scheme === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.45)')
    root.style.setProperty('--nb-glass-border', scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)')
  }
  // 歌曲列表背板浓度与模糊统一由「玻璃模糊度」派生:
  // 模糊共用 --nb-glass-blur(见 pages.css .track-list),底色 alpha 随 glassBlur 线性变化
  // (18px 默认 ≈0.27,4px 近乎无背板,40px 最浓 ≈0.6);液态玻璃关闭时实底与面板一致
  const maskAlpha = (Math.min(40, Math.max(4, s.glassBlur)) / 40) * 0.6
  const listBg = !s.liquidGlass
    ? (scheme === 'dark' ? 'rgba(24, 24, 28, 0.97)' : 'rgba(255, 255, 255, 0.97)')
    : (scheme === 'dark' ? `rgba(0, 0, 0, ${maskAlpha})` : `rgba(255, 255, 255, ${maskAlpha})`)
  root.style.setProperty('--nb-list-bg', listBg)

  const accent = s.accent
  root.style.setProperty('--nb-accent', accent)
  root.style.setProperty('--nb-accent-hover', darken(accent, 0.86))
  root.style.setProperty('--nb-accent-contrast', contrastFor(accent))
  root.style.setProperty('--nb-accent-soft', soft(accent, 0.12))
}

function contrastFor(hex: string): string {
  const n = hex.replace('#', '')
  const r = parseInt(n.slice(0, 2), 16) / 255
  const g = parseInt(n.slice(2, 4), 16) / 255
  const b = parseInt(n.slice(4, 6), 16) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.55 ? '#1a1a1a' : '#ffffff'
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  wallpaperMode: 'preset',
  presetId: 'wall1',
  customUrl: '',
  customName: '',
  backgroundBlur: 0,
  liquidGlass: true,
  glassBlur: 18,
  accent: DEFAULT_ACCENT,

  setWallpaperMode: (m) => {
    set({ wallpaperMode: m })
    persist(get())
    get().apply()
  },
  setPresetId: (id) => {
    set({ presetId: id, wallpaperMode: 'preset' })
    persist(get())
    get().apply()
  },
  setCustom: (url, name) => {
    set({ customUrl: url, customName: name, wallpaperMode: url ? 'custom' : 'preset' })
    persist(get())
    get().apply()
  },
  setBackgroundBlur: (v) => {
    set({ backgroundBlur: v })
    persist(get())
    get().apply()
  },
  setLiquidGlass: (v) => {
    set({ liquidGlass: v })
    persist(get())
    get().apply()
  },
  setGlassBlur: (v) => {
    set({ glassBlur: v })
    persist(get())
    get().apply()
  },
  setAccent: (color) => {
    set({ accent: color })
    persist(get())
    get().apply()
  },

  init: () => {
    try {
      const raw = localStorage.getItem('nb.appearance')
      if (raw) {
        const saved = JSON.parse(raw)
        // 旧预设 id 不存在时归一到第一张,保证缩略图选中态与实际壁纸一致
        const presetId = WALLPAPER_PRESETS.some((p) => p.id === saved.presetId)
          ? saved.presetId
          : 'wall1'
        // 自定义图片是会话级引用,重启后 URL 已失效:回退到预设壁纸
        const wallpaperMode = saved.wallpaperMode === 'custom' && saved.customUrl ? 'custom' : 'preset'
        // 不在新预设列表内的旧强调色归一到默认(新镜盒青色)
        const accent = ACCENT_PRESETS.some((a) => a.color.toLowerCase() === String(saved.accent || '').toLowerCase())
          ? saved.accent
          : DEFAULT_ACCENT
        set({
          wallpaperMode,
          presetId,
          customName: saved.customName ?? '',
          backgroundBlur: saved.backgroundBlur ?? 0,
          liquidGlass: saved.liquidGlass ?? true,
          glassBlur: saved.glassBlur ?? 18,
          accent
        })
        // 归一化结果回写,避免存储中残留废弃值
        persist(get())
      }
    } catch {
      /* ignore */
    }
    new MutationObserver(() => get().apply()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })
    get().apply()
  },

  apply: () => {
    const run = () => applyToDom(get())
    const bgEl = document.querySelector('.app-background')
    if (!bgEl) {
      // React 还未挂载背景层,挂载后再应用一次
      requestAnimationFrame(() => setTimeout(run, 0))
      return
    }
    run()
  }
}))
