// Tauri implementation of the ElectronAPI surface.
// Installed as window.api before the app renders, so the copied Electron
// renderer code runs unmodified. IPC channels map to snake_case Tauri
// commands; main->renderer pushes map to Tauri events with the same names.
import type { ElectronAPI } from '../apiTypes'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

type Callback = (...args: any[]) => void
const listeners = new Map<string, UnlistenFn>()

async function on(channel: string, cb: Callback) {
  // Replace any previous listener on the same channel, like the Electron
  // preload's removeAllListeners + on pattern
  const existing = listeners.get(channel)
  if (existing) {
    existing()
    listeners.delete(channel)
  }
  const un = await listen(channel, (event) => cb((event as any).payload))
  listeners.set(channel, un)
}

// ---- Renderer-side device output (WebView2 exposes setSinkId directly) ----

async function getAudioOutput() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || '未知设备', isDefault: d.deviceId === 'default' }))
  } catch {
    return []
  }
}

let deviceChangedCb: Callback | null = null
let deviceListenerAttached = false

function attachDeviceListener() {
  if (deviceListenerAttached) return
  deviceListenerAttached = true
  navigator.mediaDevices.addEventListener('devicechange', () => deviceChangedCb?.())
}

export function installApi(): void {
  const api: ElectronAPI = {
    window: {
      minimize: () => void getCurrentWindow().minimize(),
      maximize: () => void getCurrentWindow().toggleMaximize(),
      close: () => void getCurrentWindow().close()
    },

    tray: {
      onTogglePlay: (cb) => void on('tray:togglePlay', cb),
      onNext: (cb) => void on('tray:next', cb),
      onPrev: (cb) => void on('tray:prev', cb),
      updateTrack: (trackName, artist) => void invoke('tray_update_track', { trackName, artist }),
      updatePlayingState: (isPlaying) => void invoke('playback_state_changed', { isPlaying }),
      updateCover: (coverUrl) => void invoke('thumbnail_update_cover', { coverUrl })
    },

    lyricsWindow: {
      show: () => invoke('lyrics_window_show'),
      hide: () => invoke('lyrics_window_hide'),
      toggle: () => invoke('lyrics_window_toggle'),
      isVisible: () => invoke('lyrics_window_is_visible'),
      getSettings: () => invoke('lyrics_settings_get'),
      setSetting: (key, value) => invoke('lyrics_settings_set', { key, value }),
      onUpdate: (cb) => void on('lyrics:update', cb),
      onSettings: (cb) => void on('lyrics:settings', cb),
      onSettingsChanged: (cb) => void on('lyrics-settings:changed', cb),
      updateLine: (line, translation) => void invoke('lyrics_update_line', { line, translation })
    },

    settings: {
      get: (key, defaultValue) => invoke('settings_get', { key, defaultValue: defaultValue ?? null }),
      set: (key, value) => invoke('settings_set', { key, value }),
      setAutoLaunch: (enabled) => invoke('app_set_autolaunch', { enabled })
    },

    shortcuts: {
      get: () => invoke('shortcuts_get'),
      set: (config) => invoke('shortcuts_set', { config }),
      reset: () => invoke('shortcuts_reset'),
      onTogglePlay: (cb) => void on('shortcut:togglePlay', cb),
      onNext: (cb) => void on('shortcut:next', cb),
      onPrev: (cb) => void on('shortcut:prev', cb),
      onVolumeUp: (cb) => void on('shortcut:volumeUp', cb),
      onVolumeDown: (cb) => void on('shortcut:volumeDown', cb),
      onToggleLyrics: (cb) => void on('shortcut:toggleLyrics', cb)
    },

    devices: {
      getAudioOutput: getAudioOutput,
      getCurrentOutput: async () => localStorage.getItem('audioOutputDevice') || 'default',
      setAudioOutput: async (deviceId) => {
        localStorage.setItem('audioOutputDevice', deviceId)
        return true
      },
      startListening: () => {
        attachDeviceListener()
        return Promise.resolve()
      },
      onChanged: (cb) => {
        deviceChangedCb = cb
        attachDeviceListener()
      }
    },

    accounts: {
      openLogin: (provider) => invoke('accounts_open_login', { provider }),
      getAll: () => invoke('accounts_get_all'),
      refresh: () => invoke('accounts_refresh'),
      getInfo: (provider) => invoke('accounts_get_info', { provider }),
      logout: (provider) => invoke('accounts_logout', { provider }),
      closeLogin: () => invoke('accounts_close_login')
    },

    streaming: {
      search: (request) => invoke('streaming_search', { request }),
      getTrack: (source, id) => invoke('streaming_get_track', { source, id }),
      resolvePlayback: (source, id, quality) =>
        invoke('streaming_resolve_playback', { source, id, quality }),
      getPlaylist: (source, id) => invoke('streaming_get_playlist', { source, id }),
      getUserPlaylists: (source, userId) => invoke('streaming_get_user_playlists', { source, userId }),
      getLikedSongs: (source, userId) => invoke('streaming_get_liked_songs', { source, userId }),
      getAlbum: (source, id) => invoke('streaming_get_album', { source, id }),
      getToplist: (topid, limit) => invoke('streaming_get_toplist', { topid, limit }),
      getDailyRecommend: (source) => invoke('streaming_get_daily_recommend', { source })
    },

    lyrics: {
      getLyrics: (request) => invoke('lyrics_get_lyrics', { request })
    },

    playlist: {
      getAll: () => invoke('playlist_get_all'),
      getById: (id) => invoke('playlist_get_by_id', { id }),
      createFromRemote: (playlist, sourceUrl) =>
        invoke('playlist_create_from_remote', { playlist, sourceUrl: sourceUrl ?? null }),
      create: (name) => invoke('playlist_create', { name }),
      delete: (id) => invoke('playlist_delete', { id }),
      sync: (request) => invoke('playlist_sync', { request }),
      refresh: (id) => invoke('playlist_refresh', { id }),
      addTrack: (playlistId, track) => invoke('playlist_add_track', { playlistId, track }),
      removeTrack: (playlistId, trackId) => invoke('playlist_remove_track', { playlistId, trackId })
    },

    listening: {
      addEvent: (event) => invoke('listening_add_event', { event }),
      getEvents: () => invoke('listening_get_events'),
      getProfile: () => invoke('listening_get_profile'),
      setProfile: (profile) => invoke('listening_set_profile', { profile }),
      clear: () => invoke('listening_clear')
    }
  }

  ;(window as any).api = api
  window.dispatchEvent(new Event('api-ready'))
}
