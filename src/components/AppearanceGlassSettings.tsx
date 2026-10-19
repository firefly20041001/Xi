// 壁纸与玻璃设置(设置页「外观」分类的一个模块卡内容):
// 壁纸(预设缩略图/自定义图片)、壁纸模糊、液态玻璃开关、玻璃模糊度(同时决定歌曲背板)。
// 自定义图片以会话内 object URL 引用;存储与 appearanceStore 保持不变。
import React, { useRef } from 'react'
import { ImagePlus, Check } from 'lucide-react'
import { useAppearanceStore, WALLPAPER_PRESETS } from '../stores/appearanceStore'

export function WallpaperGlassSettings() {
  const s = useAppearanceStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const url = URL.createObjectURL(f)
    s.setCustom(url, f.name)
  }

  const scheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'

  return (
    <div className="settings-group">
      <div className="setting-item">
        <div className="setting-label">
          <span>壁纸</span>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            自定义图片为会话级引用,重启应用后需重新选择
          </div>
        </div>
      </div>
      <div className="wallpaper-grid">
        {WALLPAPER_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => s.setPresetId(p.id)}
            title={p.name}
            className={`wallpaper-thumb ${s.wallpaperMode === 'preset' && s.presetId === p.id ? 'wallpaper-thumb-active' : ''}`}
            style={{ background: scheme === 'dark' ? p.dark : p.light }}
          >
            <span className="wallpaper-thumb-name">{p.name}</span>
            {s.wallpaperMode === 'preset' && s.presetId === p.id && (
              <span className="wallpaper-thumb-check">
                <Check size={11} strokeWidth={3} />
              </span>
            )}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '0 0 6px', alignItems: 'center' }}>
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
          <span>玻璃模糊度</span>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            面板与歌曲背板共用:越大越磨砂,背板也越浓
          </div>
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
          <span>液态玻璃</span>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            关闭后面板使用高不透明实底
          </div>
        </div>
        <button
          onClick={() => s.setLiquidGlass(!s.liquidGlass)}
          className={`nb-switch ${s.liquidGlass ? 'nb-switch-on' : ''}`}
          role="switch"
          aria-checked={s.liquidGlass}
          aria-label="切换液态玻璃"
        >
          <span className="nb-switch-thumb" />
        </button>
      </div>
    </div>
  )
}
