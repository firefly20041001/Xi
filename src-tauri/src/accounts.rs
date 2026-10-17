// Account store, remote account info, and the login window flow
use crate::net::{fetch_json, gtk_from_cookie, jget, jstr, jstr_or, netease_headers, now_ms, qq_headers, uin_from_cookie, UA};
use crate::store::{self, AccountRecord};
use anyhow::Result;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Url};

pub struct LoginConfig {
    pub url: &'static str,
    #[allow(dead_code)]
    pub cookie_domain: &'static str,
    pub required: &'static [&'static str],
    pub title: &'static str,
}

pub fn login_config(provider: &str) -> Option<LoginConfig> {
    match provider {
        "netease" => Some(LoginConfig {
            url: "https://music.163.com/",
            cookie_domain: "https://music.163.com/",
            required: &["MUSIC_U"],
            title: "登录 网易云音乐",
        }),
        "qqmusic" => Some(LoginConfig {
            url: "https://y.qq.com/",
            cookie_domain: "https://y.qq.com/",
            required: &["uin", "qqmusic_key", "qm_keyst"],
            title: "登录 QQ音乐",
        }),
        _ => None,
    }
}

pub fn stored_account_info(record: &AccountRecord, provider: &str) -> Option<Value> {
    if record.cookie.is_empty() {
        return None;
    }
    Some(json!({
        "provider": provider,
        "userId": if record.user_id.is_empty() {
            if provider == "netease" { "网易云用户".to_string() } else { format!("QQ{}", record.user_id) }
        } else {
            record.user_id.clone()
        },
        "displayName": if record.display_name.is_empty() {
            if provider == "netease" { "网易云用户".to_string() } else { format!("QQ{}", record.user_id) }
        } else {
            record.display_name.clone()
        },
        "avatarUrl": record.avatar_url,
        "isLoggedIn": true,
        "lastLoginAt": record.last_login_at
    }))
}

pub async fn get_account_info(
    client: &reqwest::Client,
    provider: &str,
    cookie: &str,
) -> Option<Value> {
    if cookie.is_empty() {
        return None;
    }
    match provider {
        "netease" => {
            let res = fetch_json(
                client,
                "https://music.163.com/api/nuser/account/get",
                reqwest::Method::GET,
                netease_headers(cookie),
                None,
                8,
            )
            .await
            .ok()?;
            if res.get("code").and_then(|c| c.as_i64()) == Some(200) {
                let profile = jget(&res, &["profile"])?;
                let user_id = profile
                    .get("userId")
                    .map(|i| i.to_string())
                    .unwrap_or_default();
                return Some(json!({
                    "provider": "netease",
                    "userId": user_id,
                    "displayName": jstr(profile, "nickname"),
                    "avatarUrl": jstr(profile, "avatarUrl"),
                    "isLoggedIn": true,
                    "lastLoginAt": now_ms()
                }));
            }
            // Fallback: cookie-derived identity
            if let Some(end) = cookie.find(';') {
                let _ = end;
            }
            let music_u = cookie
                .split(';')
                .find_map(|pair| pair.trim().strip_prefix("MUSIC_U="))
                .map(String::from);
            music_u.map(|u| {
                json!({
                    "provider": "netease",
                    "userId": u.chars().take(10).collect::<String>(),
                    "displayName": "网易云用户",
                    "avatarUrl": "",
                    "isLoggedIn": true,
                    "lastLoginAt": now_ms()
                })
            })
        }
        "qqmusic" => {
            let uin = uin_from_cookie(cookie);
            if uin.is_empty() || uin == "0" {
                return None;
            }
            let gtk = gtk_from_cookie(cookie);
            let body = json!({
                "comm": { "uin": format!("o{uin}"), "format": "json", "ct": 24, "cv": 4747474, "platform": "yqq.json", "chid": "0", "g_tk": gtk, "g_tk_new_20200303": gtk, "inCharset": "utf-8", "outCharset": "utf-8", "notice": 0, "needNewCode": 1 },
                "req_0": {
                    "module": "music.UserInfo.userInfoServer",
                    "method": "GetLoginUserInfo",
                    "param": {}
                }
            });
            if let Ok(res) = fetch_json(
                client,
                "https://u.y.qq.com/cgi-bin/musicu.fcg",
                reqwest::Method::POST,
                qq_headers(cookie),
                Some(body),
                10,
            )
            .await
            {
                let info = jget(&res, &["req_0", "data", "info"])
                    .cloned()
                    .unwrap_or(Value::Null);
                let nick = jstr_or(&info, &["nick", "nickname", "name"]);
                let headurl = jstr_or(&info, &["logo", "headurl", "avatar", "pic"]);
                if !nick.is_empty() || !headurl.is_empty() {
                    return Some(json!({
                        "provider": "qqmusic",
                        "userId": uin,
                        "displayName": if nick.is_empty() { format!("QQ{uin}") } else { nick },
                        "avatarUrl": headurl,
                        "isLoggedIn": true,
                        "lastLoginAt": now_ms()
                    }));
                }
            }
            // Fallback
            Some(json!({
                "provider": "qqmusic",
                "userId": uin,
                "displayName": format!("QQ{uin}"),
                "avatarUrl": "",
                "isLoggedIn": true,
                "lastLoginAt": now_ms()
            }))
        }
        _ => None,
    }
}

/// Persist the cookie and fetch+store account info, mirroring the
/// Electron accounts:openLogin flow
pub async fn save_login(app: &AppHandle, provider: &str, cookie: &str) {
    let mut accounts = store::load_accounts(app);
    let record = accounts.entry(provider.to_string()).or_default();
    record.cookie = cookie.to_string();
    record.updated_at = now_ms();

    let client = reqwest::Client::new();
    let info = get_account_info(&client, provider, cookie).await;
    let minimal = json!({
        "provider": provider,
        "userId": "",
        "displayName": if provider == "netease" { "网易云用户" } else { "QQ用户" },
        "isLoggedIn": true,
        "lastLoginAt": now_ms()
    });
    let info = info.or(Some(minimal)).unwrap();
    record.user_id = jstr(&info, "userId");
    record.display_name = jstr(&info, "displayName");
    record.avatar_url = jstr(&info, "avatarUrl");
    record.last_login_at = info
        .get("lastLoginAt")
        .and_then(|t| t.as_i64())
        .unwrap_or_else(now_ms);
    store::save_accounts(app, &accounts);
}

pub async fn refresh_account(app: &AppHandle, provider: &str) -> Option<Value> {
    let accounts = store::load_accounts(app);
    let record = accounts.get(provider)?.clone();
    if record.cookie.is_empty() {
        return None;
    }
    let stored = stored_account_info(&record, provider);
    let client = reqwest::Client::new();
    match get_account_info(&client, provider, &record.cookie).await {
        Some(info) => {
            // A refresh is not a login: keep lastLoginAt, don't wipe stored
            // values with empty fields from a degraded response
            fn pick(info: &Value, stored: &Option<Value>, key: &str) -> String {
                let fresh = info.get(key).and_then(|x| x.as_str()).unwrap_or("");
                if !fresh.is_empty() {
                    return fresh.to_string();
                }
                stored
                    .as_ref()
                    .and_then(|s| s.get(key))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string()
            }
            let last_login = stored
                .as_ref()
                .and_then(|s| s.get("lastLoginAt"))
                .and_then(|t| t.as_i64())
                .unwrap_or_else(now_ms);
            let merged = json!({
                "provider": provider,
                "userId": pick(&info, &stored, "userId"),
                "displayName": pick(&info, &stored, "displayName"),
                "avatarUrl": pick(&info, &stored, "avatarUrl"),
                "isLoggedIn": true,
                "lastLoginAt": last_login
            });
            let mut accounts = store::load_accounts(app);
            if let Some(rec) = accounts.get_mut(provider) {
                rec.user_id = jstr(&merged, "userId");
                rec.display_name = jstr(&merged, "displayName");
                rec.avatar_url = jstr(&merged, "avatarUrl");
                rec.last_login_at = last_login;
            }
            store::save_accounts(app, &accounts);
            let accounts = store::load_accounts(app);
            stored_account_info(accounts.get(provider)?, provider)
        }
        None => stored,
    }
}

/// Open the login window and poll for session cookies. Resolves true when
/// the required cookies appeared, false when the user closed the window.
pub async fn open_login(app: AppHandle, provider: String) -> Result<bool, String> {
    let config = login_config(&provider).ok_or_else(|| "unknown provider".to_string())?;
    let _ = close_login(&app);

    let url: Url = config.url.parse().map_err(|_| "bad login url".to_string())?;
    let win = tauri::WebviewWindowBuilder::new(&app, "login", tauri::WebviewUrl::External(url.clone()))
        .title(config.title)
        .inner_size(1120.0, 760.0)
        .user_agent(UA)
        .build()
        .map_err(|e| e.to_string())?;

    let mut collected: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        let Some(current) = app.get_webview_window("login") else {
            return Ok(false); // user closed the window
        };
        if let Ok(cookies) = win.cookies_for_url(url.clone()) {
            for c in cookies {
                collected.insert(c.name().to_string(), c.value().to_string());
            }
        }
        if config.required.iter().any(|r| collected.contains_key(*r)) {
            let cookie_str = collected
                .iter()
                .map(|(k, v)| format!("{k}={v}"))
                .collect::<Vec<_>>()
                .join("; ");
            let _ = current.close();
            save_login(&app, &provider, &cookie_str).await;
            return Ok(true);
        }
        let _ = win; // keep borrow alive
        let _ = &current;
        std::hint::black_box(());
    }
}

pub fn close_login(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("login") {
        let _ = w.close();
    }
    Ok(())
}
