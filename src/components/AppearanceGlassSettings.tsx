// 液态玻璃外观设置:壁纸(预设/自定义图片)、背景模糊、液态玻璃开关、
// 玻璃模糊度、强调色预设。自定义图片以会话内 object URL 引用。
import React, { useRef } from 'react'
import { ImagePlus, RefreshCw, Droplets, Palette } from 'lucide-react'
import { useAppearanceStore, WALLPAPER_PRESETS, ACCENT_PRESETS } from '../stores/appearanceStore'
import { Icon } from '../m3/Icon'

export function AppearanceGlassSettings() {
  const s = useAppearanceStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const url = URL.createObjectURL(f)
    s.setCustom(url, f.name)
  }

  return (
    <>
      <h2 className="settings-section-title">
        <ImagePlus size={20} /> 液态玻璃外观
      </h2>
      <div className="settings-group">
        <div className="setting-item">
          <div className="setting-label">
            <span>壁纸</span>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              自定义图片为会话级引用,重启应用后需重新选择
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '4px 0 10px' }}>
          {WALLPAPER_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => s.setPresetId(p.id)}
              title={p.name}
              style={{
                width: 92,
                height: 56,
                borderRadius: 12,
                border:
                  s.wallpaperMode === 'preset' && s.presetId === p.id
                    ? '2px solid var(--nb-accent)'
                    : '1px solid var(--border-color)',
                background:
                  document.documentElement.getAttribute('data-theme') === 'dark' ? p.dark : p.light,
                cursor: 'pointer',
                fontSize: 12,
                color: '#1a1a1a',
                textShadow: '0 1px 2px rgba(255,255,255,0.6)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '0 0 10px', alignItems: 'center' }}>
          <button
            onClick={() => fileRef.current?.click()}
            className="btn btn-ghost btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ImagePlus size={15} /> 自定义图片…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onPickFile}
          />
          {s.wallpaperMode === 'custom' && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {s.customName || '未选择'}
            </span>
          )}
        </div>

        <div className="setting-item">
          <div className="setting-label">
            <span>壁纸模糊</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RefreshCw size={14} style={{ color: 'var(--text-tertiary)' }} />
            <input
              type="range"
              min={0}
              max={30}
              value={s.backgroundBlur}
              onChange={(e) => s.setBackgroundBlur(Number(e.target.value))}
              style={{ width: 180, accentColor: 'var(--nb-accent)' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', width: 34 }}>
              {s.backgroundBlur}px
            </span>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-label">
            <span>液态玻璃</span>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              关闭后面板使用高不透明实底
            </div>
          </div>
          <button
            onClick={() => s.setLiquidGlass(!s.liquidGlass)}
            style={{
              width: 44,
              height: 24,
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              background: s.liquidGlass ? 'var(--nb-accent)' : 'var(--border-color)'
            }}
            aria-label="切换液态玻璃"
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: s.liquidGlass ? 23 : 3,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left .18s ease'
              }}
            />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-label">
            <span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Droplets size={15} /> 玻璃模糊度
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range"
              min={4}
              max={40}
              value={s.glassBlur}
              onChange={(e) => s.setGlassBlur(Number(e.target.value))}
              style={{ width: 180, accentColor: 'var(--nb-accent)' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', width: 34 }}>
              {s.glassBlur}px
            </span>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-label">
            <span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Palette size={15} /> 强调色
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {ACCENT_PRESETS.map((a) => (
              <button
                key={a.id}
                title={a.name}
                onClick={() => s.setAccent(a.color)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border:
                    s.accent.toLowerCase() === a.color
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
      </div>
    </>
  )
}

// 避免未使用告警(Icon 在部分构建路径下可能被摇树)
void Icon
