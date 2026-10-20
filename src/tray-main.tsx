// 托盘液态玻璃菜单(独立小窗,亚克力模糊 + 主题/强调色同步)。
// 状态由主窗口经 `tray:state` 广播;操作经 `tray:action` 发回主窗口执行。
import React, { useEffect, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { SkipBack, SkipForward, Play, Pause, Heart, Volume2, Type, Lock, LockOpen, Monitor, Settings, Power } from 'lucide-react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
import './tray.css'

interface TrayState {
  isPlaying: boolean
  trackName: string
  artist: string
  volume: number
  theme: string
  accent: string
  liquidGlass: boolean
  glassBlur: number
  lyricsVisible: boolean
  lyricsLocked: boolean
}

const DEFAULT_STATE: TrayState = {
  isPlaying: false,
  trackName: '未播放',
  artist: '',
  volume: 0.7,
  theme: 'light',
  accent: '#98DDD0',
  liquidGlass: true,
  glassBlur: 18,
  lyricsVisible: false,
  lyricsLocked: false
}

function applyAppearance(s: Pick<TrayState, 'theme' | 'accent' | 'liquidGlass' | 'glassBlur'>) {
  const root = document.documentElement
  root.setAttribute('data-theme', s.theme)
  root.style.setProperty('--nb-accent', s.accent)
  root.style.setProperty('--nb-accent-hover', s.accent)
  root.style.setProperty(
    '--nb-glass',
    s.liquidGlass ? (s.theme === 'dark' ? 'rgba(15, 18, 30, 0.55)' : 'rgba(255, 255, 255, 0.55)') : (s.theme === 'dark' ? 'rgba(24, 24, 28, 0.97)' : 'rgba(255, 255, 255, 0.97)')
  )
  root.style.setProperty('--nb-glass-border', s.theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.6)')
  root.style.setProperty('--nb-glass-blur', `${s.glassBlur}px`)
  root.style.setProperty('--nb-accent-contrast', '#ffffff')
  root.style.setProperty('--text-primary', s.theme === 'dark' ? '#ffffff' : '#1a1a1a')
  root.style.setProperty('--text-secondary', s.theme === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)')
  root.style.setProperty('--text-tertiary', s.theme === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)')
}

function TrayMenu() {
  const [st, setSt] = useState<TrayState>(DEFAULT_STATE)
  const hide = useCallback(() => { void getCurrentWebviewWindow().hide() }, [])
  const act = useCallback((type: string, value?: unknown) => {
    void listen // noop keep import
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    import('@tauri-apps/api/event').then(({ emit }) => emit('tray:action', { type, value }))
  }, [])

  // 从 Rust 读取歌词窗真实可见性与锁定态（打开菜单/获得焦点时校正徽章）
  const syncLyricsState = useCallback(async () => {
    try {
      const [v, l] = await Promise.all([
        invoke<boolean>('lyrics_window_is_visible'),
        invoke<boolean>('lyrics_window_is_locked')
      ])
      setSt((prev) => ({ ...prev, lyricsVisible: v, lyricsLocked: l }))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const win = getCurrentWebviewWindow()
    void win.onFocusChanged(({ payload: focused }) => {
      if (focused) void syncLyricsState()
      else void win.hide()
    })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') void win.hide() }
    window.addEventListener('keydown', onKey)

    const unlisten = listen<Partial<TrayState>>('tray:state', (e) => {
      setSt((prev) => {
        const next = { ...prev, ...e.payload }
        applyAppearance(next)
        return next
      })
    })
    // 歌词窗可见性：Rust 侧 show/hide/销毁都会广播
    const unlistenLyrics = listen<boolean>('tray:lyrics-visible', (e) => {
      setSt((prev) => ({ ...prev, lyricsVisible: e.payload }))
    })
    // 锁定态：托盘/悬浮窗/设置页任何一处改动都会由 Rust 广播
    const unlistenLock = listen<boolean>('tray:lyrics-locked', (e) => {
      setSt((prev) => ({ ...prev, lyricsLocked: e.payload }))
    })

    // 初始歌词徽章:查询歌词窗真实可见性
    void (async () => {
      try {
        const m = await import('/node_modules/@tauri-apps/api/webviewWindow.js')
        const lw = await m.WebviewWindow.fromLabel('lyrics')
        const v = lw ? await lw.isVisible() : false
        setSt((prev) => ({ ...prev, lyricsVisible: v }))
      } catch { /* ignore */ }
    })()

    // 初始外观:读同源 localStorage(主题与外观存储与主窗口共享)
    try {
      const theme = localStorage.getItem('theme') || 'light'
      const saved = JSON.parse(localStorage.getItem('nb.appearance') || '{}')
      const init = {
        theme,
        accent: saved.accent || '#98DDD0',
        liquidGlass: saved.liquidGlass ?? true,
        glassBlur: saved.glassBlur ?? 18
      }
      applyAppearance(init)
      setSt((p) => ({ ...p, ...init }))
    } catch { /* ignore */ }

    return () => {
      void unlisten.then((f) => f())
      void unlistenLyrics.then((f) => f())
      void unlistenLock.then((f) => f())
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const accentContrast = '#ffffff'

  return (
    <div className="tray-menu">
      {/* 播放控制行 */}
      <div className="tray-controls">
        <button className="tbtn" aria-label="上一首" onClick={() => act('prev')}>
          <SkipBack size={19} fill="currentColor" />
        </button>
        <button
          className="tbtn tbtn-play"
          aria-label={st.isPlaying ? '暂停' : '播放'}
          style={{ background: 'var(--nb-accent)', color: accentContrast }}
          onClick={() => act('togglePlay')}
        >
          {st.isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <button className="tbtn" aria-label="下一首" onClick={() => act('next')}>
          <SkipForward size={19} fill="currentColor" />
        </button>
      </div>

      {/* 曲目行 */}
      <div className="tray-track">
        <Heart size={16} style={{ color: 'var(--nb-accent)', fill: 'var(--nb-accent)', flexShrink: 0 }} />
        <div className="tray-track-text">
          <div className="tray-track-name">{st.trackName || '未播放'}</div>
          {st.artist && <div className="tray-track-artist">{st.artist}</div>}
        </div>
      </div>

      <div className="tray-divider" />

      {/* 音量行 */}
      <div className="tray-row">
        <Volume2 size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <input
          className="tray-slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={st.volume}
          onChange={(e) => act('volume', Number(e.target.value))}
          style={{ accentColor: 'var(--nb-accent)' }}
        />
        <span className="tray-vol-num">{Math.round(st.volume * 100)}</span>
      </div>

      {/* 桌面歌词：直接调 Rust 命令切换（不经主窗口，杜绝挂起时不同步）；乐观翻转徽章 */}
      <button
        className={`tray-row tray-row-btn ${st.lyricsVisible ? 'tray-row-active' : ''}`}
        onClick={() => {
          void invoke('lyrics_window_toggle')
          setSt((prev) => ({ ...prev, lyricsVisible: !prev.lyricsVisible }))
        }}
      >
        <Type size={16} style={{ flexShrink: 0 }} />
        <span>显示桌面歌词</span>
        <span className={`tray-check ${st.lyricsVisible ? 'on' : ''}`}>{st.lyricsVisible ? '开' : '关'}</span>
      </button>

      {/* 锁定/解锁桌面歌词：仅歌词窗可见时出现，直调 Rust 命令并乐观翻转徽章。
          锁定后悬浮窗整窗鼠标穿透，托盘与设置页是唯一的解锁入口 */}
      {st.lyricsVisible && (
        <button
          className={`tray-row tray-row-btn ${st.lyricsLocked ? 'tray-row-active' : ''}`}
          onClick={() => {
            void invoke('lyrics_window_toggle_lock')
            setSt((prev) => ({ ...prev, lyricsLocked: !prev.lyricsLocked }))
          }}
        >
          {st.lyricsLocked ? <Lock size={16} style={{ flexShrink: 0 }} /> : <LockOpen size={16} style={{ flexShrink: 0 }} />}
          <span>锁定桌面歌词</span>
          <span className={`tray-check ${st.lyricsLocked ? 'on' : ''}`}>{st.lyricsLocked ? '已锁' : '未锁'}</span>
        </button>
      )}

      <div className="tray-divider" />

      {/* 显示主窗口:经 tray:action 事件由主窗口自行拉起(不依赖新增 Rust 命令,
          隐藏的主窗口 webview 仍在运行、可收到事件并 show 自身) */}
      <button
        className="tray-row tray-row-btn"
        onClick={() => {
          act('showMain')
          hide()
        }}
      >
        <Monitor size={16} style={{ flexShrink: 0 }} />
        <span>显示主窗口</span>
      </button>

      {/* 设置 */}
      <button className="tray-row tray-row-btn" onClick={async () => { act('settings'); hide() }}>
        <Settings size={16} style={{ flexShrink: 0 }} />
        <span>设置</span>
      </button>

      {/* 退出 */}
      <button className="tray-row tray-row-btn tray-quit" onClick={() => { void invoke('tray_quit') }}>
        <Power size={16} style={{ flexShrink: 0 }} />
        <span>退出</span>
      </button>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<TrayMenu />)
