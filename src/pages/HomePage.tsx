// 首页(QQ音乐式 v2):
// - 欢迎语页头(时段问候 + 听歌历史入口)
// - 主推大卡 + 三张快捷小卡(热歌榜/本地曲库/听歌历史)
// - 「宝藏好歌」个性化推荐 3×n(QQ热歌榜 ∪ 本地曲库 → 听歌行为引擎打分)
// - 「官方榜单」玻璃榜单卡,点击即时拉取后整单播放
// - 「你的歌单宝藏库」平台同步歌单 ∪ 本地歌单 封面墙(封面卡保留,点击直接播放)
import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Play, Pause, ChevronRight, ListMusic, TrendingUp, Library, Clock, Gem,
  Music, Sparkles, Rocket, ListEnd
} from 'lucide-react'
import { GlassPanel } from '../components/common/GlassPanel'
import { TrackList } from '../components/common/TrackList'
import { Track, Playlist, MusicSource } from '@shared/types/streaming'
import { SyncedPlaylist } from '@shared/types/playlist'
import { AccountProvider } from '@shared/types/accounts'
import { usePlayback } from '../hooks/usePlayback'
import { usePlaybackStore } from '../stores/playbackStore'
import { generateRecommendations } from '../utils/recommendEngine'
import { coverImgFallback } from '../utils/cover'
import { useLocalLibraryStore } from '../stores/localLibraryStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlatformPlaylistsStore, platformLabel } from '../stores/platformPlaylistsStore'
import { useAccountStore } from '../stores/accountStore'

interface HomePageProps {
  onNavigate: (page: string) => void
}

// 时段问候:夜里的 0~4.5 点与 23 点后用晚安语境,其余按常规分段
function timeGreeting(): { title: string; sub: string } {
  const h = new Date().getHours()
  if (h < 5) return { title: '夜深了', sub: '夜色正浓,来点安静的音乐吧~' }
  if (h < 11) return { title: '早上好', sub: '用音乐开启元气满满的一天吧~' }
  if (h < 14) return { title: '中午好', sub: '来点轻快的音乐提提神吧~' }
  if (h < 18) return { title: '下午好', sub: '让音乐陪你度过这段时光~' }
  if (h < 23) return { title: '晚上好', sub: '夜幕降临,音乐正当时~' }
  return { title: '夜深了', sub: '听首好歌,给今天收个尾吧~' }
}

// 榜单卡片(玻璃组件,即时拉取,不预取首曲,保持首页轻量)
const TOP_CARDS: { topid: number; name: string; desc: string; icon: typeof TrendingUp }[] = [
  { topid: 26, name: '热歌榜', desc: 'QQ音乐 · 每天都在变', icon: TrendingUp },
  { topid: 27, name: '新歌榜', desc: 'QQ音乐 · 最新发行', icon: Sparkles },
  { topid: 62, name: '飙升榜', desc: 'QQ音乐 · 上升最快', icon: Rocket }
]
const PICK_GRADS = [
  'linear-gradient(135deg,#2c3a6e,#5d69b3)',
  'linear-gradient(135deg,#7a4a24,#d19a5b)',
  'linear-gradient(135deg,#27505a,#6ba9a5)',
  'linear-gradient(135deg,#4a2c56,#a06b93)',
  'linear-gradient(135deg,#204a37,#5c9a6e)',
]

export function HomePage({ onNavigate }: HomePageProps) {
  const { playQueue, togglePlay } = usePlayback()
  const greet = timeGreeting()

  // 问候称呼:设置里自定义 > Windows 登录用户名 > 默认「希」
  const [greetName, setGreetName] = useState('希')
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const nick = await window.api.settings.get('settings.nickname', '')
        let name = typeof nick === 'string' && nick.trim() ? nick.trim() : ''
        if (!name) {
          const win = await window.api.settings.getWindowsUsername().catch(() => '')
          if (typeof win === 'string' && win.trim()) name = win.trim()
        }
        if (alive && name) setGreetName(name)
      } catch { /* 保持默认 */ }
    })()
    return () => { alive = false }
  }, [])

  const [treasure, setTreasure] = useState<Track[]>([])   // 宝藏好歌(个性化 9 首)
  const [busyTop, setBusyTop] = useState<number | null>(null)     // 榜单卡拉取中
  const [busyPl, setBusyPl] = useState<string | null>(null)       // 歌单卡拉取中(key)
  // 详情视图:榜单/歌单点卡后展示歌曲列表(替代直接播放)
  const [detail, setDetail] = useState<{ key: string; title: string; subtitle: string; tracks: Track[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 平台歌单快照(未自动同步的账号线程内补一次)
  const platformProviders = usePlatformPlaylistsStore((s) => s.providers)
  const syncProvider = usePlatformPlaylistsStore((s) => s.syncProvider)
  const accounts = useAccountStore((s) => s.accounts)
  const localPlaylists = usePlaylistStore((s) => s.playlists)
  const refreshPlaylists = usePlaylistStore((s) => s.refreshPlaylists)
  const localLibLoaded = useLocalLibraryStore((s) => s.loaded)
  const localTracks = useLocalLibraryStore((s) => s.tracks)

  // 宝藏好歌生成:基于「平台歌单名关键词 ∪ 喜欢的歌」搜索候选打分推荐;
  // 没有任何平台登录(两线结算且无歌单/无候选)时 → 官方歌单兜底(QQ 热歌榜 ∪ 本地曲库)。
  // 平台同步是异步的:等两条线结算(非 loading)再判,已生成则跳过。
  const treasureDoneRef = useRef(false)
  const treasureGeneratingRef = useRef(false)
  useEffect(() => {
    let alive = true
    // 本地曲库 + 本地歌单惰性初始化(先前没进过对应页也没事)
    void useLocalLibraryStore.getState().init()
    void refreshPlaylists()
    // 平台歌单:已登录但还没同步的账号线程内补同步
    for (const p of ['netease', 'qqmusic'] as AccountProvider[]) {
      const acc = accounts[p]
      if (acc?.isLoggedIn && acc.userId && platformProviders[p].status === 'idle') {
        void syncProvider(p)
      }
    }
    if (treasureDoneRef.current || treasureGeneratingRef.current) return
    // 等平台线结算(idle=未登录;ready/error=结算;loading=同步中再等)
    const settled = (['netease', 'qqmusic'] as AccountProvider[]).every((p) => platformProviders[p].status !== 'loading')
    if (!settled) return
    treasureGeneratingRef.current = true
    void (async () => {
      try {
        // ① 从平台歌单名提取关键词(按出现频次计权,滤噪词/无中文段)
        const SPLIT = /[\s\-_|,，、。/·:：()()【】\[\]「」《》+&～~]+/
        const pool: Track[] = []
        const seen = new Set<string>()
        const pushAll = (list: Track[]) => {
          for (const t of list) {
            if (!t || !t.id) continue
            const k = `${t.source}:${t.id}`
            if (seen.has(k)) continue
            seen.add(k)
            pool.push(t)
          }
        }
        await Promise.all((['netease', 'qqmusic'] as AccountProvider[]).map(async (p) => {
          const freq = new Map<string, number>()
          for (const plItem of [...platformProviders[p].own, ...platformProviders[p].collected]) {
            for (const seg of (plItem.name || '').split(SPLIT)) {
              const m = seg.match(/[\u4e00-\u9fa5]{2,8}/)
              const w = m ? m[0] : ''
              if (!w) continue
              // 噪词过滤(合集类标题里的泛词不当搜索词)
              if (/^(歌单|推荐|精选|合集|专用|私藏|收藏|好听|音乐|歌曲|翻唱|伴奏|纯音乐|热歌|最热|免费|下载|无损|华语|年度|必备)$/.test(w)) continue
              freq.set(w, (freq.get(w) || 0) + 1)
            }
          }
          const kws = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w)
          // ② 关键词逐个搜歌作候选
          await Promise.all(kws.map(async (kw) => {
            try {
              pushAll((await window.api.streaming.search({ query: kw, source: p as MusicSource, type: ['track'], limit: 12 })).tracks)
            } catch { /* 单词失败不阻塞整体 */ }
          }))
          // ③ 喜欢的歌(我喜欢歌单)入池
          const liked = [...platformProviders[p].own].find((x) => /我喜欢|喜欢的音乐/.test(x.name || ''))
          if (liked) {
            try { pushAll(((await window.api.streaming.getPlaylist(liked.source, liked.id)).tracks || []).slice(0, 40)) } catch { /* ignore */ }
          }
        }))
        if (!alive) return
        // ④ 有候选 → 引擎打分出 9 首;全无(未登录/搜索空) → 官方歌单兜底
        let recs: Track[] = pool.length > 0 ? await generateRecommendations(pool, 9) : []
        if (!alive) return
        if (recs.length === 0) {
          const officials: Track[] = []
          try { officials.push(...await window.api.streaming.getToplist(26, 60)) } catch { /* 未登录/离线按空处理 */ }
          try {
            const lib = useLocalLibraryStore.getState()
            if (!lib.loaded) await lib.init()
            if (alive) officials.push(...useLocalLibraryStore.getState().tracks)
          } catch { /* ignore */ }
          recs = await generateRecommendations(officials, 9)
        }
        if (alive) {
          setTreasure(recs)
          treasureDoneRef.current = true
        }
      } finally {
        treasureGeneratingRef.current = false
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformProviders, localLibLoaded])

  // 主推卡随机逻辑:
  // 1) 应用启动:忽略上一会话恢复的曲目,从「用户歌单」完全随机抽一批 30 首(每次启动清空旧随机重新抽)
  // 2) 本会话开始播放/切歌后 → 跟随控制栏当前曲目(封面即现在播放)
  // 3) 播放/暂停按钮跟随主播放栏:当前曲目播放中显示暂停,点击暂停/续播;未在播则起播这批 30 首
  const currentTrack = usePlaybackStore((s) => s.currentTrack)
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const [heroBatch, setHeroBatch] = useState<Track[]>([])    // 从用户歌单完全随机抽的一批(≤30 首)
  const heroPickingRef = useRef(false)                        // 抽取进行中(防并发重复)
  // 启动时恢复的旧曲目 id:不算"本会话在播",不跟随
  const bootTrackIdRef = useRef<string | null>(currentTrack?.id ?? null)
  // 本会话已接管播放:正在播放,或当前曲目已不是启动恢复的那首(切歌/点播都算)
  const heroFollowLive = !!currentTrack && (isPlaying || currentTrack.id !== bootTrackIdRef.current)
  const heroTrack = (heroFollowLive ? currentTrack : null) || heroBatch[0] || null
  const heroPlayingNow = heroFollowLive && isPlaying

  useEffect(() => {
    // 已随机过或抽取进行中:跳过;歌单池/曲库都还没加载时等待,任意数据落地后由依赖变化再触发
    if (heroBatch.length > 0 || heroPickingRef.current) return
    const syncLists = (['netease', 'qqmusic'] as AccountProvider[]).flatMap((src) => [
      ...platformProviders[src].own,
      ...platformProviders[src].collected
    ])
    const localLists = usePlaylistStore.getState().playlists
    const libTracks = useLocalLibraryStore.getState().tracks.filter((t) => !!t.id)
    if (syncLists.length === 0 && localLists.length === 0 && libTracks.length === 0 && treasure.length === 0) return
    heroPickingRef.current = true
    void (async () => {
      // 全部池合并去重(平台歌单曲目 ∪ 本地歌单曲目;空了再曲库/宝藏兜底)
      const merged: Track[] = []
      const seen = new Set<string>()
      const pushPool = (list: Track[]) => {
        for (const t of list) {
          if (!t || !t.id) continue
          const k = `${t.source}:${t.id}`
          if (seen.has(k)) continue
          seen.add(k)
          merged.push(t)
        }
      }
      // 本地歌单曲目内嵌,即时入池
      for (const p of localLists) {
        pushPool((p.tracks || []).map((st) => st.track).filter(Boolean))
      }
      // 平台歌单完全随机抽一张,拉其曲目入池(失败按空,不影响本地池)
      if (syncLists.length > 0) {
        const pl = syncLists[Math.floor(Math.random() * syncLists.length)]
        try {
          const d = await window.api.streaming.getPlaylist(pl.source, pl.id)
          if (d.tracks && d.tracks.length > 0) pushPool(d.tracks)
        } catch { /* ignore */ }
      }
      if (merged.length === 0) pushPool(libTracks)
      if (merged.length === 0) pushPool(treasure)
      // Fisher-Yates 全池洗牌,取前 30 首作为随机批
      for (let i = merged.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = merged[i]
        merged[i] = merged[j]
        merged[j] = tmp
      }
      setHeroBatch(merged.slice(0, 30))
    })().finally(() => {
      heroPickingRef.current = false
    })
  }, [heroBatch, treasure, platformProviders, localTracks])

  // 榜单详情:点卡后展示歌曲列表(不直接播放)
  const openTopDetail = async (topid: number, name: string) => {
    if (detailLoading) return
    setBusyTop(topid)
    setDetailLoading(true)
    try {
      const tracks = await window.api.streaming.getToplist(topid, 50)
      setDetail({ key: `top${topid}`, title: name, subtitle: 'QQ音乐官方榜单', tracks })
      document.querySelector('.nex-content')?.scrollTo({ top: 0 })
    } catch (err) { console.error('[Home] toplist failed:', err) }
    finally { setBusyTop(null); setDetailLoading(false) }
  }

  // 歌单详情:点卡拉取曲目后展示列表(不直接播放);本地歌单曲目内嵌即时返回
  const openPlaylistDetail = async (key: string, title: string, subtitle: string, load: () => Promise<Track[]>) => {
    if (detailLoading) return
    setBusyPl(key)
    setDetailLoading(true)
    try {
      const tracks = await load()
      setDetail({ key, title, subtitle, tracks })
      document.querySelector('.nex-content')?.scrollTo({ top: 0 })
    } catch (err) { console.error('[Home] playlist failed:', err) }
    finally { setBusyPl(null); setDetailLoading(false) }
  }

  // 平台歌单与本地歌单的曲目加载器(详情视图用)
  const loadPlatformTracks = async (source: MusicSource, id: string): Promise<Track[]> => {
    const d = await window.api.streaming.getPlaylist(source, id)
    return d.tracks || []
  }
  const loadLocalTracks = (p: SyncedPlaylist): Track[] =>
    p.tracks.map((st) => st.track).filter(Boolean)

  // 歌单宝藏库:平台自建+收藏 与 本地歌单合并
  const platformPls: Playlist[] = (['netease', 'qqmusic'] as AccountProvider[]).flatMap((p) => [
    ...platformProviders[p].own,
    ...platformProviders[p].collected
  ])

  const fadeUp = (i: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.28, ease: 'easeOut' as const, delay: 0.05 * i }
  })

  return (
    <div className="page home-page">
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
              onClick={() => playQueue(detail.tracks, 0, { page: 'home', id: detail.key })}
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
              onPlay={(_, i) => playQueue(detail.tracks, i, { page: 'home', id: detail.key })}
            />
          )}
        </motion.div>
      ) : (
      <>
      {/* 欢迎页头 */}
      <motion.div className="home-greet" {...fadeUp(0)}>
        <div>
          <h1 className="home-greet-title">Hi {greetName} 今日为你推荐</h1>
          <p className="home-greet-sub">{greet.title} · {greet.sub}</p>
        </div>
        <button className="home-report-link" onClick={() => onNavigate('history')}>
          查看你的听歌历史 <ChevronRight size={15} />
        </button>
      </motion.div>

      {/* 主推大卡 + 快捷小卡 */}
      <motion.div className="home-hero" {...fadeUp(1)}>
        <GlassPanel intensity="medium" hover className="home-hero-main">
          {heroTrack ? (
            <>
              <div className="hero-text">
                <div className="hero-title">{greet.title}</div>
                <div className="hero-sub">来听一点音乐吧～</div>
                <button
                  className="hero-play"
                  title={heroPlayingNow ? '暂停' : '播放'}
                  aria-label={heroPlayingNow ? '暂停' : '播放随机 30 首'}
                  onClick={() => {
                    if (!heroTrack || heroBatch.length === 0) return
                    // 跟随控制栏:正是当前曲目 → 切换播放/暂停;否则起播随机 30 首整批队列
                    if (currentTrack && currentTrack.id === heroTrack.id) {
                      togglePlay()
                      return
                    }
                    void playQueue(heroBatch, 0, { page: 'home', id: 'pick' })
                  }}
                >
                  {heroPlayingNow
                    ? <Pause size={22} fill="currentColor" />
                    : <Play size={22} fill="currentColor" style={{ marginLeft: 2 }} />}
                </button>
              </div>
              <div className="hero-disc">
                <img src={heroTrack.albumCoverUrl} alt={heroTrack.name} onError={coverImgFallback} />
              </div>
            </>
          ) : (
            <div className="hero-text">
              <div className="hero-title">{greet.title}</div>
              <div className="hero-sub">正在为你准备推荐...</div>
            </div>
          )}
        </GlassPanel>
        <div className="home-hero-side">
          <GlassPanel intensity="light" hover className="home-hero-card" onClick={() => onNavigate('library')}>
            <ListMusic size={26} />
            <div className="hero-card-name">推荐歌单</div>
            <div className="hero-card-desc">网易/QQ · 双平台</div>
          </GlassPanel>
          <GlassPanel intensity="light" hover className="home-hero-card" onClick={() => onNavigate('local')}>
            <Library size={26} />
            <div className="hero-card-name">本地曲库</div>
            <div className="hero-card-desc">{localLibLoaded ? `${localTracks.length} 首 · 离线畅听` : '扫描中...'}</div>
          </GlassPanel>
          <GlassPanel intensity="light" hover className="home-hero-card" onClick={() => onNavigate('history')}>
            <Clock size={26} />
            <div className="hero-card-name">听歌历史</div>
            <div className="hero-card-desc">最近听到哪了,接着听</div>
          </GlassPanel>
        </div>
      </motion.div>

      {/* 宝藏好歌 */}
      <motion.section className="home-section" {...fadeUp(2)}>
        <div className="home-sec-head">
          <h2>「{greetName}」，这是你的宝藏好歌 <Gem size={16} style={{ display: 'inline' }} /></h2>
          <button
            className="home-play-all" title="播放全部" aria-label="播放全部宝藏好歌"
            disabled={treasure.length === 0}
            onClick={() => playQueue(treasure, 0, { page: 'home', id: 'treasure' })}
          >
            <Play size={15} fill="currentColor" style={{ marginLeft: 1 }} />
          </button>
        </div>
        <div className="home-song-grid">
          {treasure.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="home-song-row home-song-skel">
                <div className="home-song-cover skel" />
                <div className="skel skel-bar" />
              </div>
            ))
            : treasure.map((t: Track, i: number) => (
              <div key={`${t.source}:${t.id}`} className="home-song-row" onClick={() => playQueue(treasure, i, { page: 'home', id: 'treasure' })}>
                <div className="home-song-cover">
                  <img src={t.albumCoverUrl} alt={t.name} loading="lazy" onError={coverImgFallback} />
                </div>
                <div className="home-song-info">
                  <div className="home-song-name">
                    <span className="home-song-name-text">{t.name}</span>
                  </div>
                  <div className="home-song-artist">{t.artists.join(' / ')}</div>
                </div>
              </div>
            ))}
        </div>
      </motion.section>

      {/* 官方榜单 */}
      <motion.section className="home-section" {...fadeUp(3)}>
        <div className="home-sec-head">
          <h2>官方榜单，听点不一样的 <TrendingUp size={16} style={{ display: 'inline' }} /></h2>
        </div>
        <div className="home-top-grid">
          {TOP_CARDS.map((c) => {
            const Icon = c.icon
            return (
              <GlassPanel
                key={c.topid}
                intensity="medium"
                hover
                className="home-top-card"
                onClick={() => void openTopDetail(c.topid, c.name)}
              >
                <div className="home-top-tag">官方榜</div>
                <Icon size={26} style={{ color: 'var(--nb-accent, #98DDD0)' }} />
                <div className="home-top-name">{busyTop === c.topid ? '正在拉取...' : c.name}</div>
                <div className="home-top-desc">{busyTop === c.topid ? '马上就来' : c.desc}</div>
                <ListEnd className="home-top-icon" size={54} />
              </GlassPanel>
            )
          })}
        </div>
      </motion.section>

      {/* 你的歌单宝藏库 */}
      <motion.section className="home-section" {...fadeUp(4)}>
        <div className="home-sec-head">
          <h2>你的歌单宝藏库 <ListMusic size={16} style={{ display: 'inline' }} /></h2>
        </div>
        {platformPls.length === 0 && localPlaylists.length === 0 ? (
          <GlassPanel intensity="light" className="home-pl-empty">
            <Music size={24} />
            <p>还没有歌单</p>
            <span>登录平台账号或在「歌单」页新建,就会出现在这里</span>
          </GlassPanel>
        ) : (
          <div className="home-pl-grid">
            {platformPls.map((pl, i) => {
              const key = `${pl.source}:${pl.id}`
              return (
                <motion.div
                  key={key}
                  className={`home-pl-card ${busyPl === key ? 'home-pl-card-busy' : ''}`}
                  {...fadeUp(5 + (i % 5))}
                  onClick={() => void openPlaylistDetail(key, pl.name, platformLabel(pl.source), () => loadPlatformTracks(pl.source, pl.id))}
                >
                  <div className="home-pl-cover">
                    {pl.coverUrl
                      ? <img src={pl.coverUrl} alt={pl.name} loading="lazy" onError={coverImgFallback} />
                      : <div className="home-pl-cover-ph" style={{ background: PICK_GRADS[i % PICK_GRADS.length] }}><Music size={28} /></div>}
                    <div className="home-pl-badge">{pl.trackCount} 首</div>
                  </div>
                  <div className="home-pl-name" title={pl.name}>{pl.name}</div>
                  <div className="home-pl-meta">{platformLabel(pl.source)}</div>
                </motion.div>
              )
            })}
            {localPlaylists.map((p, i) => {
              const key = `local:${p.id}`
              return (
                <motion.div
                  key={key}
                  className={`home-pl-card ${busyPl === key ? 'home-pl-card-busy' : ''}`}
                  {...fadeUp(5 + (i % 5))}
                  onClick={() => void openPlaylistDetail(key, p.name, '本地', async () => loadLocalTracks(p))}
                >
                  <div className="home-pl-cover">
                    {p.coverUrl
                      ? <img src={p.coverUrl} alt={p.name} loading="lazy" onError={coverImgFallback} />
                      : <div className="home-pl-cover-ph" style={{ background: PICK_GRADS[(i + 2) % PICK_GRADS.length] }}><Music size={28} /></div>}
                    <div className="home-pl-badge">{p.tracks.length} 首</div>
                  </div>
                  <div className="home-pl-name" title={p.name}>{p.name}</div>
                  <div className="home-pl-meta">本地</div>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.section>
      </>
      )}
    </div>
  )
}
