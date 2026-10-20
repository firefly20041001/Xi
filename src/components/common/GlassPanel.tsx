import React from 'react'
import { motion } from 'framer-motion'

interface GlassPanelProps {
  children: React.ReactNode
  className?: string
  intensity?: 'light' | 'medium' | 'heavy'
  hover?: boolean
  onClick?: () => void
  style?: React.CSSProperties
  /** 入场自淡入:淡入作用在玻璃元素自身(opacity<1 的祖先会切掉 backdrop-filter 的采样来源,
   *  自身 opacity 不会),配合外层包装层只做 transform 位移动画,全程保持模糊有效 */
  fadeUp?: boolean
  /** 入场延迟(秒),用于同屏多卡片错峰 */
  fadeDelay?: number
  /** 渲染在 AnimatePresence 内,退出时同步淡出 */
  fadeExit?: boolean
}

export function GlassPanel({
  children,
  className = '',
  intensity = 'medium',
  hover = false,
  onClick,
  style,
  fadeUp = false,
  fadeDelay = 0,
  fadeExit = false
}: GlassPanelProps) {
  const intensityMap = {
    light: 'glass-light',
    medium: 'glass-medium',
    heavy: 'glass-heavy'
  }

  return (
    <motion.div
      className={`glass-panel ${intensityMap[intensity]} ${hover ? 'glass-hover' : ''} ${className}`}
      style={style}
      onClick={onClick}
      initial={fadeUp ? { opacity: 0, y: 8 } : undefined}
      animate={fadeUp ? { opacity: 1, y: 0 } : undefined}
      exit={fadeUp && fadeExit ? { opacity: 0, y: -6 } : undefined}
      transition={fadeUp ? { duration: 0.22, ease: 'easeOut', delay: fadeDelay || 0 } : undefined}
      whileHover={hover ? { scale: 1.01 } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
    >
      {children}
    </motion.div>
  )
}
