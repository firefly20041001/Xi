import React, { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Layout } from './app/Layout'
import { HomePage } from './pages/HomePage'
import { SearchPage } from './pages/SearchPage'
import { LibraryPage } from './pages/LibraryPage'
import { PlaylistPage } from './pages/PlaylistPage'
import { AccountPage } from './pages/AccountPage'
import { SettingsPage } from './pages/SettingsPage'
import { HistoryPage } from './pages/HistoryPage'
import { LocalMusicPage } from './pages/LocalMusicPage'
import { useAccountStore } from './stores/accountStore'
import { usePlaylistStore } from './stores/playlistStore'
import { useUIStore } from './stores/uiStore'
import { usePlaybackStore } from './stores/playbackStore'
import { initAudio, restoreLastTrack, togglePlay, nextTrack, prevTrack, setVolume } from './utils/audio'
import { LOCAL_DEFAULT_COVER } from './utils/cover'

let trayActionWired = false
const trayShortcutsWired = () => { const w = window as any; if (w.__trayShortcutsWired) return true; w.__trayShortcutsWired = true; return false }

// 应用生命周期监听只注册一次（StrictMode 双挂载防重）：
// 托盘事件 + 玻璃菜单动作 + 全局快捷键，全部在模块级接线。
function wireAppEvents() {
  if (trayShortcutsWired() || typeof window === 'undefined' || !(window as any).api) return


  window.api.tray.onTogglePlay(() => togglePlay())
  window.api.tray.onNext(() => nextTrack())
  window.api.tray.onPrev(() => prevTrack())
  window.api.tray.onOpenSettings(() => useUIStore.getState().setActivePage('settings'))

  window.api.shortcuts.onTogglePlay(() => togglePlay())
  window.api.shortcuts.onNext(() => nextTrack())
  window.api.shortcuts.onPrev(() => prevTrack())
  window.api.shortcuts.onVolumeUp(() => {
    setVolume(Math.min(1, usePlaybackStore.getState().volume + 0.05))
  })
  window.api.shortcuts.onVolumeDown(() => {
    setVolume(Math.max(0, usePlaybackStore.getState().volume - 0.05))
  })
  window.api.shortcuts.onToggleLyrics(() => {
    window.api.lyricsWindow.toggle()
  })

  // 关闭主窗口:依据 settings.closeAction 处理——
  // 'minimize'(默认):隐藏到托盘,后台继续播放(Rust close() 先发 CloseRequested,
  //   标题栏按钮与 Alt+F4 都走此处,preventDefault 阻止销毁承载 <audio> 的 webview);
  // 'exit':调用 tray_quit 整体退出。
  try {
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      const win = getCurrentWindow()
      void win.onCloseRequested(async (ev) => {
        // preventDefault 必须在 handler 返回前同步调用
        ev.preventDefault()
        try {
          const action = await window.api.settings.get('settings.closeAction', 'minimize')
          if (action === 'exit') {
            void import('@tauri-apps/api/core').then(({ invoke }) => invoke('tray_quit'))
          } else {
            void win.hide()
          }
        } catch {
          void win.hide()
        }
      })
    })
  } catch { /* non-tauri env */ }

  try {
    void listen('tray:action', (e) => {
      const a = (e.payload as { type: string; value?: unknown }) || { type: '' }
      switch (a.type) {
        case 'togglePlay': togglePlay(); break
        case 'prev': prevTrack(); break
        case 'next': nextTrack(); break
        case 'volume': setVolume(typeof a.value === 'number' ? a.value : 0.7); break
        case 'lyrics': void window.api.lyricsWindow.toggle(); break
        case 'showMain': {
          // 主窗口自行拉起(隐藏时 webview 仍可收到事件):不依赖新 Rust 命令,
          // 也不受 minimizeOnStartup 开机偏好影响
          void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
            const w = getCurrentWindow()
            void w.show()
            void w.unminimize()
            void w.setFocus()
          })
          break
        }
        case 'settings': {
          useUIStore.getState().setActivePage('settings')
          void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
            void getCurrentWindow().setFocus()
          })
          break
        }
        default: break
      }
    })
  } catch { /* non-tauri env */ }
}

function TrayAndShortcutHandler() {
  const currentTrack = usePlaybackStore((s) => s.currentTrack)

  useEffect(() => {
    initAudio()
    restoreLastTrack()
    wireAppEvents()
  }, [])

  useEffect(() => {
    // 托盘玻璃菜单:播放状态/主题/外观变化 → 广播（签名去重 + 节流）
    // 注意：歌词可见性不在此广播——由 Rust 侧 tray:lyrics-visible 直接推给托盘窗口
    let lastSig = ''
    let lastSent = 0
    const syncTray = async () => {
      try {
        const { emit } = await import('@tauri-apps/api/event')
        const s = usePlaybackStore.getState()
        const cur = s.currentTrack
        const appearance = (() => { try { return JSON.parse(localStorage.getItem('nb.appearance') || '{}') } catch { return {} } })()
        void emit('tray:state', {
          isPlaying: s.isPlaying,
          trackName: cur?.name || '未播放',
          artist: (cur?.artists || []).join(', '),
          volume: s.volume,
          theme: useUIStore.getState().theme,
          accent: appearance.accent || '#98DDD0',
          liquidGlass: appearance.liquidGlass ?? true,
          glassBlur: appearance.glassBlur ?? 18
        })
      } catch { /* non-tauri env */ }
    }
    const maybeSyncTray = () => {
      const s = usePlaybackStore.getState()
      const cur = s.currentTrack
      const sig = [
        s.isPlaying, cur?.name || '', (cur?.artists || []).join(','),
        s.volume.toFixed(2), useUIStore.getState().theme,
        (() => { try { const a = JSON.parse(localStorage.getItem('nb.appearance') || '{}'); return `${a.accent}|${a.liquidGlass}|${a.glassBlur}` } catch { return '' } })()
      ].join('|')
      const now = Date.now()
      if (sig === lastSig && now - lastSent < 5000) return
      lastSig = sig
      lastSent = now
      void syncTray()
    }
    const unsubPlayback = usePlaybackStore.subscribe(() => { void maybeSyncTray() })
    const unsubUi = useUIStore.subscribe(() => { void maybeSyncTray() })
    // 歌词窗可见性变化也同步（Rust 侧广播）
    let unLyrics: (() => void) | undefined
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen('tray:lyrics-visible', () => { void maybeSyncTray() }).then((un) => { unLyrics = un })
    })

    return () => {
      unsubPlayback()
      unsubUi()
      unLyrics?.()
    }
  }, [])

  useEffect(() => {
    if (currentTrack) {
      window.api.tray.updateTrack(currentTrack.name, currentTrack.artists?.join(', ') || '')
      // 无封面曲目回退应用图标(托盘窗口同域解析)
      window.api.tray.updateCover(currentTrack.albumCoverUrl || LOCAL_DEFAULT_COVER)
    } else {
      window.api.tray.updateTrack('未播放', '')
      window.api.tray.updateCover('')
    }
  }, [currentTrack])

  return null
}

export default function App() {
  const { activePage, setActivePage } = useUIStore()
  const { loadAccounts } = useAccountStore()
  const { theme } = useUIStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    loadAccounts()
    usePlaylistStore.getState().refreshPlaylists()
  }, [])

  const renderPage = () => {
    switch (activePage) {
      case 'home': return <HomePage onNavigate={setActivePage} />
      case 'search': return <SearchPage />
      case 'library': return <LibraryPage />
      case 'playlists': return <PlaylistPage />
      case 'history': return <HistoryPage />
      case 'local': return <LocalMusicPage />
      case 'account': return <AccountPage />
      case 'settings': return <SettingsPage />
      default: return <HomePage onNavigate={setActivePage} />
    }
  }

  return (
    <>
      <TrayAndShortcutHandler />
      <Layout>
        {renderPage()}
      </Layout>
    </>
  )
}
