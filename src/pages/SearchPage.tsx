import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, TrendingUp, Music } from 'lucide-react'
import { MusicSource, Track } from '@shared/types/streaming'
import { useSearch } from '../hooks/useSearch'
import { usePlayback } from '../hooks/usePlayback'
import { useUIStore } from '../stores/uiStore'
import { SearchBar } from '../components/common/SearchBar'
import { TrackList } from '../components/common/TrackList'
import { GlassPanel } from '../components/common/GlassPanel'
import { Play } from 'lucide-react'

export function SearchPage() {
  const { results, isLoading, isLoadingMore, hasMore, error, search, loadMore } = useSearch()
  const { playTrack, playQueue, playAll } = usePlayback()
  const { searchQuery, searchSource, clearSearchQuery } = useUIStore()
  const [activeSource, setActiveSource] = useState<MusicSource>('qqmusic')
  const [toplist, setToplist] = useState<Track[]>([])
  const [toplistLoading, setToplistLoading] = useState(false)
  const [showToplist, setShowToplist] = useState(true)
  const processedQueryRef = useRef<string | null>(null)
  const lastQueryRef = useRef<string>('')

  const handleSearch = (query: string) => {
    lastQueryRef.current = query
    setShowToplist(false)
    search(query, activeSource)
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
      search(searchQuery, searchSource || activeSource)
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
    // 有关键词时用新音源重搜；无关键词回到榜单
    if (lastQueryRef.current) {
      setShowToplist(false)
      search(lastQueryRef.current, source)
    } else {
      setShowToplist(true)
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
          {!showToplist && (
            <GlassPanel intensity="light" hover className="source-filter-btn" onClick={() => setShowToplist(true)}>
              <TrendingUp size={14} /><span>返回榜单</span>
            </GlassPanel>
          )}
        </div>
      </div>

      {isLoading && <div className="search-loading"><div className="loading-spinner" /><p>搜索中...</p></div>}
      {error && <GlassPanel intensity="light" className="search-error"><p>{error}</p></GlassPanel>}

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

      {/* Search Results */}
      {results && !isLoading && !showToplist && (
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
    </div>
  )
}
