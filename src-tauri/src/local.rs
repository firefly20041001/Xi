// 本地音乐:目录选择(tauri-plugin-dialog)+ 递归扫描音频文件。
// 播放复用统一 Track(from 前端构造),文件经 asset 协议映射为 URL;
// 新增/恢复的目录都要 allow 到 asset_protocol_scope,webview 才有权读取。
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileInfo {
    /// 完整路径(前端作为 Track.id 与播放寻址键)
    pub path: String,
    /// 文件名字符串(含扩展名,前端自行解析 歌手 - 标题)
    pub file_name: String,
    /// 所属目录
    pub dir: String,
    /// 修改时间(Unix 毫秒;失败为 0)
    pub modified_ms: u64,
}

const AUDIO_EXTS: [&str; 10] = [
    "mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "ape", "wma", "aiff",
];
// 防御性上限,避免误选超大目录拖垮渲染
const MAX_FILES: usize = 5000;

fn is_audio(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// 递归扫描目录(跳过隐藏目录),返回音频文件列表
/// max_depth:向下递归的层数上限(0=仅所选目录本身,1~5=再多 n 层);不传=不限制(兼容旧调用)
#[tauri::command]
pub async fn local_scan_directory(
    path: String,
    max_depth: Option<i64>,
) -> Result<Vec<LocalFileInfo>, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err("目录不存在".into());
    }
    let max_depth: usize = match max_depth {
        None => usize::MAX,
        Some(d) => d.clamp(0, 5) as usize,
    };
    let root_name = root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("本地目录")
        .to_string();
    let mut stack: Vec<(PathBuf, usize)> = vec![(root, 0)]; // (目录, 深度:根=0)
    let mut out: Vec<LocalFileInfo> = Vec::new();
    while let Some((dir, depth)) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if p.is_dir() {
                // 跳过隐藏目录(.开头);深度达到上限就不再下钻
                if !name.starts_with('.') && depth < max_depth {
                    stack.push((p, depth + 1));
                }
            } else if is_audio(&p) && out.len() < MAX_FILES {
                let modified_ms = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                out.push(LocalFileInfo {
                    path: p.to_string_lossy().into_owned(),
                    file_name: name,
                    dir: root_name.clone(),
                    modified_ms,
                });
            }
        }
    }
    Ok(out)
}

/// 打开系统目录选择(多选),选中后立即允许 asset 协议访问
#[tauri::command]
pub async fn local_pick_directories(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().blocking_pick_folders();
    let mut out: Vec<String> = Vec::new();
    if let Some(files) = picked {
        for fp in files {
            if let Ok(p) = fp.into_path() {
                let _ = app.asset_protocol_scope().allow_directory(&p, true);
                out.push(p.to_string_lossy().into_owned());
            }
        }
    }
    Ok(out)
}

/// 仅授权 asset 协议(供前端在恢复历史目录时调用,无需选择器)
#[tauri::command]
pub async fn local_allow_directory(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let _ = app
        .asset_protocol_scope()
        .allow_directory(PathBuf::from(&path), true);
    Ok(())
}
