import { create } from 'zustand'
import { MusicSource } from '@shared/types/streaming'

export type Theme = 'dark' | 'light'
export type ViewMode = 'full' | 'mini'

interface UIState {
  theme: Theme
  viewMode: ViewMode
  sidebarCollapsed: boolean
  showLyrics: boolean
  showNowPlaying: false
  activePage: string
  searchQuery: string
  searchSource: MusicSource | null

  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setViewMode: (mode: ViewMode) => void
  toggleSidebar: () => void
  toggleLyrics: () => void
  setActivePage: (page: string) => void
  setSearchQuery: (query: string, source?: MusicSource) => void
  clearSearchQuery: () => void

  settingsSection: string | null          // 一次性跳段请求:设置页消费后清空
  requestSettingsSection: (section: string) => void
  consumeSettingsSection: () => void

  mainHidden: boolean                     // 主窗不可见(×收托盘/最小化):整树 display:none + WebView2 修剪内存
  trayParked: boolean                     // 仅 ×收进托盘:为真时卸载整棵页面树,托盘恢复时还原
  setMainHidden: (v: boolean) => void
  setTrayParked: (v: boolean) => void
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: (localStorage.getItem('theme') as Theme) || 'dark',
  viewMode: 'full',
  sidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
  showLyrics: false,
  showNowPlaying: false,
  activePage: 'home',
  searchQuery: '',
  searchSource: null,

  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },

  toggleTheme: () => {
    const { theme } = get()
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    set({ theme: newTheme })
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed
      localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed))
      return { sidebarCollapsed }
    }),
  toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
  setActivePage: (page) => set({ activePage: page }),
  setSearchQuery: (query, source) => set({ searchQuery: query, searchSource: source || null }),
  clearSearchQuery: () => set({ searchQuery: '', searchSource: null }),

  settingsSection: null,
  requestSettingsSection: (section) => set({ activePage: 'settings', settingsSection: section }),
  consumeSettingsSection: () => set({ settingsSection: null }),

  mainHidden: false,
  setMainHidden: (v) => set({ mainHidden: v }),

  trayParked: false,
  setTrayParked: (v) => set({ trayParked: v })
}))
