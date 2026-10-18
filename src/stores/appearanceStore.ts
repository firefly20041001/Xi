// 液态玻璃外观状态(移植自 NexBox 的 background/theme-color 上下文):
// 壁纸模式与模糊、液态玻璃开关、强调色。全部持久化到 localStorage。
import { create } from 'zustand'

export interface WallpaperPreset {
  id: string
  name: string
  light: string // CSS background
  dark: string
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'sakura',
    name: '樱色晨光',
    light: 'linear-gradient(135deg, #ffd9e8 0%, #c7d2fe 45%, #bae6fd 100%)',
    dark: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'
  },
  {
    id: 'sky',
    name: '晴空',
    light: 'linear-gradient(135deg, #bae6fd 0%, #e0f2fe 40%, #fdf2f8 100%)',
    dark: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #334155 100%)'
  },
  {
    id: 'mint',
    name: '薄荷',
    light: 'linear-gradient(135deg, #ccfbf1 0%, #d1fae5 45%, #ecfccb 100%)',
    dark: 'linear-gradient(135deg, #042f2e 0%, #134e4a 55%, #1f2937 100%)'
  },
  {
    id: 'violet',
    name: '暮紫',
    light: 'linear-gradient(135deg, #e9d5ff 0%, #c7d2fe 50%, #bfdbfe 100%)',
    dark: 'linear-gradient(135deg, #2e1065 0%, #1e1b4b 55%, #111827 100%)'
  }
]

export const ACCENT_PRESETS = [
  { id: 'coral', name: '珊瑚', color: '#ff214f' },
  { id: 'blue', name: '海蓝', color: '#0a84ff' },
  { id: 'green', name: '青柠', color: '#10b981' },
  { id: 'purple', name: '紫罗兰', color: '#bf5af2' },
  { id: 'amber', name: '琥珀', color: '#f59e0b' }
]

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
  presetId: 'sakura',
  customUrl: '',
  customName: '',
  backgroundBlur: 0,
  liquidGlass: true,
  glassBlur: 18,
  accent: '#ff214f',

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
        set({
          wallpaperMode: saved.wallpaperMode ?? 'preset',
          presetId: saved.presetId ?? 'sakura',
          customName: saved.customName ?? '',
          backgroundBlur: saved.backgroundBlur ?? 0,
          liquidGlass: saved.liquidGlass ?? true,
          glassBlur: saved.glassBlur ?? 18,
          accent: saved.accent ?? '#ff214f'
        })
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
