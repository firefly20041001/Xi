import React, { useState, useRef, useEffect } from 'react'
import { NBTooltip } from '../../nexbox-ui/nb'
import { ListMusic, Music, X, ListPlus, Check, Trash2 } from 'lucide-react'
import { stopAndClear, addToPlayQueue } from '../../utils/audio'
import { usePlaybackStore } from '../../stores/playbackStore'
import { usePlaylistStore } from '../../stores/playlistStore'
import { PlayerControls } from './PlayerControls'
import { ProgressBar } from './ProgressBar'
import { VolumeControl } from './VolumeControl'
import { usePlayback } from '../../hooks/usePlayback'
import { FullScreenLyrics } from '../lyrics/FullScreenLyrics'
import { trackCoverUrl, coverImgFallback } from '../../utils/cover'
import { Track, QualityLevel } from '@shared/types/streaming'

export function PlayerBar() {
  const currentTrack = usePlaybackStore((s) => s.currentTrack)
  const duration = usePlaybackStore((s) => s.duration)
  const volume = usePlaybackStore((s) => s.volume)
  const isMuted = usePlaybackStore((s) => s.isMuted)
  const playlist = usePlaybackStore((s) => s.playlist)
  const currentIndex = usePlaybackStore((s) => s.currentIndex)
  const playQueue = usePlaybackStore((s) => s.playQueue)
  const quality = usePlaybackStore((s) => s.quality)
  const setQuality = usePlaybackStore((s) => s.setQuality)
  const playlists = usePlaylistStore((s) => s.playlists)
  const { togglePlay, nextTrack, prevTrack, seek, setVolume, toggleMute, playTrack } = usePlayback()
  const [showLyrics, setShowLyrics] = useState(false)
  const [showQueue, setShowQueue] = useState(false)
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  const [lyricsOn, setLyricsOn] = useState(false)
  const [menuTrack, setMenuTrack] = useState<Track | null>(null)
  const [addedId, setAddedId] = useState<string | null>(null)
  const queueListRef = useRef<HTMLDivElement>(null)
  const qualityMenuRef = useRef<HTMLDivElement>(null)
  const queuePanelRef = useRef<HTMLDivElement>(null)
  const queueBtnRef = useRef<HTMLButtonElement>(null)

  const qualityLabels: Record<QualityLevel, string> = {
    standard: '标准',
    high: '高品',
    lossless: '无损',
    hires: 'Hi-Res'
  }

  // Combine playQueue + playlist for display
  const displayQueue = [...playQueue, ...playlist]
  const activeIndex = playQueue.length > 0 ? 0 : currentIndex

  useEffect(() => {
    if (showQueue && queueListRef.current) {
      const activeItem = queueListRef.current.querySelector('.queue-item-active')
      if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [showQueue])

  // 桌面歌词状态：挂载查询 + Rust 可见性广播（与设置/托盘严格同步）
  useEffect(() => {
    void window.api.lyricsWindow.isVisible().then((v) => setLyricsOn(Boolean(v))).catch(() => {})
    let un: (() => void) | undefined
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen('tray:lyrics-visible', (e) => setLyricsOn(Boolean((e.payload as unknown))))
    }).then((un2) => { un = un2 })
    return () => { un?.() }
  }, [])

  // 音质菜单:外点 / Escape 关闭(ref 覆盖按钮 + 菜单,点按钮本身不算外点)
  useEffect(() => {
    if (!showQualityMenu) return
    const handlePointerDown = (e: MouseEvent) => {
      if (qualityMenuRef.current && !qualityMenuRef.current.contains(e.target as Node)) {
        setShowQualityMenu(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowQualityMenu(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showQualityMenu])

  // 播放队列悬浮面板:外点 / Escape 关闭(点队列按钮本身交给 toggle,避免关了又开)
  useEffect(() => {
    if (!showQueue) return
    const handlePointerDown = (e: MouseEvent) => {
      const t = e.target as Node
      const inPanel = queuePanelRef.current?.contains(t)
      const inBtn = queueBtnRef.current?.contains(t)
      if (!inPanel && !inBtn) {
        setShowQueue(false)
        setMenuTrack(null)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowQueue(false)
        setMenuTrack(null)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showQueue])

  const handlePlayQueueTrack = async (index: number) => {
    const track = displayQueue[index]
    if (track) {
      await playTrack(track)
    }
  }

  const handleAddToPlaylist = async (playlistId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!menuTrack) return
    await window.api.playlist.addTrack(playlistId, menuTrack)
    setAddedId(playlistId)
    setTimeout(() => { setAddedId(null); setMenuTrack(null) }, 600)
  }

  return (
    <>
      <div className="player-bar">
        <div className="player-bar-glass" />
        <ProgressBar duration={duration} onSeek={seek} />
        <div className="player-bar-content">
          <div className="player-track-info" onClick={() => setShowLyrics(true)} style={{ cursor: 'pointer' }}>
            <div className="player-track-cover">
              {currentTrack ? (
                <img src={trackCoverUrl(currentTrack, 100)} alt="" onError={coverImgFallback} />
              ) : (
                <div className="player-cover-placeholder"><Music size={20} /></div>
              )}
            </div>
            <div className="player-track-text">
              <div className="player-track-name">{currentTrack?.name || '未播放'}</div>
              <div className="player-track-artist">{currentTrack?.artists?.join(', ') || ''}</div>
            </div>
          </div>

          <PlayerControls onTogglePlay={togglePlay} onNext={nextTrack} onPrev={prevTrack} />

          <div className="player-right">
            <VolumeControl volume={volume} isMuted={isMuted} onVolumeChange={setVolume} onToggleMute={toggleMute} />
            <div ref={qualityMenuRef} style={{ position: 'relative' }}>
              <button className="player-action-btn player-action-btn-text" onClick={() => setShowQualityMenu(!showQualityMenu)}>{qualityLabels[quality]}</button>
              {showQualityMenu && (
                <div className="quality-menu" onClick={(e) => e.stopPropagation()}>
                 <div className="add-menu-title">音质</div>
                  {(Object.entries(qualityLabels) as [QualityLevel, string][]).map(([key, label]) => (
                    <button key={key} className={`add-menu-item ${quality === key ? 'active' : ''}`} onClick={() => { setQuality(key); setShowQualityMenu(false) }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <NBTooltip label="桌面歌词"><button className={'player-action-btn player-lyrics-btn' + (lyricsOn ? ' player-action-active' : '')} aria-label="桌面歌词" onClick={() => window.api.lyricsWindow.toggle()}>词</button></NBTooltip>
            <NBTooltip label="播放队列"><button ref={queueBtnRef} className="player-action-btn" aria-label="播放队列" onClick={() => setShowQueue(!showQueue)}><ListMusic size={18} /></button></NBTooltip>
          </div>
        </div>
      </div>

      <FullScreenLyrics isOpen={showLyrics} onClose={() => setShowLyrics(false)} />

      {/* Queue panel:独立悬浮玻璃面板(无全屏遮罩,外点/Escape 关闭) */}
      {showQueue && (
        <div className="queue-panel" ref={queuePanelRef}>
          <div className="queue-panel-content">
            <div className="queue-header">
              <h3>播放队列 ({displayQueue.length})</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => stopAndClear()}>
                  <Trash2 size={14} /> 清空
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowQueue(false)}>关闭</button>
              </div>
            </div>

            {/* Play Queue section */}
            {playQueue.length > 0 && (
              <>
                <div className="add-menu-title" style={{ padding: '8px 20px' }}>下一首播放</div>
                <div className="queue-list">
                  {playQueue.map((track, index) => (
                    <div
                      key={`pq-${track.source}-${track.id}-${index}`}
                      className="queue-item queue-item-active"
                      onClick={() => handlePlayQueueTrack(index)}
                    >
                      <span className="queue-index">{index + 1}</span>
                      <div className="queue-info">
                        <div className="queue-name">{track.name}</div>
                        <div className="queue-artist">{track.artists.join(', ')}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center', position: 'relative' }}>
                        <button
                          className="queue-remove-btn"
                          style={{ opacity: 1 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuTrack(menuTrack?.id === track.id ? null : track)
                          }}
                        >
                          <ListPlus size={14} />
                        </button>
                        <button
                          className="queue-remove-btn"
                          style={{ opacity: 1 }}
                          onClick={(e) => { e.stopPropagation(); usePlaybackStore.getState().removeFromPlayQueue(index) }}
                        >
                          <X size={14} />
                        </button>
                        {menuTrack?.id === track.id && menuTrack?.source === track.source && (
                          <div className="add-to-playlist-menu" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 100 }}
                            onClick={(ev) => ev.stopPropagation()}>
                            <div className="add-menu-title">添加到歌单</div>
                            {playlists.length === 0 ? (
                              <div className="add-menu-empty">暂无歌单</div>
                            ) : (
                              playlists.map((p) => (
                                <button key={p.id} className="add-menu-item" onClick={(e) => handleAddToPlaylist(p.id, e)}>
                                  {addedId === p.id ? <><Check size={14} /> 已添加</> : p.name}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Playlist section */}
            {playlist.length > 0 && (
              <>
                <div className="add-menu-title" style={{ padding: '8px 20px' }}>
                  歌单 ({playlist.length})
                </div>
                <div className="queue-list" ref={queueListRef}>
                  {playlist.map((track, index) => (
                    <div
                      key={`pl-${track.source}-${track.id}-${index}`}
                      className={`queue-item ${index === currentIndex ? 'queue-item-active' : ''}`}
                      onClick={() => {
                        usePlaybackStore.getState().setPlaylist(playlist, index)
                        playTrack(track)
                      }}
                    >
                      <span className="queue-index">{index + 1}</span>
                      <div className="queue-info">
                        <div className="queue-name">{track.name}</div>
                        <div className="queue-artist">{track.artists.join(', ')}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center', position: 'relative' }}>
                        <button
                          className="queue-remove-btn"
                          style={{ opacity: 1 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuTrack(menuTrack?.id === track.id ? null : track)
                          }}
                        >
                          <ListPlus size={14} />
                        </button>
                        {menuTrack?.id === track.id && menuTrack?.source === track.source && (
                          <div className="add-to-playlist-menu" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 100 }}
                            onClick={(ev) => ev.stopPropagation()}>
                            <div className="add-menu-title">添加到歌单</div>
                            {playlists.length === 0 ? (
                              <div className="add-menu-empty">暂无歌单</div>
                            ) : (
                              playlists.map((p) => (
                                <button key={p.id} className="add-menu-item" onClick={(e) => handleAddToPlaylist(p.id, e)}>
                                  {addedId === p.id ? <><Check size={14} /> 已添加</> : p.name}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {displayQueue.length === 0 && (
              <div className="empty-state" style={{ padding: 40 }}>
                <Music size={32} />
                <p>播放队列为空</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
