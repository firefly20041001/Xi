// Tray icon: left/right click toggles the liquid-glass menu window
// ("tray-menu"). Tooltip/title reflect the current track.
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconEvent};
use tauri::{App, Manager, PhysicalPosition};
use std::sync::Mutex;

pub struct TrayState {
    pub tray: Mutex<Option<TrayIcon>>,
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    let icon = app
        .default_window_icon()
        .cloned()
        .expect("no default window icon");

    let tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("希")
        .on_tray_icon_event(|tray, event| {
            match event {
                // 双击托盘:收起玻璃菜单并直接唤出主窗口
                // (Windows 语义:双击序列会先触发两次 Click——菜单开又关,故这里显式确保收起)
                TrayIconEvent::DoubleClick { .. } => {
                    if let Some(menu) = tray.app_handle().get_webview_window("tray-menu") {
                        let _ = menu.hide();
                    }
                    show_main(tray.app_handle());
                }
                // 单击(左/右)开合玻璃菜单
                TrayIconEvent::Click {
                    button,
                    button_state: MouseButtonState::Up,
                    position,
                    ..
                } => {
                    if matches!(button, MouseButton::Left | MouseButton::Right) {
                        toggle_menu(tray.app_handle(), &position);
                    }
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

// 托盘主动唤出主窗口:不检查 minimizeOnStartup(该偏好只管开机首显),
// 否则开了"启动最小化"的用户将永远无法从托盘打开主窗口。
pub fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn toggle_menu(app: &tauri::AppHandle, cursor: &tauri::PhysicalPosition<f64>) {
    let Some(win) = app.get_webview_window("tray-menu") else { return };
    if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
        return;
    }
    position_near(app, &win, cursor);
    let _ = win.show();
    let _ = win.set_focus();
}

fn position_near(app: &tauri::AppHandle, win: &tauri::WebviewWindow, cursor: &tauri::PhysicalPosition<f64>) {
    // 尺寸取窗口真实物理值，避免与 lib.rs 的 inner_size 双处维护
    let size = win.inner_size().unwrap_or_else(|_| tauri::PhysicalSize::new(240, 372));
    let w = size.width as i32;
    let h = size.height as i32;

    // Monitor bounds (physical px) containing the cursor
    let monitor = app
        .primary_monitor()
        .ok()
        .flatten();
    let (mx, my, mw, mh) = monitor
        .map(|m| {
            let p = m.position();
            let s = m.size();
            (p.x, p.y, s.width as i32, s.height as i32)
        })
        .unwrap_or((0, 0, 1920, 1080));

    // Place the menu above the cursor (tray lives in the taskbar), clamped
    let cx = cursor.x as i32;
    let cy = cursor.y as i32;
    let mut x = cx - w / 2;
    let mut y = cy - h - 8;
    x = x.clamp(mx + 8, mx + mw - w - 8);
    y = y.clamp(my + 8, my + mh - h - 8);
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

pub fn update_track(app: &tauri::AppHandle, track_name: &str, artist: &str) {
    if let Some(state) = app.try_state::<TrayState>() {
        if let Some(tray) = state.tray.lock().unwrap().as_ref() {
            let label = if artist.is_empty() {
                track_name.to_string()
            } else {
                format!("{track_name} - {artist}")
            };
            let _ = tray.set_tooltip(Some(label));
            let _ = tray.set_title(Some(track_name.to_string()));
        }
    }
}

pub fn update_playing_state(_app: &tauri::AppHandle, _is_playing: bool) {
    // Glass menu receives state via `tray:state` events from the main window
}
