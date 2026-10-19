// nb-ui:NexBox 风格组件集(设计系统基座)。
// 所有视觉参数来自 nexbox-tokens.css 的 --nbf-* 令牌,
// 组件不含业务逻辑,不调用任何后端命令。
import React from 'react'
import { X, Check, ChevronRight } from 'lucide-react'

export function SymIcon({
  name,
  size = 24,
  fill = false,
  className,
  style,
}: {
  name: string
  size?: number
  fill?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span
      className={`material-symbols-rounded ${fill ? 'ms-fill' : ''} ${className || ''}`}
      style={{ fontSize: size, width: size, height: size, lineHeight: 1, ...style }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}

/* ---------- Button ---------- */

export function NBButton({
  children,
  onClick,
  variant = 'glass',
  disabled,
  title,
  type = 'button',
  danger,
}: {
  children: React.ReactNode
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  variant?: 'glass' | 'solid' | 'accent' | 'ghost'
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
  danger?: boolean
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 36,
    padding: '0 16px',
    borderRadius: 'var(--nbf-radius-full)',
    border: '1px solid transparent',
    fontSize: 13.5,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: `background var(--nbf-dur-fast) ease, color var(--nbf-dur-fast) ease, transform var(--nbf-dur-fast) ease`,
  }
  const variants: Record<string, React.CSSProperties> = {
    glass: {
      background: 'var(--nbf-glass-bg)',
      borderColor: 'var(--nbf-glass-border)',
      color: 'var(--nbf-fg)',
      backdropFilter: 'var(--nbf-blur-tooltip)'
    },
    solid: { background: 'var(--nbf-panel-solid)', color: 'var(--nbf-fg)' },
    accent: { background: 'var(--nbf-accent-active)', color: 'var(--nbf-accent-contrast)' },
    ghost: { background: 'transparent', color: 'var(--nbf-fg)' }
  }
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...variants[variant], ...(danger ? { color: 'var(--nbf-danger)' } : {}) }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = danger
          ? 'var(--nbf-danger-bg)'
          : 'var(--nbf-accent-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = variants[variant].background as string
        if (danger) e.currentTarget.style.color = 'var(--nbf-danger)'
      }}
    >
      {children}
    </button>
  )
}

/* ---------- IconButton / WindowButton ---------- */

export function NBIconButton({
  icon,
  onClick,
  title,
  size = 18,
  buttonSize = 36,
  variant = 'window',
  danger
}: {
  icon: React.ReactNode
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  title: string
  size?: number
  buttonSize?: number
  variant?: 'window' | 'ghost'
  danger?: boolean
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: buttonSize,
        height: buttonSize,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--nbf-radius-full)',
        border: 'none',
        background: variant === 'window' ? 'var(--nbf-win-bg)' : 'transparent',
        backdropFilter: variant === 'window' ? 'blur(10px)' : undefined,
        color: 'var(--nbf-win-icon)',
        cursor: 'pointer',
        transition: `background var(--nbf-dur-fast) ease, color var(--nbf-dur-fast) ease`
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = danger
          ? 'var(--nbf-close-icon-hover)'
          : 'var(--nbf-win-icon-hover)'
        if (danger) e.currentTarget.style.background = 'var(--nbf-close-hover-bg)'
        else if (variant === 'window') e.currentTarget.style.background = 'var(--nbf-win-hover-bg)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--nbf-win-icon)'
        e.currentTarget.style.background =
          variant === 'window' ? 'var(--nbf-win-bg)' : 'transparent'
      }}
    >
      {icon}
    </button>
  )
}

export function NBWindowButtons({
  onMinimize,
  onMaximize,
  onClose
}: {
  onMinimize?: () => void
  onMaximize?: () => void
  onClose?: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <NBIconButton
        icon={<WinMin size={18} strokeWidth={2.2} />}
        title="最小化"
        onClick={onMinimize}
        variant="window"
      />
      <NBIconButton
        icon={<WinMax size={15} strokeWidth={2.2} />}
        title="最大化"
        onClick={onMaximize}
        variant="window"
      />
      <NBIconButton
        icon={<WinClose size={18} strokeWidth={2.2} />}
        title="关闭"
        onClick={onClose}
        variant="window"
        danger
      />
    </div>
  )
}

function WinMin({ size, strokeWidth }: { size: number; strokeWidth: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      <path d="M5 12h14" />
    </svg>
  )
}
function WinMax({ size, strokeWidth }: { size: number; strokeWidth: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      <rect x="5" y="5" width="14" height="14" rx="1" />
    </svg>
  )
}
function WinClose({ size, strokeWidth }: { size: number; strokeWidth: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/* ---------- Input / SearchPill ---------- */

export function NBInput({
  value,
  onChange,
  placeholder,
  icon,
  onClear,
  kbd,
  disabled
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  icon?: React.ReactNode
  onClear?: () => void
  kbd?: string
  disabled?: boolean
}) {
  const [focused, setFocused] = React.useState(false)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 44,
        padding: '0 14px',
        borderRadius: 'var(--nbf-radius-full)',
        background: 'var(--nbf-input-bg)',
        border: `1px solid ${focused ? 'var(--nbf-accent-active)' : 'var(--nbf-input-border)'}`,
        backdropFilter: 'blur(var(--nbf-blur-glass))',
        opacity: disabled ? 0.5 : 1,
        transition: `border-color var(--nbf-dur-fast) ease`
      }}
    >
      {icon}
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--nbf-fg-input)',
          fontSize: 14,
          fontFamily: 'inherit'
        }}
      />
      {value && onClear ? (
        <button
          onClick={onClear}
          aria-label="清空"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nbf-fg-muted)', display: 'flex' }}
        >
          <X size={15} />
        </button>
      ) : null}
      {kbd && !value && <NBKbd>{kbd}</NBKbd>}
    </div>
  )
}

export function NBKbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 6,
        background: 'var(--nbf-result-bg)',
        color: 'var(--nbf-fg-muted)',
        border: '1px solid var(--nbf-input-border)'
      }}
    >
      {children}
    </span>
  )
}

/* ---------- Tooltip(纯 CSS 悬停玻璃胶囊,title 属性兜底) ---------- */

export function NBTooltip({
  label,
  children,
  openDelay = 150
}: {
  label: string
  children: React.ReactNode
  openDelay?: number
}) {
  // NexBox Tooltip 语义:hover 延迟 150ms 打开,离开立即关闭。
  // 状态驱动而非 CSS :hover,便于后续按需挂载/定位。
  const [visible, setVisible] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(true), openDelay)
  }
  const hide = () => {
    if (timer.current) clearTimeout(timer.current)
    setVisible(false)
  }

  return (
    <span
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      {children}
      <span
        role="tooltip"
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          background: 'var(--nbf-glass-bg-strong)',
          color: 'var(--nbf-fg)',
          border: '1px solid var(--nbf-glass-border)',
          backdropFilter: 'var(--nbf-blur-tooltip)',
          WebkitBackdropFilter: 'var(--nbf-blur-tooltip)',
          padding: '3px 10px',
          borderRadius: 'var(--nbf-radius-full)',
          fontSize: 12,
          fontWeight: 500,
          opacity: visible ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity var(--nbf-dur-fast) ease',
          zIndex: 50
        }}
      >
        {label}
      </span>
    </span>
  )
}

/* ---------- GlassPanel / Card ---------- */

export function NBGlassPanel({
  children,
  strong,
  padding = 18,
  style
}: {
  children: React.ReactNode
  strong?: boolean
  padding?: number
  style?: React.CSSProperties
}) {
  return (
    <div
      className={strong ? 'nb-glass-panel-strong' : 'nb-glass-panel'}
      style={{ borderRadius: 'var(--nbf-radius-panel)', padding, ...style }}
    >
      {children}
    </div>
  )
}

export function NBCard({
  title,
  supporting,
  cover,
  onClick,
  coverStyle
}: {
  title: string
  supporting?: string
  cover?: React.ReactNode
  onClick?: () => void
  coverStyle?: React.CSSProperties
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick?.()
      }}
      style={{
        borderRadius: 'var(--nbf-radius-panel)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform var(--nbf-dur-base) var(--nbf-ease), box-shadow var(--nbf-dur-base) ease',
        outline: 'none'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = 'var(--md-elev-2, 0 2px 8px rgba(0,0,0,.1))'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ aspectRatio: '1 / 1', ...coverStyle }}>{cover}</div>
      <div style={{ padding: '10px 4px 4px' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--nbf-fg)' }}>{title}</div>
        {supporting && (
          <div style={{ fontSize: 12, color: 'var(--nbf-fg-muted)', marginTop: 2 }}>{supporting}</div>
        )}
      </div>
    </div>
  )
}

/* ---------- NavItem ---------- */

export function NBNavItem({
  icon,
  label,
  active,
  showLabel = true,
  onClick
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  showLabel?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        height: 'var(--nbf-nav-h)',
        padding: showLabel ? '0 12px' : '0',
        justifyContent: showLabel ? 'flex-start' : 'center',
        borderRadius: 'var(--nbf-radius-panel)',
        border: 'none',
        background: active ? 'var(--nbf-accent-active)' : 'transparent',
        color: active ? 'var(--nbf-accent-contrast)' : 'var(--nbf-fg)',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 500,
        transition: `background var(--nbf-dur-fast) ease`
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--nbf-accent-hover)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      {icon}
      {showLabel && <span>{label}</span>}
    </button>
  )
}

/* ---------- ContextMenu / Dropdown ---------- */

export function NBContextMenu({
  trigger,
  items
}: {
  trigger: React.ReactNode
  items: { label: string; icon?: React.ReactNode; danger?: boolean; onSelect: () => void }[]
}) {
  const [open, setOpen] = React.useState(false)
  const hostRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={hostRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: 'pointer', display: 'inline-flex' }}
      >
        {trigger}
      </div>
      {open && (
        <div
          role="menu"
          className="md-anim-fade-scale"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 180,
            background: 'var(--nbf-panel-solid-soft)',
            backdropFilter: 'blur(var(--nbf-blur-glass)) saturate(1.4)',
            border: '1px solid var(--nbf-glass-border)',
            borderRadius: 'var(--nbf-radius-panel)',
            padding: 6,
            zIndex: 100,
            boxShadow: 'var(--md-elev-2, 0 4px 14px rgba(0,0,0,.15))'
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                item.onSelect()
                setOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: item.danger ? 'var(--nbf-danger)' : 'var(--nbf-fg)',
                fontSize: 13.5,
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--nbf-accent-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Switch / Checkbox / Slider ---------- */

export function NBSwitch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 'var(--nbf-radius-full)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        background: checked ? 'var(--nbf-accent-active)' : 'var(--nbf-result-hover)',
        transition: `background var(--nbf-dur-fast) ease`
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: checked ? 'var(--nbf-accent-contrast)' : 'var(--nbf-fg)',
          transition: 'left var(--nbf-dur-fast) var(--nbf-ease)'
        }}
      />
    </button>
  )
}

export function NBCheckbox({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === ' ') {
            e.preventDefault()
            onChange(!checked)
          }
        }}
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          border: checked ? 'none' : '1px solid var(--nbf-input-border)',
          background: checked ? 'var(--nbf-accent-active)' : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--nbf-accent-contrast)',
          cursor: 'pointer'
        }}
      >
        {checked && <Check size={14} strokeWidth={3} />}
      </span>
      {label}
    </label>
  )
}

export function NBSlider({
  value,
  min = 0,
  max = 100,
  onChange,
  label
}: {
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
  label: string
}) {
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: 180, accentColor: 'var(--nbf-accent-active)', cursor: 'pointer' }}
    />
  )
}

/* ---------- Dropdown 展示辅助(选中箭头) ---------- */

export function NBChevron() {
  return <ChevronRight size={18} color="var(--nbf-fg-muted)" />
}
