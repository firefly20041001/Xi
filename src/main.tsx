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
import './styles/nexbox-glass.css'
import './styles/nexbox-tokens.css'

useAppearanceStore.getState().init()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
