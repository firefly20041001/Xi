// 全局搜索框(标题栏左上角)：同时实测网易云/QQ音乐两平台的歌曲建议。
// 无 Ctrl+K 召唤；点击外部或 Esc 关闭；↑↓ 选择、Enter 播放选中项并跳到搜索页。
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X, Clock, Sparkles, Search as SearchIcon } from 'lucide-react'
import { MusicSource, Track } from '@shared/types/streaming'
import { useUIStore } from '../../stores/uiStore'
import { usePlayback } from '../../hooks/usePlayback'

const FETCH_LIMIT = 6
const DEBOUNCE_MS = 250
const HISTORY_KEY = 'gs.recent'
const HISTORY_MAX = 8

// 全局搜索只针对在线平台(本地音乐不参与搜索)
type SearchSource = Exclude<MusicSource, 'local'>

const SOURCES: { source: SearchSource; label: string; color: string }[] = [
  { source: 'qqmusic', label: 'QQ音乐', color: '#31c27c' },
  { source: 'netease', label: '网易云音乐', color: '#e60026' }
]

// 空态默认推荐(仅展示歌名+歌手;点击以歌名作为关键字发起搜索)
const RECOMMENDED = [
  {
    label: 'QQ音乐',
    color: '#31c27c',
    songs: [
      { name: 'Amore', artist: 'ReoNa (レオナ)' },
      { name: '心做し (无心)', artist: '鹿乃 (かの)' },
      { name: 'カタチのないもの (Another ver.)', artist: '涼海ネモ' },
      { name: '鳥の詩 (鸟之诗)', artist: 'Akie秋绘' }
    ]
  },
  {
    label: '网易云音乐',
    color: '#e60026',
    songs: [
      { name: '还是会想你', artist: '林达浪/h3R3' },
      { name: '虚构', artist: 'h3R3' }
    ]
  }
]

function loadHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

type GroupState = {
  tracks: Track[]
  loading: boolean
}

function emptyGroups(): Record<SearchSource, GroupState> {
  return {
    netease: { tracks: [], loading: false },
    qqmusic: { tracks: [], loading: false }
  }
}

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [history, setHistory] = useState<string[]>(loadHistory)
  const [groups, setGroups] = useState<Record<SearchSource, GroupState>>(emptyGroups)
  const [selected, setSelected] = useState(0)
  const { setActivePage, setSearchQuery } = useUIStore()
  const { playQueue } = usePlayback()

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<number | null>(null)
  const reqIdRef = useRef(0)

  // 查询变化:防抖后并行搜索两平台(带递增请求号丢弃过期响应)
  useEffect(() => {
    const q = query.trim()
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    if (!q) {
      setGroups(emptyGroups())
      return
    }
    const reqId = ++reqIdRef.current
    setGroups({ netease: { tracks: [], loading: true }, qqmusic: { tracks: [], loading: true } })
    debounceRef.current = window.setTimeout(() => {
      for (const { source } of SOURCES) {
        void window.api.streaming.search({ query: q, source, type: ['track'], limit: FETCH_LIMIT })
          .then((result) => {
            if (reqIdRef.current !== reqId) return
            const tracks = result?.tracks ?? []
            setGroups((prev) => ({ ...prev, [source]: { tracks, loading: false } }))
          })
          .catch(() => {
            if (reqIdRef.current !== reqId) return
            setGroups((prev) => ({ ...prev, [source]: { tracks: [], loading: false } }))
          })
      }
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [query])

  // 记录一次已执行的搜索(播放选中/回车跳转/查看全部),去重且最多保留 8 条
  const recordQuery = useCallback((q: string) => {
    const v = q.trim()
    if (!v) return
    setHistory((prev) => {
      const next = [v, ...prev.filter((x) => x !== v)].slice(0, HISTORY_MAX)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    try { localStorage.removeItem(HISTORY_KEY) } catch { /* ignore */ }
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSelected(0)
    inputRef.current?.blur()
  }, [])

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const flat = useCallback(() => {
    const rows: { source: SearchSource; track: Track; index: number }[] = []
    for (const { source } of SOURCES) {
      groups[source].tracks.forEach((track, index) => rows.push({ source, track, index }))
    }
    return rows
  }, [groups])

  const openSearchPage = useCallback((source?: SearchSource) => {
    if (query.trim()) setSearchQuery(query.trim(), source)
    setActivePage('search')
    close()
  }, [query, setSearchQuery, setActivePage, close])

  const playSelected = useCallback((source: SearchSource, track: Track, index: number) => {
    recordQuery(query)
    void playQueue(groups[source].tracks, index, { page: 'search' })
    openSearchPage(source)
  }, [groups, playQueue, openSearchPage, recordQuery, query])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setIsOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!isOpen) return
    const rows = flat()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((prev) => (prev < rows.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows[selected]) {
        playSelected(rows[selected].source, rows[selected].track, rows[selected].index)
      } else if (query.trim()) {
        // 无可选结果时,回车视为直接搜索并跳到搜索页
        recordQuery(query)
        openSearchPage()
      }
    }
  }, [isOpen, flat, selected, playSelected, openSearchPage, recordQuery, query])

  const anyLoading = SOURCES.some(({ source }) => groups[source].loading)
  const totalRows = flat().length
  const showNoResult = !anyLoading && totalRows === 0 && query.trim().length > 0

  return (
    <div className="gs-wrap" ref={wrapRef}>
      <div
        className={`gs-box ${isOpen ? 'gs-box-open' : ''}`}
        onMouseDown={(e) => {
          e.stopPropagation()
          setIsOpen(true)
        }}
      >
        <Search size={15} className="gs-icon" />
        <input
          ref={inputRef}
          className="gs-input"
          placeholder="搜索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button type="button" className="gs-clear" aria-label="清空" onClick={() => { setQuery(''); inputRef.current?.focus() }}>
            <X size={13} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="gs-dd">
          {/* 空态:搜索记录 + 默认推荐 */}
          {!query.trim() && (
            <>
              {history.length > 0 && (
                <div className="gs-group">
                  <div className="gs-group-head gs-head-split">
                    <span>搜索记录</span>
                    <button type="button" className="gs-clear-history" onMouseDown={(e) => e.preventDefault()} onClick={clearHistory}>
                      清除
                    </button>
                  </div>
                  {history.map((h, i) => (
                    <button
                      type="button"
                      key={`h-${i}`}
                      className="gs-item gs-hist"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setQuery(h); setSelected(0) }}
                    >
                      <Clock size={13} className="gs-clock" />
                      <span className="gs-item-name gs-hist-text">{h}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="gs-group">
                <div className="gs-group-head">
                  <Sparkles size={12} className="gs-spark" />
                  <span>推荐</span>
                </div>
              </div>
              <div className="gs-cols">
                {RECOMMENDED.map((platform) => (
                  <div key={platform.label} className="gs-group">
                    <div className="gs-group-head">
                      <span className="gs-dot" style={{ background: platform.color }} />
                      <span>{platform.label}</span>
                    </div>
                    {platform.songs.map((song) => (
                      <button
                        type="button"
                        key={song.name}
                        className="gs-item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setQuery(song.name); setSelected(0) }}
                      >
                        <span className="gs-item-name">{song.name}</span>
                        <span className="gs-item-artist">{song.artist}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="gs-cols">
            {showNoResult && (
              <div className="gs-hint gs-cols-span"><SearchIcon size={14} /><span>没有找到"{query.trim()}"的结果</span></div>
            )}
            {SOURCES.map(({ source, label, color }) => {
              const g = groups[source]
              if (!g.loading && g.tracks.length === 0) return null
              const baseIdx = SOURCES.slice(0, SOURCES.findIndex((s) => s.source === source))
                .reduce((n, s) => n + groups[s.source].tracks.length, 0)
              return (
                <div key={source} className="gs-group">
                  <div className="gs-group-head">
                    <span className="gs-dot" style={{ background: color }} />
                    <span>{label}</span>
                  </div>
                  {g.loading && g.tracks.length === 0 && <div className="gs-hint gs-hint-sm">搜索中...</div>}
                  {g.tracks.map((track, index) => {
                    const rowIdx = baseIdx + index
                    return (
                      <button
                        type="button"
                        key={`${source}:${track.id}`}
                        className={`gs-item ${rowIdx === selected ? 'gs-item-active' : ''}`}
                        onMouseEnter={() => setSelected(rowIdx)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => playSelected(source, track, index)}
                      >
                        <span className="gs-item-name">{track.name}</span>
                        <span className="gs-item-artist">{(track.artists || []).join(', ')}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {query.trim() && !anyLoading && (
            <button
              type="button"
              className="gs-footer"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { recordQuery(query); openSearchPage() }}
            >
              在搜索页查看全部结果
            </button>
          )}
        </div>
      )}
    </div>
  )
}
