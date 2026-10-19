// 本地音乐页:多目录管理 + 曲目列表。
// 播放复用统一队列(playQueue),本地与在线音源可混排同一播放列表;
// 目录列表持久化在 settings,曲目每次进入页面从磁盘重扫。
import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, RefreshCw, Music, Plus, X } from 'lucide-react'
import { GlassPanel } from '../components/common/GlassPanel'
import { TrackList } from '../components/common/TrackList'
import { usePlayback } from '../hooks/usePlayback'
import { useLocalLibraryStore, dirDisplayName } from '../stores/localLibraryStore'

export function LocalMusicPage() {
  const {
    dirs, tracks, scanning, loaded,
    init, addDirectories, removeDirectory, rescan, probeDurations
  } = useLocalLibraryStore()
  const { playAll, playQueue } = usePlayback()

  useEffect(() => { void init() }, [])

  // 扫描完成后懒探测缺失的时长
  useEffect(() => {
    if (!scanning && loaded && tracks.some((t) => t.duration === 0 && t.filePath)) {
      void probeDurations()
    }
  }, [scanning, loaded, tracks.length])

  const handleAddDir = async () => {
    try {
      const picked = await window.api.local.pickDirectories()
      if (picked && picked.length > 0) await addDirectories(picked)
    } catch { /* 用户取消或打开失败 */ }
  }

  return (
    <div className="page local-page">
      <motion.div
        className="page-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1>本地音乐</h1>
        <div className="page-header-actions">
          <button
            className="btn btn-ghost"
            disabled={scanning || dirs.length === 0}
            onClick={() => void rescan()}
          >
            <RefreshCw size={16} />
            重新扫描
          </button>
          <button className="btn btn-primary" onClick={() => void handleAddDir()}>
            <Plus size={16} />
            添加目录
          </button>
        </div>
      </motion.div>

      {dirs.length > 0 && (
        <div className="local-dirs">
          {dirs.map((d) => (
            <span key={d} className="local-dir-chip" title={d}>
              <FolderOpen size={13} />
              <span className="local-dir-name">{dirDisplayName(d)}</span>
              <button
                className="local-dir-remove"
                aria-label="移除目录"
                title="移除目录"
                onClick={() => void removeDirectory(d)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!loaded ? null : dirs.length === 0 ? (
        <GlassPanel intensity="light" className="empty-state">
          <FolderOpen size={48} />
          <h3>还没有添加目录</h3>
          <p>添加本地音乐文件夹后即可播放,可添加多个目录</p>
          <button className="btn btn-primary" onClick={() => void handleAddDir()}>
            <Plus size={16} />
            添加目录
          </button>
        </GlassPanel>
      ) : tracks.length === 0 ? (
        <GlassPanel intensity="light" className="empty-state">
          <Music size={48} />
          <h3>{scanning ? '正在扫描…' : '目录里没有音频文件'}</h3>
          <p>支持 mp3 / flac / wav / m4a / aac / ogg 等格式</p>
        </GlassPanel>
      ) : (
        <div>
          <div className="list-topbar">
            <p>共 {tracks.length} 首{scanning ? ' · 正在扫描…' : ''}</p>
            <button
              className="play-all"
              title="播放全部"
              aria-label="播放全部本地歌曲"
              disabled={tracks.length === 0}
              onClick={() => playAll(tracks)}
            >
              <span className="play-all-disc"><Music size={12} fill="currentColor" /></span>
              播放全部
            </button>
          </div>
          <TrackList
            tracks={tracks}
            showSource={false}
            onPlay={(_track, index) => playQueue(tracks, index, { page: 'local' })}
          />
        </div>
      )}
    </div>
  )
}
