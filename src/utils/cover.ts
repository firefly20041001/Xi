import { Track } from '@shared/types/streaming'
import { SyntheticEvent } from 'react'

const NETEASE_HOST = /(?:^|\.)music\.126\.net$/
const QQ_HOST = /(?:^|\.)y\.gtimg\.cn$/
const QQ_SIZES = [150, 300, 500]

// 本地音频无封面时的默认封面(应用图标,public/icon.png,dev 与生产构建均可解析)
export const LOCAL_DEFAULT_COVER = '/icon.png'

export function getCoverUrl(url: string | undefined | null, size: number): string {
  if (!url) return ''

  try {
    const parsed = new URL(url)

    if (NETEASE_HOST.test(parsed.hostname)) {
      parsed.searchParams.set('param', `${size}y${size}`)
      return parsed.toString()
    }

    if (QQ_HOST.test(parsed.hostname)) {
      const qqSize = QQ_SIZES.find(candidate => candidate >= size) ?? QQ_SIZES[QQ_SIZES.length - 1]
      parsed.pathname = parsed.pathname.replace(/R\d+x\d+M/, `R${qqSize}x${qqSize}M`)
      return parsed.toString()
    }

    return url
  } catch {
    return url
  }
}

// 曲目封面快捷获取:无论本地还是在线曲目,取不到封面一律回退应用图标
export function trackCoverUrl(track: Track, size: number): string {
  return getCoverUrl(track.albumCoverUrl, size) || LOCAL_DEFAULT_COVER
}

// img 加载失败通用处理:换到默认封面,已显示默认封面则不再触发(防循环)
export function coverImgFallback(e: SyntheticEvent<HTMLImageElement>) {
  const el = e.currentTarget
  const src = el.getAttribute('src') || ''
  if (!src.endsWith(LOCAL_DEFAULT_COVER)) el.src = LOCAL_DEFAULT_COVER
}
