import './api/install'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useAppearanceStore } from './stores/appearanceStore'
import './styles/global.css'
import './styles/glass.css'
import './styles/layout.css'
import './styles/sidebar.css'
import './styles/player.css'
import './styles/pages.css'
import './styles/animations.css'
import './styles/globalsearch.css'
import './styles/nexbox-glass.css'
import './styles/nexbox-tokens.css'

useAppearanceStore.getState().init()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// 主窗口以 visible:false 创建：等首帧真正提交后再让 Rust 拉起窗口，
// 消除 WebView2 首帧未就绪时的启动黑屏闪烁
function revealMainWindow() {
  if (!('__TAURI_INTERNALS__' in window)) return
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.api.window.show()
    })
  })
}
if (document.readyState === 'complete') revealMainWindow()
else window.addEventListener('load', revealMainWindow, { once: true })
