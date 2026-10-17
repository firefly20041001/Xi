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
    let locked = value.as_bool().unwrap_or(false);
    store::set_setting(app, &format!("lyrics.{key}"), value);
    if key == "locked" {
        if let Some(w) = app.get_webview_window("lyrics") {
            let _ = w.set_ignore_cursor_events(locked);
        }
    }
    if key == "enabled" && !locked {
        hide(app);
    }
}

fn create(app: &AppHandle) -> tauri::Result<()> {
    let s = settings(app);
    let width = s.get("width").and_then(|v| v.as_f64()).unwrap_or(720.0);
    let height = s.get("height").and_then(|v| v.as_f64()).unwrap_or(90.0);
    let locked = s.get("locked").and_then(|v| v.as_bool()).unwrap_or(false);

    let mut builder = WebviewWindowBuilder::new(
        app,
        "lyrics",
        WebviewUrl::App("lyrics.html".into()),
    )
    .title("Yachiyo Lyrics")
    .inner_size(width, height)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(!locked)
    .shadow(false)
    .visible(true);

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
        _ => {}
    });

    // Push current settings once so the page renders correctly
    let _ = win.emit("lyrics:settings", settings(app));
    Ok(())
}

pub fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("lyrics") {
        let _ = w.show();
        return;
    }
    let _ = create(app);
}

pub fn hide(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("lyrics") {
        let _ = w.close();
    }
}

pub fn toggle(app: &AppHandle) {
    if is_visible(app) {
        hide(app);
        store::set_setting(app, "lyrics.enabled", json!(false));
    } else {
        show(app);
        store::set_setting(app, "lyrics.enabled", json!(true));
    }
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
