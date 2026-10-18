export function Icon({
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
