// 导入字体注册:把字体文件路径包成 @font-face 族名。
// 主窗(App 全局字体)与悬浮歌词窗都要各自注册一次,registerFontFace 幂等。
import { convertFileSrc } from '@tauri-apps/api/core'

export interface CustomFont {
  name: string // font-family 名(Rust 取文件主名)
  path: string // 字体文件完整路径(app_data/fonts 下)
}

export function registerFontFace(name: string, path: string) {
  const id = `ff-${name}`
  if (document.getElementById(id)) return
  const st = document.createElement('style')
  st.id = id
  st.textContent =
    `@font-face{font-family:"${name}";` +
    `src:url("${convertFileSrc(path)}");font-display:swap;}`
  document.head.appendChild(st)
}

// 自定义字体清单:rust settings 持久化,key 'fonts.custom'
export const CUSTOM_FONTS_KEY = 'fonts.custom'

export async function loadCustomFonts(): Promise<CustomFont[]> {
  try {
    const v = await window.api.settings.get(CUSTOM_FONTS_KEY, [])
    return Array.isArray(v) ? v.filter((f: CustomFont) => f?.name && f?.path) : []
  } catch {
    return []
  }
}
