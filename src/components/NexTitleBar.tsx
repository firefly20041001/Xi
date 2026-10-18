// 48px 全宽标题栏(NexBox title-bar.tsx 结构):
// 整栏为拖拽区(data-tauri-drag-region),右侧窗口控制圆钮排除拖拽。
// 替换原生装饰:tauri.conf.json 需 decorations:false(本批唯一窗口配置变更)。
import React, { useEffect, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

function WinButton({
  children,
  title,
  onClick,
  danger
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--nbf-radius-full, 999px)',
        border: '1px solid var(--nb-glass-border)',
        background: 'var(--nbf-win-bg)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        color: 'var(--nbf-fg-window-icon)',
        cursor: 'pointer',
        transition: `background var(--nbf-dur-fast, 0.15s) ease, color var(--nbf-dur-fast, 0.15s) ease`
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = danger
          ? 'var(--nbf-close-icon-hover)'
          : 'var(--nbf-win-icon-hover)'
        if (danger) e.currentTarget.style.background = 'var(--nbf-close-hover-bg)'
        else e.currentTarget.style.background = 'var(--nbf-win-hover-bg)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--nbf-fg-window-icon)'
        e.currentTarget.style.background = 'var(--nbf-win-bg)'
      }}
    >
      {children}
    </button>
  )
}

export function NexTitleBar() {
  const [isMaximized, setIsMaximized] = React.useState(false)

  // 拖到屏幕边缘触发系统最大化/还原时,同步按钮图标
  React.useEffect(() => {
    let unlisten: (() => void) | undefined
    const win = getCurrentWindow()
    const sync = async () => setIsMaximized(await win.isMaximized())
    void sync()
    win.onResized(() => void sync()).then((u) => {
      unlisten = u
    })
    return () => {
      unlisten?.()
    }
  }, [])

  return (
    <div
      data-tauri-drag-region
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 48,
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 16,
        paddingRight: 14,
        background: 'var(--nb-glass)',
        backdropFilter: 'blur(var(--nb-glass-blur)) saturate(1.4)',
        WebkitBackdropFilter: 'blur(var(--nb-glass-blur)) saturate(1.4)',
        borderBottom: '1px solid var(--nb-glass-border)'
      }}
    >
      {/* 品牌区(可拖拽) */}
      <div
        data-tauri-drag-region
        style={{ display: 'flex', alignItems: 'center', gap: 10, userSelect: 'none' }}
      >
        <img
          src="/icon.png"
          alt=""
          draggable={false}
          style={{ width: 26, height: 26, borderRadius: 7 }}
        />
        <span
          data-tauri-drag-region
          style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)' }}
        >
          Yachiyo
        </span>
      </div>

      {/* 窗口控制(排除拖拽) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <WinButton title="最小化" onClick={() => window.api.window.minimize()}>
          <Minus size={17} strokeWidth={2.2} />
        </WinButton>
        <WinButton title={isMaximized ? '还原' : '最大化'} onClick={() => window.api.window.maximize()}>
          <Square size={14} strokeWidth={2.2} />
        </WinButton>
        <WinButton title="关闭" onClick={() => window.api.window.close()} danger>
          <X size={17} strokeWidth={2.2} />
        </WinButton>
      </div>
    </div>
  )
}
