// 列表页浮动导航钮(右下悬浮,位于播放栏上方):
// 定位当前歌曲——平滑滚动到正在播的高亮行并短暂脉冲提示;回到最顶——平滑滚回内容区顶部。
// 仅在包含歌曲列表的页面(search/playlists/history)显示。
import React from 'react'
import { ArrowUpToLine, LocateFixed } from 'lucide-react'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useUIStore } from '../../stores/uiStore'

const LIST_PAGES = new Set(['search', 'playlists', 'history', 'local'])

export function ListNavFab() {
  const currentTrack = usePlaybackStore((s) => s.currentTrack)
  const activePage = useUIStore((s) => s.activePage)

  if (!LIST_PAGES.has(activePage)) return null

  const scrollToTop = () => {
    document.querySelector('.nex-content')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const locateCurrent = () => {
    const container = document.querySelector('.nex-content')
    if (!container) return
    const row = container.querySelector<HTMLElement>('.track-item-active')
    if (!row) return
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // 脉冲高亮当前行,便于长列表滚动定位后快速找到
    row.classList.add('locate-pulse')
    window.setTimeout(() => row.classList.remove('locate-pulse'), 1400)
  }

  return (
    <div className="list-nav-fab">
      <button
        type="button"
        title="定位到当前歌曲"
        aria-label="定位到当前歌曲"
        disabled={!currentTrack}
        onClick={locateCurrent}
      >
        <LocateFixed size={17} />
      </button>
      <button type="button" title="回到最顶" aria-label="回到最顶" onClick={scrollToTop}>
        <ArrowUpToLine size={17} />
      </button>
    </div>
  )
}
