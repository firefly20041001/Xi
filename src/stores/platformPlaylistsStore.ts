// 平台歌单同步:账号登录后自动拉取各平台的歌单,平铺单列表展示。
// 网易云:user playlists 混合自建+收藏,按 creatorId 分成 own/collected;
// "我喜欢的音乐"作为普通歌单保留在 own 中。
// QQ:自建来自 user playlists(dirid=201 的"我喜欢"行由服务端原生返回,
// id 归一为 "liked",详情走专用 CgiGetDiss 接口);收藏走独立接口。
// 不再展示任何合成卡片,仅保留平台获取的歌单。
import { create } from 'zustand'
import { Playlist, MusicSource } from '@shared/types/streaming'
import { AccountProvider, AccountInfo } from '@shared/types/accounts'
import { useAccountStore } from './accountStore'

const PROVIDERS: AccountProvider[] = ['netease', 'qqmusic']

const SOURCE_LABEL: Record<MusicSource, string> = {
  netease: '网易云',
  qqmusic: 'QQ音乐',
  local: '本地'
}

export function platformLabel(source: MusicSource): string {
  return SOURCE_LABEL[source]
}

export interface PlatformPlaylistsData {
  status: 'idle' | 'loading' | 'ready' | 'error'
  own: Playlist[]
  collected: Playlist[]
}

interface PlatformPlaylistsState {
  providers: Record<AccountProvider, PlatformPlaylistsData>
  syncedFor: Record<AccountProvider, string | null>
  // 账号快照变化时调用(装载/登录/登出);未登录的清空,新登录的自动拉取
  syncAll: (accounts: Record<AccountProvider, AccountInfo | null>) => void
  syncProvider: (provider: AccountProvider, userId?: string, force?: boolean) => Promise<void>
  clearProvider: (provider: AccountProvider) => void
}

const makeProviders = (): Record<AccountProvider, PlatformPlaylistsData> => ({
  netease: { status: 'idle', own: [], collected: [] },
  qqmusic: { status: 'idle', own: [], collected: [] }
})

export const usePlatformPlaylistsStore = create<PlatformPlaylistsState>((set, get) => ({
  providers: makeProviders(),
  syncedFor: { netease: null, qqmusic: null },

  syncAll: (accounts) => {
    for (const provider of PROVIDERS) {
      const acc = accounts[provider]
      const synced = get().syncedFor[provider]
      if (!acc?.isLoggedIn || !acc.userId) {
        if (synced) get().clearProvider(provider)
      } else if (synced !== acc.userId) {
        void get().syncProvider(provider, acc.userId)
      }
    }
  },

  syncProvider: async (provider, userId, force = false) => {
    const data = get().providers[provider]
    const accounts = useAccountStore.getState().accounts
    const acc = accounts[provider]
    if (force) {
      userId = userId ?? acc?.userId ?? ''
    } else {
      // 未 force:只在"有登录账号且该 userId 未同步过"时拉取(订阅风暴去重)
      if (!acc?.isLoggedIn || !acc.userId || get().syncedFor[provider] === acc.userId) return
      if (data.status === 'loading') return
      userId = acc.userId
    }
    if (!userId) return

    set((s) => ({
      providers: { ...s.providers, [provider]: { ...s.providers[provider], status: 'loading' } }
    }))

    let userPlaylists: Playlist[] = []
    let collected: Playlist[] = []
    let ok = false

    try {
      userPlaylists = await window.api.streaming.getUserPlaylists(provider as MusicSource, userId)
      ok = true
    } catch (err) {
      console.error(`[PlatformPlaylists] ${provider} getUserPlaylists failed:`, err)
    }
    try {
      collected = await window.api.streaming.getCollectedPlaylists(provider as MusicSource, userId)
    } catch (err) {
      console.error(`[PlatformPlaylists] ${provider} getCollectedPlaylists failed:`, err)
    }
    collected = collected.filter((p) => p.id !== 'qq_toplist_26')

    if (!ok) {
      set((s) => ({
        providers: { ...s.providers, [provider]: { ...s.providers[provider], status: 'error' } }
      }))
      return
    }

    if (provider === 'netease') {
      // 平铺展示不分类:自建=创作者本人(含"我喜欢的音乐",按普通歌单发详情);
      // 收藏=创作者非本人。
      const own = userPlaylists.filter((p) => p.creatorId === userId)
      const collectedPl = userPlaylists.filter((p) => p.creatorId !== userId)
      set((s) => ({
        providers: {
          ...s.providers,
          [provider]: { status: 'ready', own, collected: collectedPl }
        },
        syncedFor: { ...s.syncedFor, [provider]: userId }
      }))
    } else {
      // QQ:自建列表(含服务端原生的 dirid=201 "我喜欢"行,id="liked");
      // 收藏来自独立端点;旧版飙升榜占位剔除
      const own = userPlaylists.filter((p) => p.id !== 'qq_toplist_26')
      set((s) => ({
        providers: {
          ...s.providers,
          [provider]: { status: 'ready', own, collected }
        },
        syncedFor: { ...s.syncedFor, [provider]: userId }
      }))
    }
  },

  clearProvider: (provider) => {
    set((s) => ({
      providers: {
        ...s.providers,
        [provider]: { status: 'idle', own: [], collected: [] }
      },
      syncedFor: { ...s.syncedFor, [provider]: null }
    }))
  }
}))
