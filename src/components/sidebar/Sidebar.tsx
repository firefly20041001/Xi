// 64px 悬浮图标导航条(NexBox sidebar 形态):
// fixed left:6px 垂直居中,玻璃圆角容器,48px 图标钮,active = 强调色实底。
// 文字以 aria-label + 视觉隐藏 span + NBTooltip 承载;主题切换与账号状态点保留在底部。
import React from 'react'
import {
  Home,
  Search,
  Library,
  ListMusic,
  Clock,
  User,
  Settings,
  Moon,
  Sun
} from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useAccountStore } from '../../stores/accountStore'
import { NBTooltip } from '../../nexbox-ui/nb'

const NAV_ITEMS = [
  { id: 'home', label: '首页', Icon: Home },
  { id: 'search', label: '搜索', Icon: Search },
  { id: 'library', label: '音乐库', Icon: Library },
  { id: 'playlists', label: '歌单', Icon: ListMusic },
  { id: 'history', label: '播放历史', Icon: Clock },
  { id: 'account', label: '账号', Icon: User },
  { id: 'settings', label: '设置', Icon: Settings }
]

export function Sidebar() {
  const { activePage, setActivePage, theme, toggleTheme } = useUIStore()
  const accounts = useAccountStore((s) => s.accounts)

  return (
    <aside
      className="nb-glass-panel"
      style={{
        position: 'fixed',
        left: 6,
        top: '50%',
        transform: 'translateY(-50%) translateZ(0)',
        zIndex: 40,
        width: 64,
        borderRadius: 16,
        padding: '10px 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        boxShadow: 'var(--md-elev-2, 0 4px 14px rgba(0,0,0,.12))'
      }}
    >
      {/* 顶部品牌图标(点击回首页) */}
      <NBTooltip label="Yachiyo">
        <button
          aria-label="Yachiyo"
          onClick={() => setActivePage('home')}
          style={{
            width: 48,
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 14,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0
          }}
        >
          <img
            src="/icon.png"
            alt=""
            draggable={false}
            style={{ width: 32, height: 32, borderRadius: 8 }}
          />
        </button>
      </NBTooltip>

      {/* 导航(视觉隐藏的文字供测试/无障碍定位) */}
      <nav
        aria-label="主导航"
        style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, width: '100%' }}
      >
        {NAV_ITEMS.map(({ id, label, Icon: ItemIcon }) => {
          const active = activePage === id
          return (
            <NBTooltip key={id} label={label}>
              <button
                className="nav-item"
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                onClick={() => setActivePage(id)}
                style={{
                  position: 'relative',
                  width: 48,
                  height: 48,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 14,
                  border: 'none',
                  cursor: 'pointer',
                  background: active ? 'var(--nb-accent-active)' : 'transparent',
                  color: active ? 'var(--nb-accent-contrast)' : 'var(--text-secondary)',
                  transition: `background var(--nbf-dur-fast, 0.15s) ease`
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--nb-accent-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent'
                }}
              >
                <ItemIcon size={21} strokeWidth={2.1} />
                <span
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    overflow: 'hidden',
                    clip: 'rect(0 0 0 0)'
                  }}
                >
                  {label}
                </span>
              </button>
            </NBTooltip>
          )
        })}
      </nav>

      {/* 底部:账号状态点 + 主题切换 */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--nb-glass-border)',
          width: '100%'
        }}
      >
        <div
          title="账号状态(网易云 / QQ音乐)"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}
        >
          <span
            className={`account-dot ${accounts.netease ? 'account-dot-active netease' : ''}`}
            style={{ width: 8, height: 8, display: 'block' }}
          />
          <span
            className={`account-dot ${accounts.qqmusic ? 'account-dot-active qqmusic' : ''}`}
            style={{ width: 8, height: 8, display: 'block' }}
          />
        </div>
        <NBTooltip label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}>
          <button
            aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            onClick={toggleTheme}
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--nbf-radius-full, 999px)',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--nb-accent-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </NBTooltip>
      </div>
    </aside>
  )
}
