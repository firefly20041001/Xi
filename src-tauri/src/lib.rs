mod accounts;
mod local;
mod lyrics_win;
mod net;
mod playlist;
mod providers;
mod store;
mod tray;
mod types;

use serde_json::Value;
use types::*;
use std::collections::HashMap;
use tauri::Emitter;
use tauri::Manager;
use tauri::window::{Effect, EffectsBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub struct AppState {
    pub client: reqwest::Client,
}

fn cookies(app: &tauri::AppHandle) -> HashMap<String, String> {
    playlist::accounts_cookie_map(app)
}

// ---------- Window / tray / thumbnail passthroughs ----------

#[tauri::command]
fn tray_update_track(app: tauri::AppHandle, track_name: String, artist: String) {
    tray::update_track(&app, &track_name, &artist);
}

#[tauri::command]
fn playback_state_changed(app: tauri::AppHandle, is_playing: bool) {
    tray::update_playing_state(&app, is_playing);
}

#[tauri::command]
fn tray_quit(app: tauri::AppHandle) {
    app.exit(0);
}

// 主窗口以 visible:false 创建（tauri.conf.json），前端首帧渲染完成后调用本命令拉起，
// 避免 WebView2 首帧未提交就可见导致的启动黑屏闪烁。
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    // 尊重"启动时最小化到托盘"偏好：保持隐藏
    if store::get_setting(&app, "settings.minimizeOnStartup")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return;
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn thumbnail_update_cover(_cover_url: String) {
    // Windows thumbnail toolbar is not available under Tauri; the command
    // stays so the renderer API surface is unchanged
}

// ---------- Lyrics window ----------

#[tauri::command]
async fn lyrics_window_show(app: tauri::AppHandle) {
    lyrics_win::show(&app);
}

#[tauri::command]
async fn lyrics_window_hide(app: tauri::AppHandle) {
    lyrics_win::hide(&app);
}

#[tauri::command]
async fn lyrics_window_toggle(app: tauri::AppHandle) {
    lyrics_win::toggle(&app);
}

#[tauri::command]
fn lyrics_window_is_visible(app: tauri::AppHandle) -> bool {
    lyrics_win::is_visible(&app)
}

#[tauri::command]
fn lyrics_settings_get(app: tauri::AppHandle) -> Value {
    lyrics_win::settings(&app)
}

#[tauri::command]
fn lyrics_settings_set(app: tauri::AppHandle, key: String, value: Value) {
    lyrics_win::set_setting(&app, &key, value);
}

#[tauri::command]
fn lyrics_update_line(app: tauri::AppHandle, line: String, translation: Option<String>) {
    lyrics_win::update_line(&app, line, translation);
}

// ---------- Settings ----------

#[tauri::command]
fn settings_get(app: tauri::AppHandle, key: String, default_value: Option<Value>) -> Value {
    store::get_setting(&app, &key)
        .or(default_value)
        .unwrap_or(Value::Null)
}

#[tauri::command]
fn settings_set(app: tauri::AppHandle, key: String, value: Value) {
    store::set_setting(&app, &key, value);
    if key.starts_with("lyrics") {
        if let Some(w) = app.get_webview_window("lyrics") {
            let _ = w.emit("lyrics:settings", lyrics_win::settings(&app));
        }
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.emit("lyrics-settings:changed", lyrics_win::settings(&app));
        }
    }
}

#[tauri::command]
fn app_set_autolaunch(app: tauri::AppHandle, enabled: bool) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch();
    let result = if enabled {
        autostart.enable().is_ok()
    } else {
        autostart.disable().is_ok()
    };
    store::set_setting(&app, "autoLaunch", Value::Bool(enabled));
    result
}

// ---------- Shortcuts ----------

pub const DEFAULT_SHORTCUTS: &[(&str, &str)] = &[
    ("togglePlay", "CommandOrControl+Alt+P"),
    ("next", "CommandOrControl+Alt+Right"),
    ("prev", "CommandOrControl+Alt+Left"),
    ("volumeUp", "CommandOrControl+Alt+Up"),
    ("volumeDown", "CommandOrControl+Alt+Down"),
    ("toggleLyrics", "CommandOrControl+Alt+L"),
];

fn shortcuts_value(app: &tauri::AppHandle) -> Value {
    let defaults: serde_json::Map<String, Value> = DEFAULT_SHORTCUTS
        .iter()
        .map(|(k, v)| (k.to_string(), Value::String(v.to_string())))
        .collect();
    let mut merged = defaults;
    if let Some(Value::Object(saved)) = store::get_setting(app, "shortcuts") {
        for (k, v) in saved {
            merged.insert(k, v);
        }
    }
    Value::Object(merged)
}

fn register_shortcuts(app: &tauri::AppHandle) {
    let config = shortcuts_value(app);
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if let Value::Object(map) = config {
        for (action, accel) in map {
            let Some(accel) = accel.as_str() else { continue };
            if accel.is_empty() {
                continue;
            }
            let normalized = accel.replace("CommandOrControl", "CmdOrControl");
            let action = action.clone();
            let _ = gs.on_shortcut(normalized.as_str(), move |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit(&format!("shortcut:{action}"), ());
                    }
                }
            });
        }
    }
}

#[tauri::command]
fn shortcuts_get(app: tauri::AppHandle) -> Value {
    shortcuts_value(&app)
}

#[tauri::command]
fn shortcuts_set(app: tauri::AppHandle, config: Value) {
    store::set_setting(&app, "shortcuts", config);
    register_shortcuts(&app);
}

#[tauri::command]
fn shortcuts_reset(app: tauri::AppHandle) -> Value {
    let defaults = shortcuts_value(&app);
    store::set_setting(&app, "shortcuts", defaults.clone());
    register_shortcuts(&app);
    defaults
}

// ---------- Streaming / lyrics ----------

#[tauri::command]
async fn streaming_search(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: SearchRequest,
) -> Result<SearchResult, String> {
    Ok(providers::search(&state.client, &cookies(&app), &request).await)
}

#[tauri::command]
async fn streaming_get_track(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    source: String,
    id: String,
) -> Result<Track, String> {
    providers::get_track(&state.client, &cookies(&app), &source, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn streaming_resolve_playback(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    source: String,
    id: String,
    quality: String,
) -> Result<PlaybackInfo, String> {
    providers::resolve_playback(&state.client, &cookies(&app), &source, &id, &quality)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn streaming_get_playlist(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    source: String,
    id: String,
) -> Result<Playlist, String> {
    providers::get_playlist(&state.client, &cookies(&app), &source, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn streaming_get_user_playlists(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    source: String,
    user_id: String,
) -> Result<Vec<Playlist>, String> {
    Ok(providers::get_user_playlists(
        &state.client,
        &cookies(&app),
        &source,
        &user_id,
    )
    .await)
}

#[tauri::command]
async fn streaming_get_liked_songs(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    source: String,
    user_id: String,
) -> Result<Vec<Track>, String> {
    Ok(providers::get_liked_songs(
        &state.client,
        &cookies(&app),
        &source,
        &user_id,
    )
    .await)
}

#[tauri::command]
async fn streaming_get_album(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    source: String,
    id: String,
) -> Result<Album, String> {
    providers::get_album(&state.client, &cookies(&app), &source, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn streaming_get_toplist(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    topid: i64,
    limit: i64,
) -> Result<Vec<Track>, String> {
    Ok(providers::get_toplist(
        &state.client,
        &cookies(&app),
        "qqmusic",
        topid,
        limit,
    )
    .await)
}

#[tauri::command]
async fn lyrics_get_lyrics(
    state: tauri::State<'_, AppState>,
    request: LyricsRequest,
) -> Result<Option<Lyrics>, String> {
    Ok(providers::get_lyrics(&state.client, &request).await)
}

// ---------- Playlists ----------

#[tauri::command]
fn playlist_get_all(app: tauri::AppHandle) -> Vec<SyncedPlaylist> {
    playlist::get_all(&app)
}

#[tauri::command]
fn playlist_get_by_id(app: tauri::AppHandle, id: String) -> Option<SyncedPlaylist> {
    playlist::get_by_id(&app, &id)
}

#[tauri::command]
async fn playlist_create_from_remote(
    app: tauri::AppHandle,
    playlist: Playlist,
    source_url: Option<String>,
) -> Result<SyncedPlaylist, String> {
    playlist::create_from_remote(&app, playlist, source_url)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn playlist_create(app: tauri::AppHandle, name: String) -> Result<SyncedPlaylist, String> {
    playlist::create(&app, name).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn playlist_delete(app: tauri::AppHandle, id: String) {
    playlist::delete(&app, &id).await;
}

#[tauri::command]
async fn playlist_sync(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: PlaylistSyncRequest,
) -> Result<PlaylistSyncResult, String> {
    playlist::sync(&app, &state.client, &request)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn playlist_refresh(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<PlaylistRefreshResult, String> {
    playlist::refresh(&app, &state.client, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn playlist_add_track(app: tauri::AppHandle, playlist_id: String, track: Track) {
    playlist::add_track(&app, &playlist_id, track).await;
}

#[tauri::command]
async fn playlist_remove_track(app: tauri::AppHandle, playlist_id: String, track_id: String) {
    playlist::remove_track(&app, &playlist_id, &track_id).await;
}

// ---------- Listening ----------

#[tauri::command]
fn listening_add_event(app: tauri::AppHandle, event: ListeningEvent) {
    let mut store_data = store::load_listening(&app);
    store_data.events.push(event);
    if store_data.events.len() > 2000 {
        store_data.events = store_data.events.split_off(store_data.events.len() - 2000);
    }
    store::save_listening(&app, &store_data);
}

#[tauri::command]
fn listening_get_events(app: tauri::AppHandle) -> Vec<ListeningEvent> {
    store::load_listening(&app).events
}

#[tauri::command]
fn listening_get_profile(app: tauri::AppHandle) -> Option<UserProfile> {
    store::load_listening(&app).profile
}

#[tauri::command]
fn listening_set_profile(app: tauri::AppHandle, profile: UserProfile) {
    let mut store_data = store::load_listening(&app);
    store_data.profile = Some(profile);
    store::save_listening(&app, &store_data);
}

#[tauri::command]
fn listening_clear(app: tauri::AppHandle) {
    store::save_listening(&app, &store::ListeningStore::default());
}

// ---------- Accounts ----------

#[tauri::command]
async fn accounts_open_login(app: tauri::AppHandle, provider: String) -> Result<bool, String> {
    accounts::open_login(app, provider).await
}

#[tauri::command]
fn accounts_get_all(app: tauri::AppHandle) -> HashMap<String, Option<Value>> {
    let accounts = store::load_accounts(&app);
    let mut out: HashMap<String, Option<Value>> = HashMap::new();
    for provider in ["netease", "qqmusic"] {
        let record = accounts.get(provider);
        out.insert(
            provider.to_string(),
            record.and_then(|r| accounts::stored_account_info(r, provider)),
        );
    }
    out
}

#[tauri::command]
async fn accounts_refresh(app: tauri::AppHandle) -> Result<HashMap<String, Option<Value>>, String> {
    let mut out: HashMap<String, Option<Value>> = HashMap::new();
    for provider in ["netease", "qqmusic"] {
        out.insert(provider.to_string(), accounts::refresh_account(&app, provider).await);
    }
    Ok(out)
}

#[tauri::command]
async fn accounts_get_info(
    app: tauri::AppHandle,
    provider: String,
) -> Result<Option<Value>, String> {
    let accounts = store::load_accounts(&app);
    Ok(accounts
        .get(&provider)
        .and_then(|r| accounts::stored_account_info(r, &provider)))
}

#[tauri::command]
async fn accounts_logout(app: tauri::AppHandle, provider: String) {
    let mut accounts = store::load_accounts(&app);
    accounts.remove(&provider);
    store::save_accounts(&app, &accounts);
}

#[tauri::command]
fn accounts_close_login(app: tauri::AppHandle) {
    let _ = accounts::close_login(&app);
}

// ---------- Entry ----------

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
                .on_permission_request(|_app, kind| match kind {
            tauri::webview::PermissionKind::Microphone => tauri::webview::PermissionResponse::Allow,
            _ => tauri::webview::PermissionResponse::Default,
        })
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // 本地音乐目录选择器:必须注册对话框插件,否则 DialogExt.app.dialog() 会 panic
        // (state() called before manage() for tauri_plugin_dialog::desktop::Dialog)
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            client: net::new_client(),
        })
        .invoke_handler(tauri::generate_handler![
            tray_update_track,
            tray_quit,
            show_main_window,
            playback_state_changed,
            thumbnail_update_cover,
            lyrics_window_show,
            lyrics_window_hide,
            lyrics_window_toggle,
            lyrics_window_is_visible,
            lyrics_settings_get,
            lyrics_settings_set,
            lyrics_update_line,
            settings_get,
            settings_set,
            app_set_autolaunch,
            shortcuts_get,
            shortcuts_set,
            shortcuts_reset,
            streaming_search,
            streaming_get_track,
            streaming_resolve_playback,
            streaming_get_playlist,
            streaming_get_user_playlists,
            streaming_get_liked_songs,
            streaming_get_album,
            streaming_get_toplist,
            lyrics_get_lyrics,
            playlist_get_all,
            playlist_get_by_id,
            playlist_create_from_remote,
            playlist_create,
            playlist_delete,
            playlist_sync,
            playlist_refresh,
            playlist_add_track,
            playlist_remove_track,
            listening_add_event,
            listening_get_events,
            listening_get_profile,
            listening_set_profile,
            listening_clear,
            accounts_open_login,
            accounts_get_all,
            accounts_refresh,
            accounts_get_info,
            accounts_logout,
            accounts_close_login,
            local::local_pick_directories,
            local::local_scan_directory,
            local::local_allow_directory
        ])
        .setup(|app| {
            // Restore auto-launch preference
            if store::get_setting(app.handle(), "autoLaunch")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                use tauri_plugin_autostart::ManagerExt;
                let _ = app.autolaunch().enable();
            }

            // 本地音乐:恢复已添加目录的 asset 协议授权,
            // 保证重启后不经本地音乐页也能恢复播放上次的本地曲目
            let local_dirs = store::get_setting(app.handle(), "local.dirs")
                .and_then(|v| v.as_array().cloned())
                .unwrap_or_default();
            for d in local_dirs {
                if let Some(path) = d.as_str() {
                    let _ = app
                        .asset_protocol_scope()
                        .allow_directory(std::path::PathBuf::from(path), true);
                }
            }

            tray::setup(app)?;

            // Liquid-glass tray menu window (hidden until the tray icon is clicked).
            // 模糊由 Rust 侧窗口特效提供：Effect::Acrylic 在 Win11 22H2+ 上走
            // DWMWA_SYSTEMBACKDROP_TYPE(DWMSBT_TRANSIENTWINDOW)=托盘飞出同款系统亚克力，
            // 不再有老 SWCA 路径的"实心白底"问题（window-vibrancy 0.8+ 的实现）；
            // Win10 回退 ACCENT_ENABLE_ACRYLICBLURBEHIND。tint/圆角/边框仍由 tray.css 的
            // 半透明背景绘制，这里的 color 参数留给 Win10 回退路径用。
            {
                let _tray_menu = tauri::WebviewWindowBuilder::new(
                    app,
                    "tray-menu",
                    tauri::WebviewUrl::App("tray.html".into()),
                )
                .title("希 菜单")
                .inner_size(240.0, 372.0)
                .decorations(false)
                .transparent(true)
                .resizable(false)
                .skip_taskbar(true)
                .always_on_top(true)
                .visible(false)
                .shadow(false)
                .effects(
                    EffectsBuilder::new()
                        .effect(Effect::Acrylic)
                        .build(),
                )
                .additional_browser_args("--autoplay-policy=no-user-gesture-required --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection")
                .build()?;
            }

            register_shortcuts(app.handle());

            // Recreate the lyrics window at startup if it was enabled
            if store::get_setting(app.handle(), "lyrics.enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                lyrics_win::show(app.handle());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
