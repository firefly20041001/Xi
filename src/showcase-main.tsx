import React from 'react'
import ReactDOM from 'react-dom/client'
import { Showcase } from './nexbox-ui/Showcase'
import './styles/nexbox-tokens.css'

// 独立组件展示入口:与正式应用(app 入口)完全隔离,
// 不加载 window.api 兼容层,不触碰任何业务状态。
ReactDOM.createRoot(document.getElementById('showcase-root')!).render(
  <React.StrictMode>
    <Showcase />
  </React.StrictMode>
)
