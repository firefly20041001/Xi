use anyhow::{anyhow, Result};
use reqwest::{Client, Method};
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

pub fn new_client() -> Client {
    Client::builder()
        .user_agent(UA)
        
        .build()
        .expect("failed to build HTTP client")
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn netease_headers(cookie: &str) -> Vec<(&'static str, String)> {
    let mut h: Vec<(&'static str, String)> = vec![
        ("Referer", "https://music.163.com/".into()),
        ("Origin", "https://music.163.com".into()),
    ];
    if !cookie.is_empty() {
        h.push(("Cookie", cookie.to_string()));
    }
    h
}

pub fn qq_headers(cookie: &str) -> Vec<(&'static str, String)> {
    let mut h: Vec<(&'static str, String)> = vec![
        ("Referer", "https://y.qq.com/".into()),
        ("Origin", "https://y.qq.com".into()),
    ];
    if !cookie.is_empty() {
        h.push(("Cookie", cookie.to_string()));
    }
    h
}

/// QQ 请求但指定 Referer(个人主页端点要求 profile.html,否则返回空)
pub fn qq_headers_referer(cookie: &str, referer: &str) -> Vec<(&'static str, String)> {
    let mut h: Vec<(&'static str, String)> = vec![
        ("Referer", referer.to_string()),
        ("Origin", "https://y.qq.com".into()),
    ];
    if !cookie.is_empty() {
        h.push(("Cookie", cookie.to_string()));
    }
    h
}

/// 从 Cookie 串中取指定 key 的原值(如 qm_keyst,用于 musicu authst)
pub fn cookie_value(cookie: &str, name: &str) -> String {
    let pat = format!("{}=", name.to_lowercase());
    let lower = cookie.to_lowercase();
    if let Some(idx) = lower.find(&pat) {
        let rest = &cookie[idx + pat.len()..];
        let end = rest.find(';').unwrap_or(rest.len());
        return rest[..end].trim().to_string();
    }
    String::new()
}

pub fn uin_from_cookie(cookie: &str) -> String {
    for name in [
        "uin",
        "qqmusic_uin",
        "p_uin",
        "pt2gguin",
        "loginUin",
        "wxuin",
    ] {
        // name=o123 or name=123
        let patterns = [format!("{}=o", name), format!("{}=", name)];
        for p in &patterns {
            if let Some(idx) = cookie.to_lowercase().find(&p.to_lowercase()) {
                let rest = &cookie[idx + p.len()..];
                let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                if !digits.is_empty() {
                    return digits;
                }
            }
        }
    }
    "0".into()
}

fn js_to_int32(v: f64) -> i32 {
    let m = v.rem_euclid(4294967296.0);
    if m >= 2147483648.0 { (m - 4294967296.0) as i32 } else { m as i32 }
}

pub fn gtk_from_cookie(cookie: &str) -> i64 {
    for name in [
        "qqmusic_key",
        "qm_keyst",
        "music_key",
        "p_skey",
        "skey",
    ] {
        let pat = format!("{}=", name);
        if let Some(idx) = cookie.find(&pat) {
            let rest = &cookie[idx + pat.len()..];
            let end = rest.find(';').unwrap_or(rest.len());
            let skey = &rest[..end];
            // JS semantics: (hash << 5) ToInt32s first, then adds in float64.
            // i64 arithmetic overflows (panics in debug) and diverges from TS.
            let mut hash: f64 = 5381.0;
            for ch in skey.chars() {
                let shifted = ((js_to_int32(hash) as u32) << 5) as i32;
                hash += shifted as f64 + ch as u32 as f64;
            }
            return (js_to_int32(hash) & 0x7fffffff) as i64;
        }
    }
    5381
}

/// 把 surfacing 响应统一解析为 JSON(状态码/HTML 防线)
async fn parse_json_response(resp: reqwest::Response) -> Result<Value> {
    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        return Err(anyhow!("HTTP {}", status));
    }
    let trimmed = text.trim_start();
    if trimmed.starts_with("<!DOCTYPE") || trimmed.starts_with("<html") {
        return Err(anyhow!("API returned HTML instead of JSON"));
    }
    Ok(serde_json::from_str(&text)?)
}

pub async fn fetch_json(
    client: &Client,
    url: &str,
    method: Method,
    headers: Vec<(&'static str, String)>,
    body: Option<Value>,
    timeout_secs: u64,
) -> Result<Value> {
    let mut req = client
        .request(method, url)
        .timeout(Duration::from_secs(timeout_secs));
    for (k, v) in headers {
        req = req.header(k, v);
    }
    if let Some(b) = body {
        req = req.json(&b);
    }
    let resp = req.send().await?;
    parse_json_response(resp).await
}

/// form 表单 POST 取 JSON(对照 NexBox post_api:NetEase 端点要求
/// application/x-www-form-urlencoded 而非 JSON body)
pub async fn fetch_json_form(
    client: &Client,
    url: &str,
    headers: Vec<(&'static str, String)>,
    params: &[(&str, &str)],
    timeout_secs: u64,
) -> Result<Value> {
    let mut req = client.post(url).timeout(Duration::from_secs(timeout_secs));
    for (k, v) in headers {
        req = req.header(k, v);
    }
    let resp = req.form(params).send().await?;
    parse_json_response(resp).await
}

pub async fn fetch_text(
    client: &Client,
    url: &str,
    headers: Vec<(&'static str, String)>,
    timeout_secs: u64,
) -> Result<String> {
    let mut req = client
        .get(url)
        .timeout(Duration::from_secs(timeout_secs));
    for (k, v) in headers {
        req = req.header(k, v);
    }
    let resp = req.send().await?;
    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        return Err(anyhow!("HTTP {}", status));
    }
    Ok(text)
}

/// Navigate a JSON value by pointer segments, e.g. jget(&v, &["result", "songs"])
pub fn jget<'a>(v: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut cur = v;
    for seg in path {
        cur = cur.get(seg)?;
    }
    Some(cur)
}

pub fn jstr(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(String::from)
        .unwrap_or_default()
}

pub fn jstr_or(v: &Value, keys: &[&str]) -> String {
    for k in keys {
        if let Some(s) = v.get(k).and_then(|x| x.as_str()) {
            return s.to_string();
        }
    }
    String::new()
}

pub fn ji64(v: &Value, keys: &[&str]) -> i64 {
    for k in keys {
        if let Some(n) = v.get(k) {
            if let Some(i) = n.as_i64() {
                return i;
            }
            if let Some(f) = n.as_f64() {
                return f as i64;
            }
        }
    }
    0
}
