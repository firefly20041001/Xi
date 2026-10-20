// 全局搜索框(标题栏左上角)：同时实测网易云/QQ音乐两平台的歌曲建议。
// 无 Ctrl+K 召唤；点击外部或 Esc 关闭；↑↓ 列内移动行、←→ 切换平台列。
// 默认无选中不高亮:回车=直接搜索跳页;按↓或悬停选中后,回车=播放选中项并跳到搜索页。
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
  // 键盘网格导航两列平台:selCol 0=QQ音乐 1=网易云(SOURCES 顺序),selRow 为列内行号
  // -1 = 无选中(默认):不高亮任何项,回车视为直接搜索
  const [selCol, setSelCol] = useState(-1)
  const [selRow, setSelRow] = useState(-1)
  // 键盘(↑↓←→)导航期间悬停不抢占高亮,鼠标真正移动后恢复悬停高亮
  const [kbNav, setKbNav] = useState(false)
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
    // 关键词变化即清空选中:回到"无选中,回车只搜索"的默认态
    setSelCol(-1)
    setSelRow(-1)
    setKbNav(false)
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
    setSelCol(-1)
    setSelRow(-1)
    setKbNav(false)
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
    // 列内行数上限(空列取 0,后续判断自然失效)
    const colRows = (col: number) => groups[SOURCES[col].source].tracks.length
    const clampRow = (col: number, row: number) => Math.min(row, Math.max(0, colRows(col) - 1))
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setKbNav(true)
      // 无选中 → 先选中 QQ 平台列首行;已有选中 → 列内下移
      if (selRow < 0) {
        setSelCol(0)
        setSelRow(0)
      } else {
        setSelRow((prev) => (prev < colRows(selCol) - 1 ? prev + 1 : prev))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setKbNav(true)
      if (selRow <= 0) {
        // 首行再向上 = 取消选中,回到"回车直接搜索"默认态
        setSelCol(-1)
        setSelRow(-1)
      } else {
        setSelRow((prev) => prev - 1)
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      // ←→ 平台列间切换,行号保持但夹到新列的行数内;无选中时不抢占
      if (selCol < 0) return
      const dir = e.key === 'ArrowLeft' ? -1 : 1
      const next = Math.min(SOURCES.length - 1, Math.max(0, selCol + dir))
      if (next !== selCol) {
        setKbNav(true)
        setSelCol(next)
        setSelRow((prev) => clampRow(next, prev))
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const source = selCol >= 0 ? SOURCES[selCol]?.source : undefined
      const track = source ? groups[source].tracks[selRow] : undefined
      if (source && track) {
        playSelected(source, track, selRow)
      } else if (query.trim()) {
        // 无选中项:回车直接搜索并跳到搜索页(不播放)
        recordQuery(query)
        openSearchPage()
      }
    }
  }, [isOpen, groups, selCol, selRow, playSelected, openSearchPage, recordQuery, query])

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
        <div
          className="gs-dd"
          onMouseMove={() => { if (kbNav) setKbNav(false) }}
        >
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
                      onClick={() => { setQuery(h); setSelCol(-1); setSelRow(-1); setKbNav(false) }}
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
                        onClick={() => { setQuery(song.name); setSelCol(-1); setSelRow(-1); setKbNav(false) }}
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
            {SOURCES.map(({ source, label, color }, colIdx) => {
              const g = groups[source]
              if (!g.loading && g.tracks.length === 0) return null
              return (
                <div key={source} className="gs-group">
                  <div className="gs-group-head">
                    <span className="gs-dot" style={{ background: color }} />
                    <span>{label}</span>
                  </div>
                  {g.loading && g.tracks.length === 0 && <div className="gs-hint gs-hint-sm">搜索中...</div>}
                  {g.tracks.map((track, index) => (
                    <button
                      type="button"
                      key={`${source}:${track.id}`}
                      className={`gs-item ${selCol === colIdx && selRow === index ? 'gs-item-active' : ''}`}
                      onMouseEnter={() => { if (!kbNav) { setSelCol(colIdx); setSelRow(index) } }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => playSelected(source, track, index)}
                    >
                      <span className="gs-item-name">{track.name}</span>
                      <span className="gs-item-artist">{(track.artists || []).join(', ')}</span>
                    </button>
                  ))}
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
