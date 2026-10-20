// 字体导入:对话框单选字体文件 → 拷贝进应用数据目录 → 授权 asset 协议。
// 前端拿到返回的族名与路径后自行注册 @font-face(主窗与悬浮歌词窗都要注册)。
use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFont {
    /// 字体族名(取文件主名,前端用作 font-family)
    pub name: String,
    /// 落地的完整路径(convertFileSrc 后进 @font-face src)
    pub path: String,
}

/// 导入字体文件(单选):拷贝进 app_data/fonts 并授权 asset 协议;取消返回 None
#[tauri::command]
pub async fn font_import(app: tauri::AppHandle) -> Result<Option<ImportedFont>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
        .dialog()
        .file()
        .add_filter("字体文件", &["ttf", "otf", "ttc", "woff", "woff2"])
        .blocking_pick_file();
    let Some(fp) = picked else {
        return Ok(None);
    };
    let src = fp.into_path().map_err(|e| format!("{e}"))?;
    if matches!(src.extension(), None) {
        return Err("请选择字体文件(ttf/otf/ttc/woff/woff2)".into());
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("ttf")
        .to_ascii_lowercase();
    let name = src
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.replace('"', "'"))
        .unwrap_or_else(|| "自定义字体".into());
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("{e}"))?
        .join("fonts");
    std::fs::create_dir_all(&dir).map_err(|e| format!("{e}"))?;
    let dst = dir.join(format!("{}.{}", name, ext));
    std::fs::copy(&src, &dst).map_err(|e| format!("{e}"))?;
    let path = dst.to_string_lossy().into_owned();
    // webview 经 asset 协议读该文件需要先授权
    let _ = app.asset_protocol_scope().allow_file(&dst);
    Ok(Some(ImportedFont { name, path }))
}
