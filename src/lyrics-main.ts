// Desktop lyrics window entry (lyrics.html)
import './api/install'

const lineEl = document.getElementById('lyrics-line')!
const transEl = document.getElementById('lyrics-translation')!
const container = document.getElementById('lyrics-container')!
const lockBtn = document.getElementById('lock-btn')!
const closeBtn = document.getElementById('close-btn')!

let isLocked = false

const api = (window as any).api

api.lyricsWindow.onUpdate((data: { line: string; translation?: string }) => {
  if (data.line) {
    lineEl.textContent = data.line
    lineEl.classList.remove('lyrics-empty')
  } else {
    lineEl.textContent = '暂无歌词'
    lineEl.classList.add('lyrics-empty')
  }
  transEl.textContent = data.translation || ''
})

api.lyricsWindow.onSettings((settings: any) => applySettings(settings))

function applySettings(settings: any) {
  if (settings.fontSize) lineEl.style.fontSize = settings.fontSize + 'px'
  if (settings.fontFamily) lineEl.style.fontFamily = settings.fontFamily
  if (settings.color) lineEl.style.color = settings.color
  if (settings.opacity) container.style.opacity = settings.opacity
  if (settings.bgColor) container.style.background = settings.bgColor
  if (settings.borderRadius) container.style.borderRadius = settings.borderRadius + 'px'
  if (settings.bold) lineEl.style.fontWeight = settings.bold ? '600' : '400'
  if (settings.textShadow) {
    lineEl.style.textShadow = '0 2px 8px rgba(0,0,0,0.5)'
  } else {
    lineEl.style.textShadow = 'none'
  }
  isLocked = settings.locked || false
  lockBtn.textContent = isLocked ? '🔒' : '🔓'
  container.classList.toggle('locked', isLocked)
}

lockBtn.addEventListener('click', () => {
  isLocked = !isLocked
  api.lyricsWindow.setSetting('locked', isLocked)
  lockBtn.textContent = isLocked ? '🔒' : '🔓'
  container.classList.toggle('locked', isLocked)
})

closeBtn.addEventListener('click', () => {
  api.lyricsWindow.setSetting('enabled', false)
  api.lyricsWindow.hide()
})

api.lyricsWindow.getSettings().then(applySettings)
