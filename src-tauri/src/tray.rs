// Tray icon with playback menu; tooltip reflects the current track
use crate::lyrics_win;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIcon;
use tauri::{App, Emitter, Manager};
use std::sync::Mutex;

pub struct TrayState {
    pub tray: Mutex<Option<TrayIcon>>,
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    let play = MenuItem::with_id(app, "tray-play", "播放/暂停", true, None::<&str>)?;
    let prev = MenuItem::with_id(app, "tray-prev", "上一首", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "tray-next", "下一首", true, None::<&str>)?;
    let lyrics_item = MenuItem::with_id(app, "tray-lyrics", "桌面歌词", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&play, &prev, &next, &lyrics_item, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("no default window icon");

    let tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("Yachiyo")
        .on_menu_event(|app, event| {
            let target = |w: &str| app.get_webview_window(w);
            match event.id().as_ref() {
                "tray-play" => {
                    if let Some(w) = target("main") {
                        let _ = w.emit("tray:togglePlay", ());
                    }
                }
                "tray-prev" => {
                    if let Some(w) = target("main") {
                        let _ = w.emit("tray:prev", ());
                    }
                }
                "tray-next" => {
                    if let Some(w) = target("main") {
                        let _ = w.emit("tray:next", ());
                    }
                }
                "tray-lyrics" => {
                    lyrics_win::toggle(app);
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    app.manage(TrayState {
        tray: Mutex::new(Some(tray)),
    });
    Ok(())
}

pub fn update_track(app: &tauri::AppHandle, track_name: &str, artist: &str) {
    if let Some(state) = app.try_state::<TrayState>() {
        if let Some(tray) = state.tray.lock().unwrap().as_ref() {
            let _ = tray.set_tooltip(Some(format!("{track_name} - {artist}")));
            let _ = tray.set_title(Some(track_name.to_string()));
        }
    }
}

pub fn update_playing_state(app: &tauri::AppHandle, is_playing: bool) {
    let _ = app;
    let _ = is_playing;
    // Menu labels are static; kept for API compatibility
}
