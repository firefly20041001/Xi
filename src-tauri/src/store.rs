// JSON file stores: settings (incl. shortcuts + lyrics settings), accounts,
// listening history/profile. Files live under the app data directory.
use crate::types::{ListeningEvent, UserProfile};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

pub fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn load_json(path: &PathBuf) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
}

pub fn save_json(path: &PathBuf, value: &Value) {
    if let Ok(s) = serde_json::to_string_pretty(value) {
        let _ = fs::write(path, s);
    }
}

// ---------- Settings (flat key -> value map) ----------

fn settings_path(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("settings.json")
}

pub fn settings_map(app: &tauri::AppHandle) -> Map<String, Value> {
    match load_json(&settings_path(app)) {
        Value::Object(m) => m,
        _ => Map::new(),
    }
}

pub fn save_settings_map(app: &tauri::AppHandle, map: &Map<String, Value>) {
    save_json(&settings_path(app), &Value::Object(map.clone()));
}

pub fn get_setting(app: &tauri::AppHandle, key: &str) -> Option<Value> {
    settings_map(app).get(key).cloned()
}

pub fn set_setting(app: &tauri::AppHandle, key: &str, value: Value) {
    let mut map = settings_map(app);
    map.insert(key.to_string(), value);
    save_settings_map(app, &map);
}

// ---------- Accounts ----------

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AccountRecord {
    pub cookie: String,
    pub user_id: String,
    pub display_name: String,
    pub avatar_url: String,
    pub last_login_at: i64,
    pub updated_at: i64,
}

pub type AccountsMap = HashMap<String, AccountRecord>;

fn accounts_path(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("accounts.json")
}

pub fn load_accounts(app: &tauri::AppHandle) -> AccountsMap {
    match load_json(&accounts_path(app)) {
        Value::Object(m) => {
            let mut out: AccountsMap = HashMap::new();
            for (k, v) in m {
                if let Ok(rec) = serde_json::from_value::<AccountRecord>(v) {
                    out.insert(k, rec);
                }
            }
            out
        }
        _ => AccountsMap::new(),
    }
}

pub fn save_accounts(app: &tauri::AppHandle, map: &AccountsMap) {
    let value = serde_json::to_value(map).unwrap_or(Value::Null);
    save_json(&accounts_path(app), &value);
}

// ---------- Listening ----------

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct ListeningStore {
    #[serde(default)]
    pub events: Vec<ListeningEvent>,
    #[serde(default)]
    pub profile: Option<UserProfile>,
}

fn listening_path(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("listening.json")
}

pub fn load_listening(app: &tauri::AppHandle) -> ListeningStore {
    serde_json::from_value(load_json(&listening_path(app))).unwrap_or_default()
}

pub fn save_listening(app: &tauri::AppHandle, store: &ListeningStore) {
    save_json(&listening_path(app), &serde_json::to_value(store).unwrap_or(Value::Null));
}

// ---------- Playlists ----------

fn playlists_path(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("playlists.json")
}

pub fn load_playlists(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    match load_json(&playlists_path(app)) {
        Value::Object(m) => m,
        _ => serde_json::Map::new(),
    }
}

pub fn save_playlists(app: &tauri::AppHandle, map: &serde_json::Map<String, Value>) {
    let value = Value::Object(map.clone());
    save_json(&playlists_path(app), &value);
}
