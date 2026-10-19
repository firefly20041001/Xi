// Desktop lyrics overlay window: transparent, always-on-top, position
// persisted in settings, lockable (ignores mouse events)
use crate::net::now_ms;
use crate::store;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub fn settings(app: &AppHandle) -> Value {
    let map = store::settings_map(app);
    let mut out = serde_json::Map::new();
    for (k, v) in map {
        if let Some(rest) = k.strip_prefix("lyrics.") {
            out.insert(rest.to_string(), v);
        }
    }
    Value::Object(out)
}

pub fn set_setting(app: &AppHandle, key: &str, value: Value) {
    let enabled = value.as_bool().unwrap_or(false);
    let locked = enabled;
    store::set_setting(app, &format!("lyrics.{key}"), value);
    if key == "locked" {
        if let Some(w) = app.get_webview_window("lyrics") {
            let _ = w.set_ignore_cursor_events(locked);
        }
    }
    if key == "enabled" {
        if locked {
            hide(app);
        }
        notify_state(app, enabled && is_visible(app));
    }
}

fn create(app: &AppHandle) -> tauri::Result<()> {
    // 防重：已存在（含正在关闭的残影）时直接拉起，不再二次构建
    if let Some(existing) = app.get_webview_window("lyrics") {
        let _ = existing.show();
        return Ok(());
    }
    let s = settings(app);
    let width = s.get("width").and_then(|v| v.as_f64()).unwrap_or(720.0);
    let height = s.get("height").and_then(|v| v.as_f64()).unwrap_or(90.0);
    let locked = s.get("locked").and_then(|v| v.as_bool()).unwrap_or(false);

    let mut builder = WebviewWindowBuilder::new(
        app,
        "lyrics",
        WebviewUrl::App("lyrics.html".into()),
    )
    .title("希 歌词")
    .inner_size(width, height)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(!locked)
    .shadow(false)
    .visible(true)
    .additional_browser_args("--autoplay-policy=no-user-gesture-required --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");

    // Restore persisted position
    if let (Some(x), Some(y)) = (
        s.get("x").and_then(|v| v.as_i64()),
        s.get("y").and_then(|v| v.as_i64()),
    ) {
        builder = builder.position(x as f64, y as f64);
    }

    let win = builder.build()?;

    if locked {
        let _ = win.set_ignore_cursor_events(true);
    }

    let handle = app.clone();
    win.on_window_event(move |event| match event {
        tauri::WindowEvent::Moved(pos) => {
            let PhysicalPosition { x, y } = pos;
            store::set_setting(&handle, "lyrics.x", json!(x));
            store::set_setting(&handle, "lyrics.y", json!(y));
        }
        tauri::WindowEvent::Resized(size) => {
            let PhysicalSize { width, height } = size;
            store::set_setting(&handle, "lyrics.width", json!(width));
            store::set_setting(&handle, "lyrics.height", json!(height));
        }
        tauri::WindowEvent::Destroyed => {
            // 直接关窗（✕/系统级）也同步托盘徽章
            emit_visible(&handle, false);
        }
        _ => {}
    });

    // Push current settings once so the page renders correctly
    let _ = win.emit("lyrics:settings", settings(app));
    Ok(())
}

pub fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("lyrics") {
        let _ = w.show();
        emit_visible(app, true);
        notify_state(app, true);
        return;
    }
    if let Err(e) = create(app) {
        eprintln!("[LyricsWin] create failed: {e:#}");
    }
    emit_visible(app, true);
    notify_state(app, true);
}

pub fn hide(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("lyrics") {
        let _ = w.close();
    }
    emit_visible(app, false);
    notify_state(app, false);
}

// 歌词窗可见性广播：托盘玻璃菜单据此刷新「显示桌面歌词」徽章
fn emit_visible(app: &AppHandle, visible: bool) {
    let _ = app.emit("tray:lyrics-visible", visible);
}

// 严格同步：可见性/设置变化广播到全部窗口
// （设置页开关、控制栏词按钮、托盘徽章共用同一份真值）
fn notify_state(app: &AppHandle, visible: bool) {
    emit_visible(app, visible);
    let _ = app.emit("lyrics-settings:changed", settings(app));
}

pub fn toggle(app: &AppHandle) {
    if is_visible(app) {
        hide(app);
        store::set_setting(app, "lyrics.enabled", json!(false));
    } else {
        show(app);
        store::set_setting(app, "lyrics.enabled", json!(true));
    }
    notify_state(app, is_visible(app));
}

pub fn is_visible(app: &AppHandle) -> bool {
    app.get_webview_window("lyrics")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false)
}

pub fn update_line(app: &AppHandle, line: String, translation: Option<String>) {
    if let Some(w) = app.get_webview_window("lyrics") {
        let _ = w.emit("lyrics:update", json!({ "line": line, "translation": translation }));
    }
}

#[allow(dead_code)]
fn _touch() {
    let _ = now_ms();
}
