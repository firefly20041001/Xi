// 歌单页:拆分为 平台歌单(登录后自动同步平台的 自建/收藏/我喜欢,两列纵向排队)
// 与 本地歌单(原有的新建/导入/管理,保持不变)。
import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, RefreshCw, Trash2, Music, Download, FolderPlus, Heart, ChevronDown } from 'lucide-react'
import { usePlaylistStore } from '../stores/playlistStore'
import { useAccountStore } from '../stores/accountStore'
import {
  usePlatformPlaylistsStore,
  platformLabel
} from '../stores/platformPlaylistsStore'
import { AccountProvider } from '@shared/types/accounts'
import { usePlayback } from '../hooks/usePlayback'
import { coverImgFallback } from '../utils/cover'
import { GlassPanel } from '../components/common/GlassPanel'
import { TrackList } from '../components/common/TrackList'
import { Track, MusicSource, Playlist } from '@shared/types/streaming'
import { SyncedPlaylist } from '@shared/types/playlist'

const PROVIDERS: AccountProvider[] = ['netease', 'qqmusic']
const PLATFORM_NAMES: Record<AccountProvider, string> = { netease: '网易云', qqmusic: 'QQ音乐' }

// 平台歌单详情选择态(平台歌单是远端数据,按需取曲目)
interface RemoteSelection {
  kind: 'playlist'
  source: MusicSource
  id: string
  name: string
  coverUrl: string
  trackCount: number
  description?: string
}

export function PlaylistPage() {
  const { playlists, isLoading, refreshPlaylists, deletePlaylist } = usePlaylistStore()
  const accounts = useAccountStore((s) => s.accounts)
  const platformProviders = usePlatformPlaylistsStore((s) => s.providers)
  const syncAll = usePlatformPlaylistsStore((s) => s.syncAll)
  const syncProvider = usePlatformPlaylistsStore((s) => s.syncProvider)
  const { playAll, playQueue } = usePlayback()
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([])
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importSource, setImportSource] = useState<MusicSource>('qqmusic')
  const [importing, setImporting] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<{ added: number; removed: number; kept: number } | null>(null)
  const [remoteSel, setRemoteSel] = useState<RemoteSelection | null>(null)
  const [remoteTracks, setRemoteTracks] = useState<Track[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  // 平台列折叠状态(默认展开)
  const [platformCollapsed, setPlatformCollapsed] = useState<Record<AccountProvider, boolean>>({
    netease: false,
    qqmusic: false
  })

  useEffect(() => { refreshPlaylists() }, [])

  // 平台歌单自动同步:页面打开时对已登录账号补一次;账号变化(登录/登出)实时跟进
  useEffect(() => {
    syncAll(accounts)
    const unsub = useAccountStore.subscribe((state) => { syncAll(state.accounts) })
    return unsub
  }, [accounts])

  // 平台歌单详情:切到某个平台歌单时按需拉取曲目
  // (QQ id="liked" 的服务端"我喜欢"歌单在后端走专用 dirid 接口)
  useEffect(() => {
    if (!remoteSel) return
    let cancelled = false
    setRemoteLoading(true)
    setRemoteTracks([])
    ;(async () => {
      try {
        const pl: Playlist = await window.api.streaming.getPlaylist(remoteSel.source, remoteSel.id)
        if (!cancelled) setRemoteTracks(pl.tracks || [])
      } catch (err) {
        console.error('Failed to load platform playlist tracks:', err)
        if (!cancelled) setRemoteTracks([])
      } finally {
        if (!cancelled) setRemoteLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [remoteSel])

  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId)

  const handleSelectPlaylist = async (playlistId: string) => {
    setSelectedPlaylistId(playlistId)
    setRefreshResult(null)
    setLoadingTracks(true)
    try {
      const playlist = await window.api.playlist.getById(playlistId)
      if (playlist) {
        setPlaylistTracks(playlist.tracks.map(t => t.track))
      }
    } catch {
      setPlaylistTracks([])
    } finally {
      setLoadingTracks(false)
    }
  }

  const handlePlayAll = () => {
    if (playlistTracks.length > 0) playAll(playlistTracks)
  }

  const handleBack = () => {
    setSelectedPlaylistId(null)
    setPlaylistTracks([])
    setRefreshResult(null)
  }

  const openRemotePlaylist = (source: MusicSource, pl: Playlist) => {
    setRemoteSel({
      kind: 'playlist',
      source,
      id: pl.id,
      name: pl.name,
      coverUrl: pl.coverUrl,
      trackCount: pl.trackCount,
      description: pl.description || undefined
    })
  }

  const handleBackRemote = () => {
    setRemoteSel(null)
    setRemoteTracks([])
  }

  const handleDeleteTrack = async (track: Track) => {
    if (!selectedPlaylistId) return
    try {
      await window.api.playlist.removeTrack(selectedPlaylistId, track.id)
      setPlaylistTracks(prev => prev.filter(t => t.id !== track.id))
    } catch (err) {
      console.error('Failed to delete track:', err)
    }
  }

  const handleRefresh = async () => {
    if (!selectedPlaylistId) return
    setRefreshing(true)
    setRefreshResult(null)
    try {
      const result = await window.api.playlist.refresh(selectedPlaylistId)
      setRefreshResult(result)
      // Reload tracks
      const playlist = await window.api.playlist.getById(selectedPlaylistId)
      if (playlist) {
        setPlaylistTracks(playlist.tracks.map(t => t.track))
      }
      await refreshPlaylists()
    } catch (err) {
      console.error('Failed to refresh playlist:', err)
    } finally {
      setRefreshing(false)
    }
  }

  const handleCreate = async () => {
    if (!newPlaylistName.trim()) return
    try {
      await window.api.playlist.create(newPlaylistName.trim())
      await refreshPlaylists()
      setNewPlaylistName('')
      setShowCreate(false)
    } catch (err) {
      console.error('Failed to create playlist:', err)
    }
  }

  const handleImport = async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    try {
      let playlistId = importUrl.trim()
      const qqMatch = importUrl.match(/(?:disstid|id)=(\d+)/)
      if (qqMatch) playlistId = qqMatch[1]
      const neteaseMatch = importUrl.match(/playlist[?/](\d+)/)
      if (neteaseMatch) playlistId = neteaseMatch[1]

      console.log('[Import] Source:', importSource, 'ID:', playlistId)

      if (/^\d+$/.test(playlistId)) {
        const playlist = await window.api.streaming.getPlaylist(importSource, playlistId)
        console.log('[Import] Got playlist:', playlist?.name, 'tracks:', playlist?.tracks?.length)
        if (playlist) {
          await window.api.playlist.createFromRemote(playlist, importUrl)
          await refreshPlaylists()
          setShowImport(false)
          setImportUrl('')
        } else {
          console.error('[Import] Playlist not found')
        }
      } else {
        console.error('[Import] Invalid playlist ID:', playlistId)
      }
    } catch (err) {
      console.error('[Import] Failed:', err)
    } finally {
      setImporting(false)
    }
  }

  const isImported = selectedPlaylist?.sourceType === 'import'

  // 平台列内容:平铺单列表(不区分 我喜欢/自建/收藏,均为平台获取数据),
  // 头部支持折叠,折叠后保留歌单数概要
  const renderPlatformColumn = (provider: AccountProvider) => {
    const data = platformProviders[provider]
    const acc = accounts[provider]
    const hasData = data.own.length > 0 || data.collected.length > 0
    const showError = data.status === 'error' && !hasData
    const showLoading = !hasData && (data.status === 'loading' || data.status === 'idle')
    const total = data.own.length + data.collected.length
    const collapsed = platformCollapsed[provider]
    const headCount = !acc
      ? '未登录'
      : showError
        ? '同步失败'
        : data.status === 'loading' || data.status === 'idle'
          ? '同步中...'
          : `${total} 个歌单`
    const rows = (list: Playlist[], source: MusicSource) =>
      list.map(pl => {
        const isLiked = pl.id === 'liked'
        return (
          <div key={`${source}:${pl.id}`} className="platform-playlist-row" onClick={() => openRemotePlaylist(source, pl)}>
            <div className={`platform-playlist-cover${isLiked ? ' platform-liked-cover' : ''}`}>
              {isLiked ? <Heart size={16} /> : <Music size={16} />}
              {pl.coverUrl ? (
                <img
                  src={pl.coverUrl}
                  alt={pl.name}
                  onError={coverImgFallback}
                />
              ) : null}
            </div>
            <div className="platform-playlist-name" title={pl.name}>{pl.name}</div>
            <div className="platform-playlist-meta">{pl.trackCount} 首</div>
          </div>
        )
      })

    return (
      <GlassPanel key={provider} intensity="light" className="platform-column" fadeUp>
        <div className="platform-col-head">
          <button
            className="platform-col-toggle"
            title={collapsed ? '展开歌单列表' : '折叠歌单列表'}
            onClick={() => setPlatformCollapsed(s => ({ ...s, [provider]: !s[provider] }))}
          >
            <motion.span
              animate={{ rotate: collapsed ? -90 : 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ display: 'inline-flex' }}
            >
              <ChevronDown size={14} />
            </motion.span>
            <span className="platform-col-name">{PLATFORM_NAMES[provider]}</span>
          </button>
          <span className="platform-col-count">{headCount}</span>
          {acc && (
            <button
              className="btn btn-ghost btn-sm platform-col-refresh"
              title="重新同步"
              onClick={() => void syncProvider(provider, undefined, true)}
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              className="platform-col-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.26, ease: 'easeInOut' },
                opacity: { duration: 0.18, ease: 'easeOut' }
              }}
              style={{ overflow: 'hidden' }}
            >
              {!acc ? (
                <div className="platform-col-empty">
                  <Music size={22} />
                  <p>未登录{PLATFORM_NAMES[provider]}</p>
                  <span>在"账号"页登录后自动同步歌单</span>
                </div>
              ) : showError ? (
                <div className="platform-col-empty">
                  <Music size={22} />
                  <p>同步失败</p>
                  <button className="btn btn-ghost btn-sm" onClick={() => void syncProvider(provider, undefined, true)}>重试</button>
                </div>
              ) : showLoading ? (
                <div className="platform-col-loading">
                  <div className="loading-spinner" />
                  <span>同步中...</span>
                </div>
              ) : hasData ? (
                <>
                  {rows(data.own, provider as MusicSource)}
                  {rows(data.collected, provider as MusicSource)}
                </>
              ) : (
                <div className="platform-col-empty">
                  <Music size={22} />
                  <p>暂无同步歌单</p>
                  <span>该账号还没有可展示的歌单</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassPanel>
    )
  }

  return (
    <div className="page playlist-page">
      <motion.div className="page-header" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1>{selectedPlaylist ? selectedPlaylist.name : remoteSel ? remoteSel.name : '歌单'}</h1>
        <div className="page-header-actions">
          {selectedPlaylist && <button className="btn btn-ghost" onClick={handleBack}>返回</button>}
          {remoteSel && <button className="btn btn-ghost" onClick={handleBackRemote}>返回</button>}
          {!selectedPlaylist && !remoteSel && (
            <>
              <button className="btn btn-ghost btn-icon-round" onClick={() => refreshPlaylists()}><RefreshCw size={16} /></button>
              <button className="btn btn-ghost btn-icon-round" onClick={() => setShowCreate(!showCreate)}><FolderPlus size={16} /></button>
              <button className="btn btn-primary" onClick={() => { console.log('[Import] Toggle import form'); setShowImport(!showImport) }}><Plus size={16} /> 导入歌单</button>
            </>
          )}
        </div>
      </motion.div>

      {isLoading && <div className="loading-container"><div className="loading-spinner" /></div>}

      {/* 平台歌单详情视图 */}
      {remoteSel && (
        <motion.div
          initial={{ y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
          <GlassPanel intensity="medium" className="playlist-detail-header" fadeUp>
            <div className="playlist-detail-cover">
              {remoteSel.coverUrl ? (
                <img
                  src={remoteSel.coverUrl}
                  alt={remoteSel.name}
                  onError={coverImgFallback}
                />
              ) : null}
              <div className="cover-placeholder large"><Music size={48} /></div>
            </div>
            <div className="playlist-detail-info">
              <h2>{remoteSel.name}</h2>
              {remoteSel.description && <p>{remoteSel.description}</p>}
              <div className="playlist-detail-meta">
                <span>{remoteTracks.length} 首歌曲</span>
                <span>来源: {platformLabel(remoteSel.source)}</span>
                <span>类型: 平台歌单</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => { if (remoteTracks.length > 0) playAll(remoteTracks) }} disabled={remoteLoading || remoteTracks.length === 0}>播放全部</button>
              </div>
            </div>
          </GlassPanel>

          {remoteLoading ? (
            <div className="loading-container"><div className="loading-spinner" /><p>加载歌曲...</p></div>
          ) : remoteTracks.length > 0 ? (
            <TrackList
              tracks={remoteTracks}
              onPlay={(_, index) => playQueue(remoteTracks, index, { page: 'playlists', id: remoteSel.id })}
            />
          ) : (
            <GlassPanel intensity="light" className="empty-state" fadeUp><Music size={32} /><p>歌单为空</p></GlassPanel>
          )}
        </motion.div>
      )}

      {/* 本地歌单详情视图 */}
      {selectedPlaylist && (
        <motion.div
          initial={{ y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
          <GlassPanel intensity="medium" className="playlist-detail-header" fadeUp>
            <div className="playlist-detail-cover">
              {selectedPlaylist.coverUrl ? (
                <img src={selectedPlaylist.coverUrl} alt={selectedPlaylist.name} />
              ) : (
                <div className="cover-placeholder large"><Music size={48} /></div>
              )}
            </div>
            <div className="playlist-detail-info">
              <h2>{selectedPlaylist.name}</h2>
              {selectedPlaylist.description && <p>{selectedPlaylist.description}</p>}
              <div className="playlist-detail-meta">
                <span>{playlistTracks.length} 首歌曲</span>
                <span>来源: {selectedPlaylist.source === 'netease' ? '网易云' : 'QQ音乐'}</span>
                {isImported && <span>类型: 导入歌单</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handlePlayAll} disabled={playlistTracks.length === 0}>播放全部</button>
                {isImported && (
                  <button className="btn btn-ghost" onClick={handleRefresh} disabled={refreshing}>
                    {refreshing ? <RefreshCw size={16} className="spin" /> : <RefreshCw size={16} />}
                    {refreshing ? '刷新中...' : '刷新歌单'}
                  </button>
                )}
              </div>
            </div>
          </GlassPanel>

          {/* Refresh Result */}
          {refreshResult && (
            <GlassPanel intensity="light" className="import-panel" fadeUp>
              <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
                <span style={{ color: 'var(--accent-green)' }}>新增 {refreshResult.added} 首</span>
                <span style={{ color: '#ff3b30' }}>移除 {refreshResult.removed} 首</span>
                <span style={{ color: 'var(--text-secondary)' }}>保留 {refreshResult.kept} 首手动添加</span>
              </div>
            </GlassPanel>
          )}

          {loadingTracks ? (
            <div className="loading-container"><div className="loading-spinner" /><p>加载歌曲...</p></div>
          ) : playlistTracks.length > 0 ? (
            <TrackList
              tracks={playlistTracks}
              onPlay={(_, index) => playQueue(playlistTracks, index, { page: 'playlists', id: selectedPlaylistId || undefined })}
              onDelete={handleDeleteTrack}
            />
          ) : (
            <GlassPanel intensity="light" className="empty-state" fadeUp><Music size={32} /><p>歌单为空</p></GlassPanel>
          )}
        </motion.div>
      )}

      {/* 列表视图:平台歌单(两列) + 本地歌单(原样) */}
      {!selectedPlaylist && !remoteSel && !isLoading && (
        <>
          {/* 平台歌单:两列纵向排队(网易云 / QQ音乐) */}
          <motion.section
            className="playlist-section"
            initial={{ y: 12 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.26, ease: 'easeOut', delay: 0.05 }}
          >
            <motion.div
              className="playlist-section-header"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: 'easeOut', delay: 0.05 }}
            >
              <h2 className="playlist-section-title">平台歌单</h2>
              <span className="playlist-section-sub">登录平台账号后自动同步全部歌单</span>
            </motion.div>
            <div className="playlist-columns">
              {PROVIDERS.map(provider => renderPlatformColumn(provider))}
            </div>
          </motion.section>

          {/* 本地歌单:保持原有单列列表 */}
          <motion.section
            className="playlist-section"
            initial={{ y: 12 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.26, ease: 'easeOut', delay: 0.12 }}
          >
            <motion.div
              className="playlist-section-header"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: 'easeOut', delay: 0.12 }}
            >
              <h2 className="playlist-section-title">本地歌单</h2>
              <span className="playlist-section-sub">新建 / 导入的歌单保存在应用本地</span>
            </motion.div>

            {/* Create Playlist */}
            <AnimatePresence>
              {showCreate && (
                <motion.div
                  key="create-panel"
                  initial={{ y: -8, scale: 0.98 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={{ y: -8, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  <GlassPanel intensity="medium" className="import-panel" fadeUp fadeExit>
                <h3>新建歌单</h3>
                <div className="import-form">
                  <div className="import-input-row">
                    <input type="text" className="import-input" placeholder="输入歌单名称..." value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }} autoFocus />
                    <button className="btn btn-primary" onClick={handleCreate} disabled={!newPlaylistName.trim()}>
                      <FolderPlus size={16} /> 创建
                    </button>
                  </div>
                </div>
              </GlassPanel>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showImport && (
                <motion.div
                  key="import-panel"
                  initial={{ y: -8, scale: 0.98 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={{ y: -8, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  <GlassPanel intensity="medium" className="import-panel" fadeUp fadeExit>
                    <h3>导入歌单</h3>
                    <div className="import-form">
                      <div className="import-source-select">
                        <button className={`btn ${importSource === 'qqmusic' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setImportSource('qqmusic')}>QQ音乐</button>
                        <button className={`btn ${importSource === 'netease' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setImportSource('netease')}>网易云</button>
                      </div>
                      <div className="import-input-row">
                        <input type="text" className="import-input" placeholder="粘贴歌单链接或ID..." value={importUrl} onChange={(e) => setImportUrl(e.target.value)} />
                        <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                          {importing ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
                          {importing ? '导入中...' : '导入'}
                        </button>
                      </div>
                    </div>
                  </GlassPanel>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="playlist-list">
              {playlists.length === 0 ? (
                <GlassPanel intensity="light" className="empty-state" fadeUp>
                  <Music size={48} /><h3>还没有歌单</h3><p>点击"导入歌单"导入</p>
                </GlassPanel>
              ) : (
                playlists.map((playlist: SyncedPlaylist, index: number) => (
                  <div key={playlist.id}>
                    <GlassPanel intensity="light" hover className="playlist-item" onClick={() => handleSelectPlaylist(playlist.id)}>
                      <div className="playlist-item-cover">
                        {playlist.coverUrl ? <img src={playlist.coverUrl} alt={playlist.name} /> : <div className="cover-placeholder"><Music size={20} /></div>}
                      </div>
                      <div className="playlist-item-info">
                        <div className="playlist-item-name">{playlist.name}</div>
                        <div className="playlist-item-meta">
                          {playlist.tracks.length} 首歌曲 · {playlist.source === 'netease' ? '网易云' : 'QQ音乐'}
                          {playlist.sourceType === 'import' && ' · 导入'}
                        </div>
                      </div>
                      <div className="playlist-item-actions">
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); deletePlaylist(playlist.id) }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </GlassPanel>
                  </div>
                ))
              )}
            </div>
          </motion.section>
        </>
      )}
    </div>
  )
}
