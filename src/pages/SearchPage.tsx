import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, TrendingUp, Music } from 'lucide-react'
import { MusicSource, Track, Playlist, Artist } from '@shared/types/streaming'
import { useSearch } from '../hooks/useSearch'
import { usePlayback } from '../hooks/usePlayback'
import { useUIStore } from '../stores/uiStore'
import { SearchBar } from '../components/common/SearchBar'
import { TrackList } from '../components/common/TrackList'
import { GlassPanel } from '../components/common/GlassPanel'
import { Play } from 'lucide-react'
import { platformLabel } from '../stores/platformPlaylistsStore'

export function SearchPage() {
  const { results, isLoading, isLoadingMore, hasMore, error, search, loadMore } = useSearch()
  const { playTrack, playQueue, playAll } = usePlayback()
  const { searchQuery, searchSource, clearSearchQuery } = useUIStore()
  const [activeSource, setActiveSource] = useState<MusicSource>('qqmusic')
  const [toplist, setToplist] = useState<Track[]>([])
  const [toplistLoading, setToplistLoading] = useState(false)
  const [showToplist, setShowToplist] = useState(true)
  // 结果页签:歌曲/歌手/歌单;歌手与歌单都可点进详情列表
  const [tab, setTab] = useState<'tracks' | 'artists' | 'playlists'>('tracks')
  const [plDetail, setPlDetail] = useState<{ id: string; name: string; creator: string; tracks: Track[] } | null>(null)
  const [plLoading, setPlLoading] = useState(false)
  const [artistDetail, setArtistDetail] = useState<{ id: string; name: string; source: MusicSource; tracks: Track[]; exhausted: boolean } | null>(null)
  const [artistLoading, setArtistLoading] = useState(false)
  const processedQueryRef = useRef<string | null>(null)
  const lastQueryRef = useRef<string>('')
  const typeOf = (t: 'tracks' | 'artists' | 'playlists') => (t === 'playlists' ? 'playlist' : t === 'artists' ? 'artist' : 'track')

  const handleSearch = (query: string) => {
    lastQueryRef.current = query
    setShowToplist(false)
    setPlDetail(null)
    setArtistDetail(null)
    search(query, activeSource, typeOf(tab))
  }

  const switchTab = (t: 'tracks' | 'artists' | 'playlists') => {
    if (t === tab) return
    setTab(t)
    setPlDetail(null)
    setArtistDetail(null)
    if (lastQueryRef.current) {
      setShowToplist(false)
      search(lastQueryRef.current, activeSource, typeOf(t))
    } else {
      setShowToplist(t === 'tracks')
    }
  }

  // Handle search query from store (e.g., when clicking artist name)
  useEffect(() => {
    if (searchQuery && processedQueryRef.current !== searchQuery) {
      processedQueryRef.current = searchQuery
      lastQueryRef.current = searchQuery
      if (searchSource) {
        setActiveSource(searchSource)
      }
      setShowToplist(false)
      setPlDetail(null)
      setTab('tracks')
      search(searchQuery, searchSource || activeSource, 'track')
      // Clear after a small delay to avoid re-triggering
      setTimeout(() => clearSearchQuery(), 100)
    }
  }, [searchQuery, searchSource])

  const handlePlayTrack = (track: any, index: number) => {
    if (results?.tracks) playQueue(results.tracks, index, { page: 'search' })
  }

  const handlePlayToplist = (track: Track, index: number) => {
    playQueue(toplist, index)
  }

  // Load toplist when source changes
  useEffect(() => {
    if (showToplist) loadToplist()
  }, [activeSource, showToplist])

  const loadToplist = async () => {
    setToplistLoading(true)
    try {
      if (activeSource === 'qqmusic') {
        const tracks = await window.api.streaming.getToplist(26, 50)
        setToplist(tracks)
      } else {
        // NetEase: use search with empty query to get hot songs
        const res = await window.api.streaming.search({ query: '热歌', source: 'netease', limit: 50 })
        setToplist(res.tracks)
      }
    } catch (err) {
      console.error('Failed to load toplist:', err)
    } finally {
      setToplistLoading(false)
    }
  }

  const handleSourceChange = (source: MusicSource) => {
    setActiveSource(source)
    setPlDetail(null)
    setArtistDetail(null)
    // 有关键词时用新音源重搜当前页签；无关键词回到榜单(仅歌曲页签)
    if (lastQueryRef.current) {
      setShowToplist(false)
      search(lastQueryRef.current, source, typeOf(tab))
    } else {
      setShowToplist(tab === 'tracks')
      setTab('tracks')
    }
  }

  // 歌单卡点进详情:拉取曲目后页内展示列表(不直接播放)
  const openPlaylistDetail = async (pl: Playlist) => {
    if (plLoading) return
    setPlLoading(true)
    setPlDetail({ id: pl.id, name: pl.name, creator: pl.creatorName, tracks: [] })
    try {
      const d = await window.api.streaming.getPlaylist(pl.source, pl.id)
      setPlDetail({ id: pl.id, name: pl.name, creator: pl.creatorName, tracks: d.tracks || [] })
      document.querySelector('.nex-content')?.scrollTo({ top: 0 })
    } catch (err) {
      console.error('[Search] playlist failed:', err)
      setPlDetail(null)
    } finally {
      setPlLoading(false)
    }
  }

  // 歌手卡点进详情:拉取歌手热门歌曲后页内展示列表(不直接播放);一次 50 首,不足 50 判定到底
  const ARTIST_PAGE = 50
  const openArtistDetail = async (a: Artist) => {
    if (artistLoading) return
    setArtistLoading(true)
    setArtistDetail({ id: a.id, name: a.name, source: a.source, tracks: [], exhausted: false })
    try {
      const batch = await window.api.streaming.getArtistSongs(a.source, a.id, ARTIST_PAGE, 0) || []
      setArtistDetail({
        id: a.id, name: a.name, source: a.source,
        tracks: batch,
        exhausted: batch.length < ARTIST_PAGE
      })
      document.querySelector('.nex-content')?.scrollTo({ top: 0 })
    } catch (err) {
      console.error('[Search] artist failed:', err)
      setArtistDetail(null)
    } finally {
      setArtistLoading(false)
    }
  }

  // 歌手详情加载更多:按已加载量偏移;新批次为空或全部重复 → 到底
  const loadMoreArtist = async () => {
    const d = artistDetail
    if (!d || artistLoading) return
    setArtistLoading(true)
    try {
      const batch = await window.api.streaming.getArtistSongs(d.source, d.id, ARTIST_PAGE, d.tracks.length) || []
      const seen = new Set(d.tracks.map((t) => `${t.source}:${t.id}`))
      const fresh = batch.filter((t) => !seen.has(`${t.source}:${t.id}`))
      const exhausted = batch.length < ARTIST_PAGE || fresh.length === 0
      setArtistDetail({ ...d, tracks: [...d.tracks, ...fresh], exhausted })
    } catch (err) {
      console.error('[Search] artist loadMore failed:', err)
    } finally {
      setArtistLoading(false)
    }
  }

  return (
    <div className="page search-page">
      <motion.div className="page-header" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1>搜索</h1>
      </motion.div>

      <div className="search-section">
        <SearchBar onSearch={handleSearch} />
        <div className="source-filter">
          <GlassPanel
            intensity={activeSource === 'netease' ? 'medium' : 'light'}
            hover
            className={`source-filter-btn ${activeSource === 'netease' ? 'source-filter-active' : ''}`}
            onClick={() => handleSourceChange('netease')}
          >
            <span style={{ color: '#e60026' }}>网易云音乐</span>
          </GlassPanel>
          <GlassPanel
            intensity={activeSource === 'qqmusic' ? 'medium' : 'light'}
            hover
            className={`source-filter-btn ${activeSource === 'qqmusic' ? 'source-filter-active' : ''}`}
            onClick={() => handleSourceChange('qqmusic')}
          >
            <span style={{ color: '#31c27c' }}>QQ音乐</span>
          </GlassPanel>
          {!showToplist && tab === 'tracks' && (
            <GlassPanel intensity="light" hover className="source-filter-btn" onClick={() => setShowToplist(true)}>
              <TrendingUp size={14} /><span>返回榜单</span>
            </GlassPanel>
          )}
        </div>
      </div>

      {/* 歌单详情视图(与首页榜单/歌单详情同款结构) */}
      {plDetail ? (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: 'easeOut' }}>
          <div className="home-top-detail-head">
            <button className="btn btn-ghost" onClick={() => setPlDetail(null)}>返回</button>
            <div className="home-detail-titles">
              <h1>{plDetail.name}</h1>
              <span className="home-detail-sub">
                {plDetail.creator || '歌单'}{plDetail.tracks.length > 0 ? ` · ${plDetail.tracks.length} 首` : ''}
              </span>
            </div>
            <button
              className="btn btn-primary"
              disabled={plDetail.tracks.length === 0}
              onClick={() => playQueue(plDetail.tracks, 0, { page: 'search', id: plDetail.id })}
            >
              <Play size={16} /> 播放全部
            </button>
          </div>
          {plDetail.tracks.length === 0 ? (
            plLoading ? (
              <div className="search-loading"><div className="loading-spinner" /><p>加载歌单...</p></div>
            ) : (
              <GlassPanel intensity="light" className="empty-state">
                <Music size={32} />
                <p>暂无歌曲</p>
              </GlassPanel>
            )
          ) : (
            <TrackList
              tracks={plDetail.tracks}
              onPlay={(_, i) => playQueue(plDetail.tracks, i, { page: 'search', id: plDetail.id })}
            />
          )}
        </motion.div>
      ) : artistDetail ? (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: 'easeOut' }}>
          <div className="home-top-detail-head">
            <button className="btn btn-ghost" onClick={() => setArtistDetail(null)}>返回</button>
            <div className="home-detail-titles">
              <h1>{artistDetail.name}</h1>
              <span className="home-detail-sub">
                {platformLabel(artistDetail.source)} · 歌手{artistDetail.tracks.length > 0 ? ` · ${artistDetail.tracks.length} 首` : ''}
              </span>
            </div>
            <button
              className="btn btn-primary"
              disabled={artistDetail.tracks.length === 0}
              onClick={() => playQueue(artistDetail.tracks, 0, { page: 'search', id: artistDetail.id })}
            >
              <Play size={16} /> 播放全部
            </button>
          </div>
          {artistDetail.tracks.length === 0 ? (
            artistLoading ? (
              <div className="search-loading"><div className="loading-spinner" /><p>加载歌手歌曲...</p></div>
            ) : (
              <GlassPanel intensity="light" className="empty-state">
                <Music size={32} />
                <p>暂无歌曲</p>
              </GlassPanel>
            )
          ) : (
            <TrackList
              tracks={artistDetail.tracks}
              onPlay={(_, i) => playQueue(artistDetail.tracks, i, { page: 'search', id: artistDetail.id })}
            />
          )}
          {artistDetail.tracks.length > 0 && (artistDetail.exhausted ? (
            <div className="search-empty" style={{ padding: '8px 0 4px' }}><p>已经到底啦～</p></div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => void loadMoreArtist()} disabled={artistLoading}>
                {artistLoading ? '加载中...' : '加载更多'}
              </button>
            </div>
          ))}
        </motion.div>
      ) : (
        <>
          {/* 歌曲/歌单 页签 */}
          {!showToplist && (
            <div className="search-tab-row">
              <button className={`search-tab ${tab === 'tracks' ? 'search-tab-active' : ''}`} onClick={() => switchTab('tracks')}>
                歌曲
              </button>
              <button className={`search-tab ${tab === 'artists' ? 'search-tab-active' : ''}`} onClick={() => switchTab('artists')}>
                歌手
              </button>
              <button className={`search-tab ${tab === 'playlists' ? 'search-tab-active' : ''}`} onClick={() => switchTab('playlists')}>
                歌单
              </button>
            </div>
          )}

          {/* 加载与错误:在页签下方,不遮突兀 */}
          {isLoading && !showToplist && (
            <div className="search-loading"><div className="loading-spinner" /><p>搜索中...</p></div>
          )}
          {error && !showToplist && (
            <GlassPanel intensity="light" className="search-error"><p>{error}</p></GlassPanel>
          )}

          {/* 歌手搜索结果 */}
          {results && !isLoading && !showToplist && tab === 'artists' && (
            <div className="search-results">
              {results.artists.length > 0 ? (
                <div className="results-section">
                  <h2 className="section-title">歌手</h2>
                  <div className="home-pl-grid">
                    {results.artists.map((a, i) => (
                      <motion.div
                        key={`${a.source}:${a.id}`}
                        className="home-pl-card"
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.26, delay: 0.03 * (i % 6), ease: 'easeOut' }}
                        onClick={() => void openArtistDetail(a)}
                      >
                        <div className="home-pl-cover" style={{ borderRadius: '50%' }}>
                          {a.avatarUrl
                            ? <img src={a.avatarUrl} alt={a.name} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} style={{ borderRadius: '50%' }} />
                            : <div className="home-pl-cover-ph" style={{ background: 'linear-gradient(135deg, #2b3a4a, #4a2f3f)' }}><Music size={28} /></div>}
                        </div>
                        <div className="home-pl-name" title={a.name}>{a.name}</div>
                        <div className="home-pl-meta">{platformLabel(a.source)}</div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="search-empty"><Search size={48} /><p>没有找到相关歌手</p></div>
              )}
            </div>
          )}

          {/* 歌单搜索结果 */}
          {results && !isLoading && !showToplist && tab === 'playlists' && (
            <div className="search-results">
              {results.playlists.length > 0 ? (
                <div className="results-section">
                  <h2 className="section-title">歌单</h2>
                  <div className="home-pl-grid">
                    {results.playlists.map((p, i) => (
                      <motion.div
                        key={`${p.source}:${p.id}`}
                        className="home-pl-card"
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.26, delay: 0.03 * (i % 6), ease: 'easeOut' }}
                        onClick={() => void openPlaylistDetail(p)}
                      >
                        <div className="home-pl-cover">
                          {p.coverUrl
                            ? <img src={p.coverUrl} alt={p.name} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                            : <div className="home-pl-cover-ph" style={{ background: 'linear-gradient(135deg, #3a2f52, #24476b)' }}><Music size={28} /></div>}
                          <div className="home-pl-badge">{p.trackCount} 首</div>
                        </div>
                        <div className="home-pl-name" title={p.name}>{p.name}</div>
                        <div className="home-pl-meta">{p.creatorName || (p.source === 'netease' ? '网易云' : 'QQ音乐')}</div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="search-empty"><Search size={48} /><p>没有找到相关歌单</p></div>
              )}
            </div>
          )}

      {/* Toplist */}
      {showToplist && !isLoading && (
        <div className="search-results">
          <div className="results-section">
            <h2 className="section-title">
              <TrendingUp size={20} />
              {activeSource === 'qqmusic' ? 'QQ音乐飙升榜' : '网易云热歌榜'}
              <button className="play-all" title="播放全部" aria-label="播放全部榜单歌曲"
                disabled={toplistLoading || toplist.length === 0}
                onClick={() => playAll(toplist)}>
                <span className="play-all-disc"><Play size={12} fill="currentColor" /></span>
                播放全部
              </button>
              <button className="btn btn-ghost btn-sm" onClick={loadToplist}>刷新</button>
            </h2>
            {toplistLoading ? (
              <div className="search-loading"><div className="loading-spinner" /><p>加载中...</p></div>
            ) : toplist.length > 0 ? (
              <TrackList tracks={toplist} onPlay={handlePlayToplist} />
            ) : (
              <GlassPanel intensity="light" className="empty-state"><Music size={32} /><p>暂无榜单数据</p></GlassPanel>
            )}
          </div>
        </div>
      )}

      {/* Search Results(歌曲) */}
      {results && !isLoading && !showToplist && tab === 'tracks' && (
        <div className="search-results">
          {results.tracks.length > 0 ? (
            <div className="results-section">
              <h2 className="section-title">
                歌曲 (
                {results.total > results.tracks.length
                  ? `已加载 ${results.tracks.length}/${results.total}`
                  : results.tracks.length})
                <button className="play-all" title="播放全部" aria-label="播放全部搜索结果"
                  onClick={() => playAll(results.tracks)}>
                  <span className="play-all-disc"><Play size={12} fill="currentColor" /></span>
                  播放全部
                </button>
              </h2>
              <TrackList tracks={results.tracks} onPlay={handlePlayTrack} />
              {hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                  <button className="btn btn-ghost btn-sm" onClick={loadMore} disabled={isLoadingMore}>
                    {isLoadingMore ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="search-empty"><Search size={48} /><p>没有找到相关结果</p></div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  )
}
