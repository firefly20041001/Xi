// 本地音乐库:目录管理 + 目录扫描 + 时长懒探测。
// 持久化只存目录列表(settings 'local.dirs');曲目每次进入页面从磁盘重扫,
// 不入库冗余数据。播放复用统一 Track,队列逻辑与在线音源完全一致。
import { create } from 'zustand'
import { Track, LocalFileInfo } from '@shared/types/streaming'
import { convertFileSrc } from '@tauri-apps/api/core'
import { LOCAL_DEFAULT_COVER } from '../utils/cover'

interface LocalLibraryState {
  dirs: string[]
  tracks: Track[]
  scanning: boolean
  loaded: boolean
  init: () => Promise<void>
  addDirectories: (paths: string[]) => Promise<void>
  removeDirectory: (path: string) => Promise<void>
  rescan: () => Promise<void>
  markDuration: (path: string, ms: number) => void
  probeDurations: () => Promise<void>
}

const DIRS_KEY = 'local.dirs'

// 文件名启发:"歌手 - 标题" → artists + name;多歌手按 / 、 & , 分隔
export function parseLocalName(fileName: string): { name: string; artists: string[] } {
  const stem = fileName.replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus|ape|wma|aiff)$/i, '')
  const sep = stem.indexOf(' - ')
  if (sep > 0) {
    const artistPart = stem.slice(0, sep).trim()
    const rest = stem.slice(sep + 3).trim()
    if (artistPart && rest) {
      return {
        name: rest,
        artists: artistPart.split(/[\/、&,]/).map((a) => a.trim()).filter(Boolean)
      }
    }
  }
  return { name: stem, artists: [] }
}

// 目录归属判断(attr 协议路径与 Rust 返回路径同为原生分隔符,归一后再比较)
function isUnderDir(filePath: string, dir: string): boolean {
  const norm = filePath.replace(/\//g, '\\').toLowerCase()
  const d = dir.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '')
  return norm === d || norm.startsWith(d + '\\')
}

export function dirDisplayName(dir: string): string {
  const parts = dir.replace(/\//g, '\\').split('\\').filter(Boolean)
  return parts[parts.length - 1] || '本地目录'
}

function toTrack(f: LocalFileInfo): Track {
  const { name, artists } = parseLocalName(f.fileName)
  return {
    id: f.path,
    source: 'local',
    name,
    artists,
    albumName: dirDisplayName(f.dir),
    albumId: '',
    // 本地文件无内嵌封面:统一回退应用图标
    albumCoverUrl: LOCAL_DEFAULT_COVER,
    duration: 0,
    filePath: f.path
  }
}

// 音频元素探测时长(loadedmetadata),8s 兜底
function probeDuration(path: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio()
    let done = false
    const finish = (ms: number) => { if (!done) { done = true; a.removeAttribute('src'); resolve(ms) } }
    a.preload = 'metadata'
    a.src = convertFileSrc(path)
    a.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : 0)
    })
    a.addEventListener('error', () => finish(0))
    window.setTimeout(() => finish(0), 8000)
  })
}

export const useLocalLibraryStore = create<LocalLibraryState>((set, get) => ({
  dirs: [],
  tracks: [],
  scanning: false,
  loaded: false,

  init: async () => {
    if (get().loaded) return
    try {
      const saved = await window.api.settings.get(DIRS_KEY, [])
      const valid = Array.isArray(saved) ? saved.filter((d) => typeof d === 'string') : []
      set({ dirs: valid })
      // 恢复 asset 协议授权(选过的目录要重新允许才能读)
      for (const d of valid) window.api.local.allowDirectory(d).catch(() => {})
      if (valid.length > 0) await get().rescan()
      else set({ loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  addDirectories: async (paths) => {
    const { dirs } = get()
    const fresh = paths.filter((p) => !dirs.includes(p))
    if (fresh.length === 0) return
    const next = [...dirs, ...fresh]
    set({ dirs: next })
    window.api.settings.set(DIRS_KEY, next).catch(() => {})
    for (const p of fresh) window.api.local.allowDirectory(p).catch(() => {})
    set({ scanning: true })
    const added: Track[] = []
    for (const p of fresh) {
      try {
        const files = await window.api.local.scanDirectory(p)
        added.push(...files.map(toTrack))
      } catch { /* 目录不可读按空处理 */ }
    }
    set({ tracks: [...get().tracks, ...added], scanning: false, loaded: true })
  },

  removeDirectory: async (path) => {
    const { dirs, tracks } = get()
    const nextDirs = dirs.filter((d) => d !== path)
    const nextTracks = tracks.filter((t) => !t.filePath || !isUnderDir(t.filePath, path))
    set({ dirs: nextDirs, tracks: nextTracks })
    window.api.settings.set(DIRS_KEY, nextDirs).catch(() => {})
  },

  rescan: async () => {
    const { dirs } = get()
    if (dirs.length === 0) { set({ tracks: [], scanning: false, loaded: true }); return }
    set({ scanning: true })
    const all: Track[] = []
    for (const d of dirs) {
      try {
        const files = await window.api.local.scanDirectory(d)
        all.push(...files.map(toTrack))
      } catch { /* 忽略不可读目录 */ }
    }
    set({ tracks: all, scanning: false, loaded: true })
  },

  markDuration: (path, ms) => {
    set({
      tracks: get().tracks.map((t) => (t.filePath === path ? { ...t, duration: ms } : t))
    })
  },

  probeDurations: async () => {
    const { tracks, markDuration } = get()
    const pending = tracks.filter((t) => t.duration === 0 && t.filePath)
    // 并发 2,避免大库一次占用过多 IO
    let cursor = 0
    const next = async (): Promise<void> => {
      if (cursor >= pending.length) return
      const track = pending[cursor++]
      const ms = await probeDuration(track.filePath!)
      if (ms > 0) markDuration(track.filePath!, ms)
      await next()
    }
    await Promise.all([next(), next()])
  }
}))
