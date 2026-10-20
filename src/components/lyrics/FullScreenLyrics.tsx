// 全屏播放页:左封面唱片/曲目信息 + 右歌词滚动。
// 经 portal 挂到 body——脱离主播放栏的堆叠上下文(999 + backdrop-filter),
// 页面以 z-index 990 从主控制栏/标题栏后面升起,窗口内只保留一个主播放栏。
import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Music } from 'lucide-react'
import { usePlaybackStore } from '../../stores/playbackStore'
import { usePlayback } from '../../hooks/usePlayback'
import { trackCoverUrl, coverImgFallback } from '../../utils/cover'

interface FullScreenLyricsProps {
  isOpen: boolean
  onClose: () => void
}

export function FullScreenLyrics({ isOpen, onClose }: FullScreenLyricsProps) {
  const currentTrack = usePlaybackStore((s) => s.currentTrack)
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const lyrics = usePlaybackStore((s) => s.lyrics)
  const currentLyricIndex = usePlaybackStore((s) => s.currentLyricIndex)
  const { seek } = usePlayback()

  const lyricsRef = useRef<HTMLDivElement>(null)
  const coverRef = useRef<HTMLDivElement>(null)
  const lastScrollIndex = useRef(-1)
  // 用户滚轮后暂停自动跟随 4.5s,避免自动居中把用户想看的行拉走
  const noAutoScrollUntil = useRef(0)

  // "唱片图片中心"在歌词滚动容器内的 y 坐标;测不到时退回容器中线
  const coverCenterIn = () => {
    const container = lyricsRef.current
    if (!container) return null
    let center = container.clientHeight / 2
    let exact = false
    const coverEl = coverRef.current
    if (coverEl) {
      const coverRect = coverEl.getBoundingClientRect()
      const c = coverRect.top + coverRect.height / 2 - container.getBoundingClientRect().top
      if (c > 0 && c < container.clientHeight) {
        center = c
        exact = true
      }
    }
    return { container, center, exact }
  }

  // 把容器上下留白改写为"当前行恰好对齐唱片中心所需的空间":顶部=唱片中心,
  // 底部=视口剩余 + 主播放栏让位 132,首尾行都能对上中轴(固定 34vh 仅作兜底)
  const applyLyricsGeometry = () => {
    const g = coverCenterIn()
    if (!g?.exact) return
    g.container.style.paddingTop = `${Math.round(g.center)}px`
    g.container.style.paddingBottom = `${Math.round(g.container.clientHeight - g.center + 132)}px`
  }

  const centerLyricLine = (idx: number) => {
    const g = coverCenterIn()
    if (!g) return
    applyLyricsGeometry()
    const lineEl = g.container.children[idx] as HTMLElement | undefined
    if (!lineEl) return
    const target = lineEl.offsetTop - g.center + lineEl.offsetHeight / 2
    g.container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }

  useEffect(() => {
    if (currentLyricIndex < 0 || currentLyricIndex === lastScrollIndex.current) return
    lastScrollIndex.current = currentLyricIndex
    if (noAutoScrollUntil.current > Date.now()) return
    centerLyricLine(currentLyricIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLyricIndex])

  // 页面打开:按当前窗口几何重排留白并对齐当前行
  useEffect(() => {
    if (!isOpen) return
    const raf = requestAnimationFrame(() => {
      applyLyricsGeometry()
      if (noAutoScrollUntil.current > Date.now()) return
      const idx = usePlaybackStore.getState().currentLyricIndex
      if (idx >= 0) centerLyricLine(idx)
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // 窗口尺寸变化时,唱片与歌词栏相对位置改变,重排留白并重对齐
  useEffect(() => {
    const onResize = () => {
      applyLyricsGeometry()
      if (noAutoScrollUntil.current > Date.now()) return
      const idx = usePlaybackStore.getState().currentLyricIndex
      if (idx >= 0) centerLyricLine(idx)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasLyrics = !!(lyrics && lyrics.lines.length > 0)

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fullscreen-lyrics"
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        >
          {/* 背景毛玻璃 */}
          <div className="fullscreen-lyrics-bg">
            {currentTrack && (
              <img src={trackCoverUrl(currentTrack, 300)} alt="" className="fullscreen-lyrics-bg-img" onError={coverImgFallback} />
            )}
            <div className="fullscreen-lyrics-bg-overlay" />
          </div>

          {/* 顶部关闭钮(让出标题栏拖拽带,置于其下) */}
          <button className="fullscreen-lyrics-close" onClick={onClose} aria-label="退出全屏歌词" title="退出全屏歌词">
            <ChevronDown size={22} />
          </button>

          <div className="fullscreen-lyrics-content">
            {/* 左:封面唱片 + 曲目 */}
            <div className="fullscreen-lyrics-left">
              <div ref={coverRef} className={`fullscreen-lyrics-cover ${isPlaying ? 'spinning' : ''}`}>
                {currentTrack ? (
                  <img src={trackCoverUrl(currentTrack, 300)} alt={currentTrack.albumName} onError={coverImgFallback} />
                ) : (
                  <div className="fullscreen-lyrics-cover-placeholder">
                    <Music size={64} />
                  </div>
                )}
              </div>
              <div className="fullscreen-lyrics-track-info">
                <h2>{currentTrack?.name || '未播放'}</h2>
                <p>{currentTrack?.artists?.join(', ') || ''}</p>
              </div>
            </div>

            {/* 右:歌词 */}
            <div className="fullscreen-lyrics-right">
              {hasLyrics ? (
                <div
                  className="fullscreen-lyrics-lines"
                  ref={lyricsRef}
                  onWheel={() => { noAutoScrollUntil.current = Date.now() + 4500 }}
                >
                  {lyrics!.lines.map((line, index) => (
                    <div
                      key={index}
                      className={`fullscreen-lyric-line ${index === currentLyricIndex ? 'fullscreen-lyric-active' : ''}`}
                      onClick={() => seek(line.time / 1000)}
                    >
                      <div className="fullscreen-lyric-text">{line.text}</div>
                      {line.translation && (
                        <div className="fullscreen-lyric-translation">{line.translation}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="fullscreen-lyrics-empty">
                  <Music size={48} />
                  <p>{currentTrack?.name || '暂无歌词'}</p>
                  {currentTrack && <span>{currentTrack.artists?.join(', ')}</span>}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
