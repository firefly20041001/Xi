// 设置页(NexBox 式双栏):左侧 180px 分类导航,右侧内容区一次渲染一个分类。
// 模块 = 灰色小标签 + 圆角玻璃卡 + 行布局(左说明/右控件,行间分隔线)。
// 主题/强调色/壁纸/玻璃的持久化与 store 接口保持不变。
import { WallpaperGlassSettings } from '../components/AppearanceGlassSettings'
import React, { useState, useEffect } from 'react'
import { Moon, Sun, Monitor, Info, Type, Eye, EyeOff, Lock, Unlock, Keyboard, RotateCcw, Palette, Volume2, Speaker, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useAppearanceStore, ACCENT_PRESETS, DEFAULT_ACCENT } from '../stores/appearanceStore'
import { GlassPanel } from '../components/common/GlassPanel'
import { ColorWheel } from '../components/common/ColorWheel'

interface AudioDevice {
  deviceId: string
  label: string
  isDefault: boolean
}

const ACTION_LABELS: Record<string, string> = {
  togglePlay: '播放/暂停',
  next: '下一首',
  prev: '上一首',
  volumeUp: '增大音量',
  volumeDown: '减小音量',
  toggleLyrics: '显示/隐藏歌词'
}

const SETTINGS_CATEGORIES = [
  { id: 'playback', label: '通用', icon: SlidersHorizontal },
  { id: 'audio', label: '音频', icon: Speaker },
  { id: 'appearance', label: '外观', icon: Monitor },
  { id: 'hotkeys', label: '全局快捷键', icon: Keyboard },
  { id: 'lyrics', label: '桌面悬浮歌词', icon: Type },
  { id: 'about', label: '关于', icon: Info }
]

function ModuleCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="settings-module-label">{label}</div>
      <GlassPanel intensity="medium" className="settings-section">
        {children}
      </GlassPanel>
    </>
  )
}

export function SettingsPage() {
  const { theme, setTheme } = useUIStore()
  const accent = useAppearanceStore((s) => s.accent)
  const setAccent = useAppearanceStore((s) => s.setAccent)
  const [activeCategory, setActiveCategory] = useState('playback')
  const [closeAction, setCloseAction] = useState('minimize')
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState('')
  const [themeColor, setThemeColor] = useState(DEFAULT_ACCENT)
  const [showColorWheel, setShowColorWheel] = useState(false)
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [currentDevice, setCurrentDevice] = useState('default')
  const [followSystem, setFollowSystem] = useState(true)
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [minimizeOnStartup, setMinimizeOnStartup] = useState(false)
  const [lyrics, setLyrics] = useState({
    enabled: false, fontSize: 28, fontFamily: 'PingFang SC', color: '#ffffff',
    bgColor: 'rgba(0,0,0,0.3)', opacity: 0.9, translationEnabled: true,
    locked: false, bold: true, borderRadius: 16, textShadow: true
  })

  const loadAudioDevices = async () => {
    try {
      const devices = await window.api.devices.getAudioOutput()
      setAudioDevices(devices)
      const current = await window.api.devices.getCurrentOutput()
      setCurrentDevice(current)
    } catch {}
  }

  useEffect(() => {
    window.api.settings.get('settings.closeAction', 'minimize').then((v) => setCloseAction(v))
    // 主题色双入口收敛:曾经自定义过取色轮颜色 → 让它成为统一强调色;
    // 从未自定义过 → 展示与 appearanceStore.accent 一致。两种情况都不重置用户存储。
    window.api.settings.get('settings.themeColor', DEFAULT_ACCENT).then((v) => {
      const legacy = typeof v === 'string' && v ? v : DEFAULT_ACCENT
      const isDefault = legacy.toUpperCase() === '#DE89A8' || legacy.toUpperCase() === DEFAULT_ACCENT.toUpperCase()
      if (!isDefault) {
        if (legacy.toLowerCase() !== useAppearanceStore.getState().accent.toLowerCase()) {
          useAppearanceStore.getState().setAccent(legacy)
        }
        setThemeColor(legacy)
      } else {
        setThemeColor(useAppearanceStore.getState().accent)
      }
    })
    window.api.settings.get('settings.followSystemDevice', true).then((v) => setFollowSystem(v))
    window.api.settings.get('settings.autoLaunch', false).then((v) => {
      setAutoLaunch(v)
      // Apply on startup
      window.api.settings.setAutoLaunch(v).catch(() => {})
    })
    window.api.settings.get('settings.minimizeOnStartup', false).then((v) => setMinimizeOnStartup(v))
    window.api.lyricsWindow.getSettings().then((s) => setLyrics(prev => ({ ...prev, ...s })))
    window.api.shortcuts.get().then((s) => setShortcuts(s))
    window.api.lyricsWindow.onSettingsChanged((s) => setLyrics(prev => ({ ...prev, ...s })))

    // Load audio devices
    loadAudioDevices()
    window.api.devices.startListening()
    window.api.devices.onChanged(() => loadAudioDevices())
  }, [])

  useEffect(() => {
    if (!editingKey) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const parts: string[] = []
      if (e.ctrlKey) parts.push('CommandOrControl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Super')

      const key = e.key
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        // Map special keys
        const keyMap: Record<string, string> = {
          'ArrowRight': 'Right', 'ArrowLeft': 'Left', 'ArrowUp': 'Up', 'ArrowDown': 'Down',
          ' ': 'Space', 'Enter': 'Return', 'Escape': 'Escape', 'Backspace': 'Backspace',
          'Delete': 'Delete', 'Tab': 'Tab', 'Home': 'Home', 'End': 'End',
          'PageUp': 'PageUp', 'PageDown': 'PageDown',
          'F1':'F1','F2':'F2','F3':'F3','F4':'F4','F5':'F5','F6':'F6',
          'F7':'F7','F8':'F8','F9':'F9','F10':'F10','F11':'F11','F12':'F12'
        }
        parts.push(keyMap[key] || key.toUpperCase())

        const combo = parts.join('+')
        setShortcuts(prev => ({ ...prev, [editingKey]: combo }))
        window.api.shortcuts.set({ [editingKey]: combo })
        setEditingKey(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editingKey])

  // 取色轮与预设强调色统一写 appearanceStore(--nb-accent 及派生变量),
  // 旧的内联 --accent-primary 覆盖已移除,避免两套强调色分叉。
  const handleThemeColorChange = async (color: string) => {
    setThemeColor(color)
    await window.api.settings.set('settings.themeColor', color)
    setAccent(color)
  }

  const handleResetShortcuts = async () => {
    const defaults = await window.api.shortcuts.reset()
    setShortcuts(defaults)
  }

  const CURRENT_VERSION = __APP_VERSION__

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setUpdateStatus('检查中...')
    try {
      const res = await fetch('https://api.github.com/repos/firefly20041001/yachiyo/releases/latest')
      const data = await res.json()
      const latestVersion = (data.tag_name || '').replace('v', '').replace('V', '')

      if (latestVersion && latestVersion !== CURRENT_VERSION) {
        setUpdateStatus(`发现新版本 v${latestVersion}`)
        window.open(data.html_url)
      } else {
        setUpdateStatus('已是最新版本')
      }
    } catch {
      setUpdateStatus('检查失败，请稍后重试')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleCloseActionChange = async (action: string) => {
    setCloseAction(action)
    await window.api.settings.set('settings.closeAction', action)
  }

  const handleLyricsToggle = async () => {
    const newVal = !lyrics.enabled
    setLyrics(prev => ({ ...prev, enabled: newVal }))
    await window.api.lyricsWindow.setSetting('enabled', newVal)
    if (newVal) await window.api.lyricsWindow.show()
    else await window.api.lyricsWindow.hide()
  }

  const updateLyrics = async (key: string, value: any) => {
    setLyrics(prev => ({ ...prev, [key]: value }))
    await window.api.lyricsWindow.setSetting(key, value)
  }

  return (
    <div className="page settings-page">
      <div className="settings-layout">
        {/* 左侧分类导航(NexBox 设置子菜单形态) */}
        <aside className="settings-nav">
          <div className="settings-nav-title">设置</div>
          {SETTINGS_CATEGORIES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`settings-nav-item ${activeCategory === id ? 'active' : ''}`}
              onClick={() => setActiveCategory(id)}
            >
              <Icon size={17} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </aside>

        {/* 右侧内容区:一次只渲染当前分类(不做过渡动画,防止 backdrop-filter 失效) */}
        <div className="settings-content" key={activeCategory}>
          {activeCategory === 'playback' && (
            <>
              <ModuleCard label="播放恢复">
                <div className="settings-group">
                  <div className="setting-item">
                    <div className="setting-label">
                      <span>恢复播放列表</span>
                      <span className="setting-desc">启动时恢复上次播放列表</span>
                    </div>
                    <button className="theme-btn theme-btn-active">已开启</button>
                  </div>
                  <div className="setting-item">
                    <div className="setting-label">
                      <span>恢复播放进度</span>
                      <span className="setting-desc">恢复到上次播放的位置</span>
                    </div>
                    <button className="theme-btn theme-btn-active">已开启</button>
                  </div>
                  <div className="setting-item">
                    <div className="setting-label">
                      <span>自动继续播放</span>
                      <span className="setting-desc">启动后自动继续播放</span>
                    </div>
                    <button className="theme-btn theme-btn-active">已开启</button>
                  </div>
                  <div className="setting-item">
                    <div className="setting-label">
                      <span>恢复输出设备</span>
                      <span className="setting-desc">恢复上次选择的音频输出设备</span>
                    </div>
                    <button className="theme-btn theme-btn-active">已开启</button>
                  </div>
                </div>
              </ModuleCard>

              <ModuleCard label="窗口行为">
                <div className="settings-group">
                  <div className="setting-item">
                    <div className="setting-label"><span>关闭按钮行为</span><span className="setting-desc">点击关闭按钮时的操作</span></div>
                    <div className="theme-selector">
                      <button className={`theme-btn ${closeAction === 'minimize' ? 'theme-btn-active' : ''}`} onClick={() => handleCloseActionChange('minimize')}>最小化到托盘</button>
                      <button className={`theme-btn ${closeAction === 'exit' ? 'theme-btn-active' : ''}`} onClick={() => handleCloseActionChange('exit')}>退出应用</button>
                    </div>
                  </div>
                  <div className="setting-item">
                    <div className="setting-label">
                      <span>开机自启</span>
                      <span className="setting-desc">开机时自动启动播放器</span>
                    </div>
                    <button
                      className={`theme-btn ${autoLaunch ? 'theme-btn-active' : ''}`}
                      onClick={async () => {
                        const newVal = !autoLaunch
                        setAutoLaunch(newVal)
                        await window.api.settings.set('settings.autoLaunch', newVal)
                        await window.api.settings.setAutoLaunch(newVal)
                      }}
                    >
                      {autoLaunch ? '已开启' : '已关闭'}
                    </button>
                  </div>
                </div>
              </ModuleCard>
            </>
          )}

          {activeCategory === 'audio' && (
            <ModuleCard label="音频">
              <div className="settings-group">
                <div className="setting-item">
                  <div className="setting-label">
                    <span>跟随系统默认设备</span>
                    <span className="setting-desc">开启后始终使用系统默认输出设备</span>
                  </div>
                  <button
                    className={`theme-btn ${followSystem ? 'theme-btn-active' : ''}`}
                    onClick={async () => {
                      const newVal = !followSystem
                      setFollowSystem(newVal)
                      await window.api.settings.set('settings.followSystemDevice', newVal)
                      if (newVal) {
                        await window.api.devices.setAudioOutput('default')
                        setCurrentDevice('default')
                      }
                    }}
                  >
                    {followSystem ? '已开启' : '已关闭'}
                  </button>
                </div>
                {!followSystem && (
                  <div className="setting-item">
                    <div className="setting-label">
                      <span>输出设备</span>
                      <span className="setting-desc">选择音频输出设备</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 300 }}>
                      {audioDevices.map((device) => (
                        <button
                          key={device.deviceId}
                          className={`theme-btn ${currentDevice === device.deviceId ? 'theme-btn-active' : ''}`}
                          onClick={async () => {
                            const success = await window.api.devices.setAudioOutput(device.deviceId)
                            if (success) setCurrentDevice(device.deviceId)
                          }}
                          style={{ justifyContent: 'flex-start', fontSize: 12 }}
                        >
                          <Volume2 size={14} />
                          {device.label || '未知设备'}
                          {device.isDefault && ' (系统默认)'}
                        </button>
                      ))}
                      <button className="btn btn-ghost btn-sm" onClick={loadAudioDevices} style={{ marginTop: 4 }}>
                        <RefreshCw size={14} /> 刷新设备列表
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        💡 切换设备后切歌生效
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </ModuleCard>
          )}

          {activeCategory === 'appearance' && (
            <>
              <ModuleCard label="主题">
                <div className="settings-group">
                  <div className="setting-item">
                    <div className="setting-label"><span>主题模式</span><span className="setting-desc">选择深色或浅色主题</span></div>
                    <div className="theme-selector">
                      <button className={`theme-btn ${theme === 'dark' ? 'theme-btn-active' : ''}`} onClick={() => setTheme('dark')}><Moon size={16} /> 深色</button>
                      <button className={`theme-btn ${theme === 'light' ? 'theme-btn-active' : ''}`} onClick={() => setTheme('light')}><Sun size={16} /> 浅色</button>
                    </div>
                  </div>
                </div>
              </ModuleCard>

              <ModuleCard label="强调色">
                <div className="settings-group">
                  <div className="setting-item">
                    <div className="setting-label">
                      <span>预设强调色</span>
                      <span className="setting-desc">应用于侧栏、按钮、滑块与选中态</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {ACCENT_PRESETS.map((a) => (
                        <button
                          key={a.id}
                          title={a.name}
                          onClick={() => handleThemeColorChange(a.color)}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 9,
                            border:
                              accent.toLowerCase() === a.color.toLowerCase()
                                ? '2px solid var(--text-primary)'
                                : '2px solid transparent',
                            background: a.color,
                            cursor: 'pointer'
                          }}
                          aria-label={`强调色 ${a.name}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="setting-item">
                    <div className="setting-label">
                      <span><Palette size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />自定义颜色</span>
                      <span className="setting-desc">点击色块打开取色轮盘</span>
                    </div>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                      onClick={() => setShowColorWheel(true)}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 9, background: themeColor, border: '2px solid var(--border-color)' }} />
                      <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{themeColor}</span>
                    </div>
                  </div>
                </div>
              </ModuleCard>

              <ModuleCard label="壁纸与玻璃">
                <WallpaperGlassSettings />
              </ModuleCard>
            </>
          )}

          {activeCategory === 'hotkeys' && (
            <ModuleCard label="全局快捷键">
              <div className="settings-group">
                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                  <div className="setting-item" key={key}>
                    <div className="setting-label"><span>{label}</span></div>
                    <div className="shortcut-input-row">
                      <button
                        className={`shortcut-btn ${editingKey === key ? 'shortcut-btn-editing' : ''}`}
                        onClick={() => setEditingKey(editingKey === key ? null : key)}
                      >
                        {editingKey === key ? '按下快捷键...' : (shortcuts[key] || '未设置')}
                      </button>
                    </div>
                  </div>
                ))}
                <div className="setting-item">
                  <div className="setting-label"><span></span></div>
                  <button className="btn btn-ghost" onClick={handleResetShortcuts}>
                    <RotateCcw size={16} /> 恢复默认
                  </button>
                </div>
              </div>
            </ModuleCard>
          )}

          {activeCategory === 'lyrics' && (
            <ModuleCard label="桌面悬浮歌词">
              <div className="settings-group">
                <div className="setting-item">
                  <div className="setting-label"><span>悬浮歌词</span><span className="setting-desc">在桌面显示浮动歌词窗口</span></div>
                  <button className={`theme-btn ${lyrics.enabled ? 'theme-btn-active' : ''}`} onClick={handleLyricsToggle}>
                    {lyrics.enabled ? <><Eye size={16} /> 已开启</> : <><EyeOff size={16} /> 已关闭</>}
                  </button>
                </div>

                    <div className="setting-item">
                      <div className="setting-label"><span>锁定位置</span></div>
                      <button className={`theme-btn ${lyrics.locked ? 'theme-btn-active' : ''}`} onClick={() => updateLyrics('locked', !lyrics.locked)}>
                        {lyrics.locked ? <><Lock size={16} /> 已锁定</> : <><Unlock size={16} /> 未锁定</>}
                      </button>
                    </div>
                    <div className="setting-item">
                      <div className="setting-label"><span>字体大小</span></div>
                      <div className="theme-selector">
                        {[20, 24, 28, 32, 36, 40].map((s) => (
                          <button key={s} className={`theme-btn ${lyrics.fontSize === s ? 'theme-btn-active' : ''}`} onClick={() => updateLyrics('fontSize', s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div className="setting-item">
                      <div className="setting-label"><span>字体粗细</span></div>
                      <button className={`theme-btn ${lyrics.bold ? 'theme-btn-active' : ''}`} onClick={() => updateLyrics('bold', !lyrics.bold)}>
                        {lyrics.bold ? '粗体' : '常规'}
                      </button>
                    </div>
                    <div className="setting-item">
                      <div className="setting-label"><span>歌词颜色</span></div>
                      <div className="theme-selector">
                        {['#ffffff', '#000000', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff9a9e', '#a18cd1', '#fbc2eb'].map((c) => (
                          <button key={c} className={`theme-btn ${lyrics.color === c ? 'theme-btn-active' : ''}`}
                            onClick={() => updateLyrics('color', c)}
                            style={{ width: 28, height: 28, background: c, borderRadius: '50%', border: lyrics.color === c ? '2px solid var(--accent-primary)' : '2px solid transparent' }} />
                        ))}
                      </div>
                    </div>
                    <div className="setting-item">
                      <div className="setting-label"><span>背景</span></div>
                      <div className="theme-selector">
                        {[
                          { label: '半透明黑', value: 'rgba(0,0,0,0.3)' },
                          { label: '深黑', value: 'rgba(0,0,0,0.6)' },
                          { label: '半透明白', value: 'rgba(255,255,255,0.2)' },
                          { label: '无', value: 'transparent' }
                        ].map((i) => (
                          <button key={i.value} className={`theme-btn ${lyrics.bgColor === i.value ? 'theme-btn-active' : ''}`}
                            onClick={() => updateLyrics('bgColor', i.value)}>{i.label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="setting-item">
                      <div className="setting-label"><span>圆角</span><span className="setting-desc">{lyrics.borderRadius}px</span></div>
                      <input type="range" min="0" max="32" step="2" value={lyrics.borderRadius}
                        onChange={(e) => updateLyrics('borderRadius', parseInt(e.target.value))} style={{ width: 160 }} />
                    </div>
                    <div className="setting-item">
                      <div className="setting-label"><span>透明度</span><span className="setting-desc">{Math.round(lyrics.opacity * 100)}%</span></div>
                      <input type="range" min="0.3" max="1" step="0.05" value={lyrics.opacity}
                        onChange={(e) => updateLyrics('opacity', parseFloat(e.target.value))} style={{ width: 160 }} />
                    </div>
                    <div className="setting-item">
                      <div className="setting-label"><span>文字阴影</span></div>
                      <button className={`theme-btn ${lyrics.textShadow ? 'theme-btn-active' : ''}`} onClick={() => updateLyrics('textShadow', !lyrics.textShadow)}>
                        {lyrics.textShadow ? '开启' : '关闭'}
                      </button>
                    </div>
              </div>
            </ModuleCard>
          )}

          {activeCategory === 'about' && (
            <ModuleCard label="关于">
              <div className="settings-group">
                <div className="setting-item"><div className="setting-label"><span>版本</span></div><span className="setting-value">{CURRENT_VERSION}</span></div>
                <div className="setting-item"><div className="setting-label"><span>技术栈</span></div><span className="setting-value">Tauri + React + TypeScript</span></div>
                <div className="setting-item">
                  <div className="setting-label">
                    <span>检查更新</span>
                    <span className="setting-desc">{updateStatus}</span>
                  </div>
                  <button className="btn btn-primary" onClick={handleCheckUpdate} disabled={checkingUpdate}>
                    {checkingUpdate ? '检查中...' : '检查更新'}
                  </button>
                </div>
              </div>
            </ModuleCard>
          )}
        </div>
      </div>

      {/* Color Wheel Modal */}
      {showColorWheel && (
        <div className="modal-overlay" onClick={() => setShowColorWheel(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <GlassPanel intensity="heavy" className="color-wheel-modal">
              <h3 style={{ marginBottom: 16, textAlign: 'center' }}>选择主题色</h3>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <ColorWheel color={themeColor} onChange={handleThemeColorChange} size={220} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: themeColor, border: '2px solid var(--border-color)' }} />
                <span style={{ fontSize: 14, fontFamily: 'monospace' }}>{themeColor}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowColorWheel(false)}>确定</button>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => handleThemeColorChange(DEFAULT_ACCENT)}>恢复默认</button>
              </div>
            </GlassPanel>
          </div>
        </div>
      )}
    </div>
  )
}
