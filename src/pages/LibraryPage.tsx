// 推荐歌单页:网易云热门歌单网格(免登录可用);点歌单进曲目详情
// 页面本身即歌单墙,无「返回」按钮(通过侧边栏导航出入);点进歌单详情后才有返回网格的按钮
import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Play, Music } from 'lucide-react'
import { GlassPanel } from '../components/common/GlassPanel'
import { TrackList } from '../components/common/TrackList'
import { Track, Playlist } from '@shared/types/streaming'
import { usePlayback } from '../hooks/usePlayback'
import { coverImgFallback } from '../utils/cover'
import { platformLabel } from '../stores/platformPlaylistsStore'

interface PlDetail {
  key: string
  title: string
  subtitle: string
  tracks: Track[]
}

export function LibraryPage() {
  const { playQueue } = usePlayback()
  const [pls, setPls] = useState<Playlist[] | null>(null) // null=首次拉取中
  const [busyPl, setBusyPl] = useState<string | null>(null)
  const [detail, setDetail] = useState<PlDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const list = await window.api.streaming.getRecommendPlaylists()
        if (alive) setPls(list)
      } catch (err) {
        console.error('[Library] recommend playlists failed:', err)
        if (alive) setPls([])
      }
    })()
    return () => { alive = false }
  }, [])

  // 点歌单 → 曲目详情(不直接播放)
  // QQ 歌单的数量字段是播放量(listennum),展示为「N 万听」;网易云为曲目数「N 首」
const fmtPlCount = (pl: Playlist) =>
  pl.source === 'qqmusic'
    ? pl.trackCount >= 10000
      ? `${(pl.trackCount / 10000).toFixed(1)} 万听`
      : `${pl.trackCount} 听`
    : `${pl.trackCount} 首`

const openPlaylistDetail = async (pl: Playlist) => {
    const key = `libpl:${pl.id}`
    if (detailLoading || busyPl) return
    setBusyPl(key)
    setDetailLoading(true)
    try {
      const d = await window.api.streaming.getPlaylist(pl.source, pl.id)
      setDetail({
        key,
        title: pl.name,
        subtitle: `${platformLabel(pl.source)} · ${pl.creatorName || '热门歌单'} · ${fmtPlCount(pl)}`,
        tracks: d.tracks || []
      })
      document.querySelector('.nex-content')?.scrollTo({ top: 0 })
    } catch (err) { console.error('[Library] playlist failed:', err) }
    finally { setBusyPl(null); setDetailLoading(false) }
  }

  return (
    <div className="page library-page">
      {detail ? (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
          <div className="home-top-detail-head">
            <button className="btn btn-ghost" onClick={() => setDetail(null)}>返回</button>
            <div className="home-detail-titles">
              <h1>{detail.title}</h1>
              <span className="home-detail-sub">{detail.subtitle}</span>
            </div>
            <button
              className="btn btn-primary"
              disabled={detail.tracks.length === 0}
              onClick={() => playQueue(detail.tracks, 0, { page: 'library', id: detail.key })}
            >
              <Play size={16} /> 播放全部
            </button>
          </div>
          {detail.tracks.length === 0 ? (
            <GlassPanel intensity="light" className="empty-state">
              <Music size={32} />
              <p>暂无数据</p>
            </GlassPanel>
          ) : (
            <TrackList
              tracks={detail.tracks}
              onPlay={(_, i) => playQueue(detail.tracks, i, { page: 'library', id: detail.key })}
            />
          )}
        </motion.div>
      ) : (
        <>
          <motion.div className="page-header" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <div>
              <h1>推荐歌单</h1>
              <span className="home-detail-sub">网易云 · QQ 音乐 · 热门精选{pls && pls.length > 0 ? ` · ${pls.length} 张` : ''}</span>
            </div>
          </motion.div>

          {pls === null ? (
            <GlassPanel intensity="light" className="empty-state">
              <Music size={32} />
              <p>正在获取热门歌单...</p>
            </GlassPanel>
          ) : pls.length === 0 ? (
            <GlassPanel intensity="light" className="empty-state">
              <Music size={32} />
              <p>暂无数据</p>
              <span>获取热门歌单失败,稍后再试</span>
            </GlassPanel>
          ) : (
            <div className="home-pl-grid">
              {pls.map((pl, i) => {
                const key = `libpl:${pl.id}`
                return (
                  <motion.div
                    key={key}
                    className={`home-pl-card ${busyPl === key ? 'home-pl-card-busy' : ''}`}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, ease: 'easeOut', delay: 0.03 * (i % 6) }}
                    onClick={() => void openPlaylistDetail(pl)}
                  >
                    <div className="home-pl-cover">
                      {pl.coverUrl
                        ? <img src={pl.coverUrl} alt={pl.name} loading="lazy" onError={coverImgFallback} />
                        : <div className="home-pl-cover-ph"><Music size={28} /></div>}
                      <div className="home-pl-badge">{fmtPlCount(pl)}</div>
                    </div>
                    <div className="home-pl-name" title={pl.name}>{pl.name}</div>
                    <div className="home-pl-meta" title={`${pl.creatorName || '热门歌单'} · ${platformLabel(pl.source)}`}>{pl.creatorName ? `${pl.creatorName} · ` : ''}{platformLabel(pl.source)}</div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
