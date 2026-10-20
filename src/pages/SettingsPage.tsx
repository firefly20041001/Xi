// 设置页(NexBox 式双栏):左侧 180px 分类导航,右侧内容区一次渲染一个分类。
// 模块 = 灰色小标签 + 圆角玻璃卡 + 行布局(左说明/右控件,行间分隔线)。
// 主题/强调色/壁纸/玻璃的持久化与 store 接口保持不变。
import { WallpaperGlassSettings } from '../components/AppearanceGlassSettings'
import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Moon, Sun, Monitor, Info, Type, Eye, EyeOff, Lock, Unlock, Keyboard, RotateCcw, Palette, Volume2, Speaker, RefreshCw, SlidersHorizontal, Upload } from 'lucide-react'
import { registerFontFace } from '../utils/fonts'
import { useUIStore } from '../stores/uiStore'
import { useAppearanceStore, ACCENT_PRESETS, DEFAULT_ACCENT } from '../stores/appearanceStore'
import { useLocalLibraryStore } from '../stores/localLibraryStore'
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

function ModuleCard({ label, index = 0, children }: { label: string; index?: number; children: React.ReactNode }) {
  return (
    <>
      <motion.div
        className="settings-module-label"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut', delay: 0.04 * index }}
      >
        {label}
      </motion.div>
      <motion.div
        initial={{ y: 10 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut', delay: 0.04 * index }}
      >
        <GlassPanel intensity="medium" className="settings-section" fadeUp fadeDelay={0.04 * index}>
          {children}
        </GlassPanel>
      </motion.div>
    </>
  )
}

export function SettingsPage() {
  const { theme, setTheme } = useUIStore()
  const accent = useAppearanceStore((s) => s.accent)
  const setAccent = useAppearanceStore((s) => s.setAccent)
  const appFont = useAppearanceStore((s) => s.appFont)
  const customFonts = useAppearanceStore((s) => s.customFonts)

  // 导入字体:Rust 拷贝落盘 + 授权,注册 @font-face 后并入清单(rust settings 持久化)
  const importFont = async () => {
    try {
      const f = await window.api.fonts.import()
      if (!f) return
      registerFontFace(f.name, f.path)
      const next = [...customFonts.filter((c) => c.name !== f.name), f]
      useAppearanceStore.getState().setCustomFonts(next)
      await window.api.settings.set('fonts.custom', next)
    } catch (e) {
      console.error('[Settings] font import failed:', e)
    }
  }
  const [activeCategory, setActiveCategory] = useState('playback')
  const requestedSection = useUIStore((s) => s.settingsSection)
  const consumeSettingsSection = useUIStore((s) => s.consumeSettingsSection)
  // 外部入口(悬浮歌词设置按钮)的一次性跳段:应用后清空,不影响常规导航
  useEffect(() => {
    if (!requestedSection) return
    setActiveCategory(requestedSection)
    consumeSettingsSection()
  }, [requestedSection, consumeSettingsSection])
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
  const [scanDepth, setScanDepth] = useState(5)
  const [nickname, setNickname] = useState('')
  const [winUser, setWinUser] = useState('')
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [minimizeOnStartup, setMinimizeOnStartup] = useState(false)
  const [lyrics, setLyrics] = useState({
    enabled: false, fontSize: 28, fontFamily: 'default', lines: 2, align: 'center',
    color: '#ffffff', textOpacity: 1,
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
    window.api.settings
      .get('local.scanDepth', 5)
      .then((v) => setScanDepth(typeof v === 'number' ? Math.min(5, Math.max(0, Math.floor(v))) : 5))
    window.api.settings.get('settings.nickname', '').then((v) => setNickname(typeof v === 'string' ? v : ''))
    window.api.settings.getWindowsUsername().then((u) => setWinUser(typeof u === 'string' ? u : '')).catch(() => {})
    window.api.settings.get('autoLaunch', false).then((v) => {
      // 键与 Rust 端(app_set_autolaunch/setup 恢复)一致;实际系统自启注册由 Rust 启动时恢复,
      // 前端这里绝不回调 setAutoLaunch —— 否则主窗加载的误判会反转系统设置
      setAutoLaunch(!!v)
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
        <motion.aside
          className="settings-nav"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
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
        </motion.aside>

        {/* 右侧内容区:一次只渲染当前分类;key 切换重挂载,只做位移入场(避免祖先 opacity
            切断玻璃 backdrop-filter),淡入由各玻璃卡片自身(fadeUp)承担 */}
        <motion.div
          className="settings-content"
          key={activeCategory}
          initial={{ y: 14 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
          {activeCategory === 'playback' && (
            <>
              <ModuleCard label="播放恢复" index={0}>
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

              <ModuleCard label="窗口行为" index={1}>
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
                        // 写注册表 + Rust 内部统一记 KV('autoLaunch'),前端不再重复落键
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
            <ModuleCard label="音频" index={0}>
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
                    </div>
                  </div>
                )}
                <div className="setting-item">
                  <div className="setting-label">
                    <span>扫描本地音乐文件夹到第 N 层</span>
                    <span className="setting-desc">递归扫描的层数(0~5),0 = 仅所选文件夹本身;修改后自动重扫曲库</span>
                  </div>
                  <div className="theme-selector" style={{ flexWrap: 'wrap' }}>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className={`theme-btn ${scanDepth === n ? 'theme-btn-active' : ''}`}
                        onClick={async () => {
                          setScanDepth(n)
                          await window.api.settings.set('local.scanDepth', n)
                          void useLocalLibraryStore.getState().rescan()
                        }}
                      >
                        {n === 0 ? '仅本级' : `${n} 层`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </ModuleCard>
          )}

          {activeCategory === 'appearance' && (
            <>
              <ModuleCard label="问候称呼" index={0}>
                <div className="settings-group">
                  <div className="setting-item">
                    <div className="setting-label">
                      <span>对你的称呼</span>
                      <span className="setting-desc">首页问候语「Hi XX 今日为你推荐」里的名字;留空使用 Windows 登录用户名</span>
                    </div>
                    <input
                      value={nickname}
                      maxLength={16}
                      placeholder={winUser || '希'}
                      onChange={(e) => {
                        setNickname(e.target.value)
                        void window.api.settings.set('settings.nickname', e.target.value)
                      }}
                      style={{
                        width: 220, padding: '6px 10px', borderRadius: 8, fontSize: 13,
                        border: '1px solid rgba(128,128,128,0.35)',
                        background: 'rgba(127,127,127,0.14)', color: 'inherit', outline: 'none'
                      }}
                    />
                  </div>
                </div>
              </ModuleCard>

              <ModuleCard label="主题" index={0}>
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

              <ModuleCard label="强调色" index={1}>
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

              <ModuleCard label="壁纸与玻璃" index={2}>
                <WallpaperGlassSettings />
              </ModuleCard>

              <ModuleCard label="全局字体" index={3}>
                <div className="settings-group">
                  <div className="setting-item">
                    <div className="setting-label">
                      <span>界面字体</span>
                      <span className="setting-desc">默认内置 MiSans;可导入字体文件(ttf/otf/ttc/woff/woff2)立即生效</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        className="dlw-select"
                        value={appFont}
                        onChange={(e) => useAppearanceStore.getState().setAppFont(e.target.value)}
                      >
                        <option value="default">MiSans · 内置</option>
                        <option value="system">系统默认</option>
                        {[{ v: '"Microsoft YaHei"', l: '微软雅黑' }, { v: 'DengXian', l: '等线' }, { v: 'SimHei', l: '黑体' }, { v: 'SimSun', l: '宋体' }, { v: 'KaiTi', l: '楷体' }, { v: 'FangSong', l: '仿宋' }].map((f) => (
                          <option key={f.v} value={f.v}>{f.l}</option>
                        ))}
                        {customFonts.length > 0 && (
                          <optgroup label="导入的字体">
                            {customFonts.map((f) => (
                              <option key={f.name} value={f.name}>{f.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <button className="btn btn-ghost btn-sm" onClick={() => void importFont()} style={{ flexShrink: 0 }}>
                        <Upload size={14} /> 导入字体
                      </button>
                    </div>
                  </div>
                </div>
              </ModuleCard>
            </>
          )}

          {activeCategory === 'hotkeys' && (
            <ModuleCard label="全局快捷键" index={0}>
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
            <ModuleCard label="桌面悬浮歌词" index={0}>
              <div className="settings-group">
                <div className="setting-item">
                  <div className="setting-label"><span>悬浮歌词</span><span className="setting-desc">在桌面显示浮动歌词窗口</span></div>
                  <button className={`theme-btn ${lyrics.enabled ? 'theme-btn-active' : ''}`} onClick={handleLyricsToggle}>
                    {lyrics.enabled ? <><Eye size={16} /> 已开启</> : <><EyeOff size={16} /> 已关闭</>}
                  </button>
                </div>

                {lyrics.enabled && (
                  <>
                    <div className="setting-item">
                      <div className="setting-label"><span>行数</span><span className="setting-desc">双行显示当前句译文(无译文回退下一句)</span></div>
                      <div className="theme-selector">
                        {[{ v: 2, l: '双行显示' }, { v: 1, l: '单行显示' }].map((o) => (
                          <button key={o.v} className={`theme-btn ${lyrics.lines === o.v ? 'theme-btn-active' : ''}`}
                            onClick={() => updateLyrics('lines', o.v)}>{o.l}</button>
                        ))}
                      </div>
                    </div>

                    <div className="setting-item">
                      <div className="setting-label"><span>对齐</span></div>
                      <div className="theme-selector">
                        {[{ v: 'center', l: '居中对齐' }, { v: 'left', l: '左对齐' }, { v: 'right', l: '右对齐' }].map((o) => (
                          <button key={o.v} className={`theme-btn ${lyrics.align === o.v ? 'theme-btn-active' : ''}`}
                            onClick={() => updateLyrics('align', o.v)}>{o.l}</button>
                        ))}
                      </div>
                    </div>

                    <div className="setting-item">
                      <div className="setting-label">
                        <span>字体字号</span>
                        <span className="setting-desc">拖拽悬浮窗右下角自由调大小,字号随高度自适应</span>
                      </div>
                      <div className="theme-selector">
                        <select className="dlw-select"
                          value={lyrics.fontFamily}
                          onChange={(e) => updateLyrics('fontFamily', e.target.value)}>
                          {[{ v: 'default', l: 'MiSans · 内置' }, { v: 'system', l: '系统默认' }, { v: '"Microsoft YaHei"', l: '微软雅黑' }, { v: 'DengXian', l: '等线' }, { v: 'SimHei', l: '黑体' }, { v: 'SimSun', l: '宋体' }, { v: 'KaiTi', l: '楷体' }, { v: 'FangSong', l: '仿宋' }].map((f) => (
                            <option key={f.v} value={f.v}>{f.l}</option>
                          ))}
                          {customFonts.length > 0 && (
                            <optgroup label="导入的字体">
                              {customFonts.map((f) => (
                                <option key={f.name} value={f.name}>{f.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <select className="dlw-select"
                          value={String(lyrics.fontSize)}
                          onChange={(e) => updateLyrics('fontSize', Number(e.target.value))}>
                          {(() => {
                            const base = [16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 56, 64]
                            const cur = Number(lyrics.fontSize) || 28
                            const list = base.includes(cur) ? base : [...base, cur].sort((a, b) => a - b)
                            return list.map((s) => (
                              <option key={s} value={String(s)}>{s}</option>
                            ))
                          })()}
                        </select>
                      </div>
                    </div>

                    <div className="setting-item">
                      <div className="setting-label"><span>颜色</span></div>
                      <div className="theme-selector">
                        {['#ffffff', '#000000', '#f5a7ca', '#c39bff', '#8ad6ff', '#9be7a2', '#ffd93d', '#ff9a9e'].map((c) => (
                          <button key={c} className={`theme-btn ${lyrics.color?.toLowerCase() === c.toLowerCase() ? 'theme-btn-active' : ''}`}
                            onClick={() => updateLyrics('color', c)}
                            style={{ width: 26, height: 26, padding: 0, background: c, borderRadius: '50%', border: lyrics.color?.toLowerCase() === c.toLowerCase() ? '2px solid var(--accent-primary)' : '2px solid var(--border-color)' }} />
                        ))}
                        <input
                          type="color"
                          aria-label="自定义字色"
                          className="dlw-color-input"
                          value={/^#[0-9a-fA-F]{6}$/.test(lyrics.color || '') ? lyrics.color : '#ffffff'}
                          onChange={(e) => updateLyrics('color', e.target.value)} />
                      </div>
                    </div>

                    <div className="setting-item">
                      <div className="setting-label"><span>粗体</span></div>
                      <button className={`theme-btn ${lyrics.bold ? 'theme-btn-active' : ''}`} onClick={() => updateLyrics('bold', !lyrics.bold)}>
                        {lyrics.bold ? '粗体' : '常规'}
                      </button>
                    </div>
                  </>
                )}

                <div className="setting-item">
                  <div className="setting-label"><span>文字透明度</span><span className="setting-desc">{Math.round((lyrics.textOpacity ?? 1) * 100)}%</span></div>
                  <input type="range" min="0.3" max="1" step="0.05" value={lyrics.textOpacity ?? 1}
                    onChange={(e) => updateLyrics('textOpacity', parseFloat(e.target.value))} style={{ width: 160 }} />
                </div>

                {lyrics.enabled && (
                  <>
                    <div className="setting-item">
                      <div className="setting-label"><span>锁定位置</span></div>
                      <button className={`theme-btn ${lyrics.locked ? 'theme-btn-active' : ''}`} onClick={() => updateLyrics('locked', !lyrics.locked)}>
                        {lyrics.locked ? <><Lock size={16} /> 已锁定</> : <><Unlock size={16} /> 未锁定</>}
                      </button>
                    </div>

                    <div className="setting-item">
                      <div className="setting-label"><span>圆角</span><span className="setting-desc">{lyrics.borderRadius}px(仅未锁定气泡)</span></div>
                      <input type="range" min="0" max="32" step="2" value={lyrics.borderRadius}
                        onChange={(e) => updateLyrics('borderRadius', parseInt(e.target.value))} style={{ width: 160 }} />
                    </div>

                    {/* 预览:按当前配置渲染(样式与悬浮窗同规则) */}
                    <div className="setting-item">
                      <div className="setting-label"><span>预览</span></div>
                      <div
                        style={{
                          flex: 1,
                          padding: '14px 18px',
                          borderRadius: lyrics.locked ? 0 : `${lyrics.borderRadius}px`,
                          background: lyrics.locked ? 'transparent' : 'rgba(0,0,0,0.3)',
                          textAlign: lyrics.align as 'center' | 'left' | 'right',
                          maxWidth: 480,
                          color: lyrics.color
                        }}
                      >
                        <div style={{
                          fontSize: lyrics.fontSize,
                          fontWeight: lyrics.bold ? 700 : 400,
                          color: lyrics.color,
                          opacity: lyrics.textOpacity ?? 1,
                          textShadow: lyrics.textShadow ? '0 2px 10px rgba(0,0,0,0.55)' : undefined,
                          lineHeight: 1.32,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                          就像歌词出现在桌面一样
                        </div>
                        {lyrics.lines === 2 && (
                          <div style={{
                            fontSize: Math.max(12, Math.round(lyrics.fontSize * 0.62)),
                            fontWeight: lyrics.bold ? 600 : 400,
                            color: lyrics.color,
                            opacity: (lyrics.textOpacity ?? 1) * 0.92,
                            textShadow: lyrics.textShadow ? '0 2px 8px rgba(0,0,0,0.55)' : undefined,
                            lineHeight: 1.32,
                            marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            第二行显示翻译或下一句
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ModuleCard>
          )}

          {activeCategory === 'about' && (
            <ModuleCard label="关于" index={0}>
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
        </motion.div>
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
