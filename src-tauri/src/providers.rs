// Streaming + lyrics + daily recommend providers, ported from the
// Electron main process (NetEase/QQ plain web APIs with cookie auth).
use crate::net::{
    cookie_value, fetch_json, fetch_json_form, fetch_text, gtk_from_cookie, jget, ji64, jstr,
    jstr_or, netease_headers, now_ms, qq_headers, qq_headers_referer, uin_from_cookie,
};
use crate::types::*;
use anyhow::Result;
use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;

const NETEASE_API: &str = "https://music.163.com";
const QQ_API: &str = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const QQ_LEGACY: &str = "https://c.y.qq.com";
const QQ_MUSICS: &str = "https://u.y.qq.com/cgi-bin/musics.fcg";
// 移动端(Apply DoSearchForQQMusicMobile)搜索通道要求的 App UA(NexBox 实测)
const QQ_SEARCH_UA: &str = "QQMusic 14090508(android 12)";
// QQ 歌单同步参数(取法对照 NexBox music_api/qqmusic.rs 的验证结果)
const QQ_PROFILE_REFERER: &str = "https://y.qq.com/portal/profile.html";
const QQ_LIKED_DIRID: i64 = 201;
// QQ"我喜欢"行(服务端 dirid=201, Naturally在自建列表返回)保真展示用的官方封面
const QQ_LIKED_COVER: &str = "https://y.gtimg.cn/mediastyle/global/img/cover_like.png";
const QQ_SYNC_PAGE_SIZE: usize = 200;
const QQ_SYNC_MAX_PAGES: usize = 25;
const QQ_LIKED_PAGES: usize = 10;

// ---------- NetEase ----------

pub fn map_netease_track(song: &Value) -> Track {
    let fee = song.get("fee").and_then(|f| f.as_i64()).unwrap_or(0);
    let artists = jget(song, &["ar"])
        .or_else(|| jget(song, &["artists"]))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a.get("name").and_then(|n| n.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();
    Track {
        id: ji64(song, &["id"]).to_string(),
        source: "netease".into(),
        name: jstr(song, "name"),
        artists,
        album_name: jget(song, &["al"])
            .or_else(|| jget(song, &["album"]))
            .and_then(|a| a.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string(),
        album_id: jget(song, &["al"])
            .or_else(|| jget(song, &["album"]))
            .and_then(|a| a.get("id"))
            .map(|i| match i {
                Value::Number(n) => n.to_string(),
                Value::String(s) => s.clone(),
                _ => String::new(),
            })
            .unwrap_or_default(),
        album_cover_url: jget(song, &["al"])
            .or_else(|| jget(song, &["album"]))
            .and_then(|a| a.get("picUrl"))
            .and_then(|p| p.as_str())
            .unwrap_or("")
            .to_string(),
        duration: ji64(song, &["dt", "duration"]),
        vip: Some(fee == 1 || fee == 4),
        quality: None,
        mapped_track_id: None,
        mapped_source: None,
    }
}

pub async fn netease_search(
    client: &reqwest::Client,
    cookie: &str,
    request: &SearchRequest,
) -> Result<SearchResult> {
    let t = request
        .search_type
        .as_ref()
        .and_then(|v| v.first())
        .map(String::as_str)
        .unwrap_or("track");
    let search_type = match t {
        "album" => 10,
        "artist" => 100,
        "playlist" => 1000,
        _ => 1,
    };
    let limit = request.limit.unwrap_or(30);
    let offset = request.offset.unwrap_or(0);
    let url = format!(
        "{NETEASE_API}/api/cloudsearch/pc?s={}&type={search_type}&limit={limit}&offset={offset}",
        uri_encode(&request.query)
    );
    let res = fetch_json(
        client,
        &url,
        reqwest::Method::GET,
        netease_headers(cookie),
        None,
        8,
    )
    .await?;

    let empty = Vec::new();
    let songs = jget(&res, &["result", "songs"]).and_then(|v| v.as_array()).unwrap_or(&empty).clone();
    let total = jget(&res, &["result", "songCount"])
        .and_then(|v| v.as_i64())
        .unwrap_or(songs.len() as i64);
    let tracks = songs.iter().map(map_netease_track).collect();

    let albums = jget(&res, &["result", "albums"])
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|a| Album {
                    id: ji64(a, &["id"]).to_string(),
                    source: "netease".into(),
                    name: jstr(a, "name"),
                    artist: jget(a, &["artist"])
                        .and_then(|x| x.get("name"))
                        .and_then(|n| n.as_str())
                        .unwrap_or("")
                        .to_string(),
                    cover_url: jstr(a, "picUrl"),
                    tracks: vec![],
                    publish_time: None,
                })
                .collect()
        })
        .unwrap_or_default();

    let artists = jget(&res, &["result", "artists"])
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|a| Artist {
                    id: ji64(a, &["id"]).to_string(),
                    source: "netease".into(),
                    name: jstr(a, "name"),
                    avatar_url: Some(jstr(a, "picUrl")),
                })
                .collect()
        })
        .unwrap_or_default();

    let playlists = jget(&res, &["result", "playlists"])
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|p| Playlist {
                    id: ji64(p, &["id"]).to_string(),
                    source: "netease".into(),
                    name: jstr(p, "name"),
                    description: Some(jstr(p, "description")),
                    cover_url: jstr(p, "coverImgUrl"),
                    track_count: ji64(p, &["trackCount"]),
                    creator_name: jget(p, &["creator"])
                        .and_then(|c| c.get("nickname"))
                        .and_then(|n| n.as_str())
                        .unwrap_or("")
                        .to_string(),
                    creator_id: jget(p, &["creator"])
                        .and_then(|c| c.get("userId"))
                        .map(|i| i.to_string())
                        .unwrap_or_default(),
                    tracks: None,
                    is_local: None,
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(SearchResult {
        tracks,
        albums,
        artists,
        playlists,
        total,
        has_more: (offset + songs.len() as i64) < total,
        source: "netease".into(),
    })
}

pub async fn netease_get_track(client: &reqwest::Client, cookie: &str, id: &str) -> Result<Track> {
    let url = format!("{NETEASE_API}/api/song/detail/?id={id}&ids=[{id}]");
    let res = fetch_json(
        client,
        &url,
        reqwest::Method::GET,
        netease_headers(cookie),
        None,
        8,
    )
    .await?;
    let song = jget(&res, &["songs"])
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| anyhow::anyhow!("Track not found: {id}"))?;
    Ok(map_netease_track(song))
}

fn netease_levels(quality: &str) -> Vec<(&'static str, i64, &'static str)> {
    match quality {
        "hires" => vec![
            ("jymaster", 2000000, "flac"),
            ("sky", 1500000, "flac"),
            ("jyeffect", 1500000, "flac"),
            ("hires", 999000, "flac"),
            ("lossless", 999000, "flac"),
            ("exhigh", 320000, "mp3"),
            ("higher", 192000, "mp3"),
            ("standard", 128000, "mp3"),
        ],
        "lossless" => vec![
            ("lossless", 999000, "flac"),
            ("exhigh", 320000, "mp3"),
            ("higher", 192000, "mp3"),
            ("standard", 128000, "mp3"),
        ],
        "high" => vec![
            ("exhigh", 320000, "mp3"),
            ("higher", 192000, "mp3"),
            ("standard", 128000, "mp3"),
        ],
        _ => vec![("standard", 128000, "mp3")],
    }
}

pub async fn netease_resolve_playback(
    client: &reqwest::Client,
    cookie: &str,
    id: &str,
    quality: &str,
) -> Result<PlaybackInfo> {
    for (level, bitrate, encode_type) in netease_levels(quality) {
        let url = format!(
            "{NETEASE_API}/api/song/enhance/player/url/v1?ids=[{id}]&level={level}&br={bitrate}&encodeType={encode_type}&csrf_token=&os=pc"
        );
        if let Ok(res) = fetch_json(
            client,
            &url,
            reqwest::Method::GET,
            netease_headers(cookie),
            None,
            5,
        )
        .await
        {
            if let Some(u) = jget(&res, &["data"])
                .and_then(|d| d.as_array())
                .and_then(|a| a.first())
                .and_then(|item| item.get("url"))
                .and_then(|u| u.as_str())
            {
                if !u.is_empty() {
                    return Ok(PlaybackInfo {
                        url: u.into(),
                        quality: quality.into(),
                        format: encode_type.into(),
                        bitrate,
                        size: 0,
                    });
                }
            }
        }
        let url = format!("{NETEASE_API}/api/song/enhance/player/url?ids=[{id}]&br={bitrate}");
        if let Ok(res) = fetch_json(
            client,
            &url,
            reqwest::Method::GET,
            netease_headers(cookie),
            None,
            5,
        )
        .await
        {
            if let Some(u) = jget(&res, &["data"])
                .and_then(|d| d.as_array())
                .and_then(|a| a.first())
                .and_then(|item| item.get("url"))
                .and_then(|u| u.as_str())
            {
                if !u.is_empty() {
                    return Ok(PlaybackInfo {
                        url: u.into(),
                        quality: quality.into(),
                        format: "mp3".into(),
                        bitrate,
                        size: 0,
                    });
                }
            }
        }
    }
    Err(anyhow::anyhow!("Failed to get playback URL"))
}

pub async fn netease_get_playlist(
    client: &reqwest::Client,
    cookie: &str,
    id: &str,
) -> Result<Playlist> {
    // 取法对照 NexBox playlist_info_with_track_ids + song_detail:
    // POST form /api/v6/playlist/detail(id,n,s,csrf_token)拿全部 trackIds,
    // 再分批 POST /api/v3/song/detail 映射曲目(旧 GET 单次接口对部分账号返回空)。
    let url = format!("{NETEASE_API}/api/v6/playlist/detail");
    let params = [
        ("id", id.to_string()),
        ("n", "1000".to_string()),
        ("s", "0".to_string()),
        ("csrf_token", String::new()),
    ];
    let params_refs: Vec<(&str, &str)> = params.iter().map(|(k, v)| (*k, v.as_str())).collect();
    let res = match fetch_json_form(client, &url, netease_headers(cookie), &params_refs, 8).await {
        Ok(res) => res,
        Err(_) => {
            // POST 风控时回退旧 GET 单点
            fetch_json(
                client,
                &format!("{NETEASE_API}/api/v6/playlist/detail?id={id}"),
                reqwest::Method::GET,
                netease_headers(cookie),
                None,
                8,
            )
            .await?
        }
    };
    let pl = jget(&res, &["playlist"]).ok_or_else(|| anyhow::anyhow!("Playlist not found"))?;

    // 全部 trackIds → 分批 v3 song/detail(500/批)
    let track_ids: Vec<String> = jget(pl, &["trackIds"])
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.get("id").map(|i| i.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let mut tracks: Vec<Track> = Vec::new();
    if !track_ids.is_empty() {
        for chunk in track_ids.chunks(500) {
            let c_json: Vec<Value> = chunk
                .iter()
                .map(|s| json!({ "id": s.parse::<i64>().unwrap_or(0) }))
                .collect();
            let c = serde_json::to_string(&c_json)?;
            let batch = [
                ("c", c.as_str()),
                ("csrf_token", ""),
            ];
            match fetch_json_form(
                client,
                &format!("{NETEASE_API}/api/v3/song/detail"),
                netease_headers(cookie),
                &batch,
                8,
            )
            .await
            {
                Ok(v3) => {
                    if let Some(songs) = jget(&v3, &["songs"]).and_then(|v| v.as_array()) {
                        let got = songs.len();
                        tracks.extend(songs.iter().map(map_netease_track));
                        if got < chunk.len() {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("[NeteasePlaylist] song/detail batch failed: {e}");
                    break;
                }
            }
        }
    }
    // trackIds 缺失时的兜底:旧 track/all 端点分页
    if tracks.is_empty() {
        for offset in (0..3200u64).step_by(200) {
            match fetch_json(
                client,
                &format!("{NETEASE_API}/api/playlist/track/all?id={id}&limit=200&offset={offset}"),
                reqwest::Method::GET,
                netease_headers(cookie),
                None,
                8,
            )
            .await
            {
                Ok(tr) => {
                    if let Some(songs) = jget(&tr, &["songs"]).and_then(|v| v.as_array()) {
                        let got = songs.len();
                        tracks.extend(songs.iter().map(map_netease_track));
                        if got < 200 {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("[NeteasePlaylist] track/all offset {offset} failed: {e}");
                    break;
                }
            }
        }
    }

    Ok(Playlist {
        id: pl
            .get("id")
            .map(|i| i.to_string())
            .unwrap_or_else(|| id.into()),
        source: "netease".into(),
        name: jstr(pl, "name"),
        description: Some(jstr(pl, "description")),
        cover_url: jstr(pl, "coverImgUrl"),
        track_count: ji64(pl, &["trackCount"]),
        creator_name: jget(pl, &["creator"])
            .and_then(|c| c.get("nickname"))
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string(),
        creator_id: jget(pl, &["creator"])
            .and_then(|c| c.get("userId"))
            .map(|i| i.to_string())
            .unwrap_or_default(),
        tracks: Some(tracks),
        is_local: None,
    })
}

pub async fn netease_get_user_playlists(
    client: &reqwest::Client,
    cookie: &str,
    user_id: &str,
) -> Result<Vec<Playlist>> {
    // 取法对照 NexBox music_api/netease.rs user_playlist:
    // uid/limit=100/offset/csrf_token=""(原实现 limit=1000+includeVideo=true,
    // 部分账号返回不正常)。分页循环补齐 100/页。
    if user_id.is_empty() {
        return Ok(vec![]);
    }
    let mut rows: Vec<Value> = vec![];
    let mut offset: u64 = 0;
    for _ in 0..30 {
        let url = format!(
            "{NETEASE_API}/api/user/playlist?uid={user_id}&limit=100&offset={offset}&csrf_token="
        );
        let res = match fetch_json(
            client,
            &url,
            reqwest::Method::GET,
            netease_headers(cookie),
            None,
            8,
        )
        .await
        {
            Ok(res) => res,
            Err(e) => {
                eprintln!("[NeteasePlaylist] user/playlist offset {offset} failed: {e}");
                break;
            }
        };
        // 普通 API 返回 {playlist: [...]},个别情况直接是数组
        let empty = Vec::new();
        let page_rows = jget(&res, &["playlist"])
            .and_then(|v| v.as_array())
            .or_else(|| res.as_array())
            .unwrap_or(&empty)
            .clone();
        let len = page_rows.len();
        rows.extend(page_rows);
        if len < 100 {
            break;
        }
        offset += 100;
    }
    Ok(rows
        .iter()
        .map(|pl| Playlist {
            id: pl
                .get("id")
                .map(|i| i.to_string())
                .unwrap_or_default(),
            source: "netease".into(),
            name: jstr(pl, "name"),
            description: Some(jstr(pl, "description")),
            cover_url: jstr_or(pl, &["coverImgUrl", "picUrl"]),
            track_count: ji64(pl, &["trackCount"]),
            creator_name: jget(pl, &["creator"])
                .and_then(|c| c.get("nickname"))
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string(),
            creator_id: jget(pl, &["creator"])
                .and_then(|c| c.get("userId"))
                .map(|i| i.to_string())
                .unwrap_or_default(),
            tracks: None,
            is_local: None,
        })
        .collect())
}

pub async fn netease_get_album(client: &reqwest::Client, cookie: &str, id: &str) -> Result<Album> {
    let url = format!("{NETEASE_API}/api/v1/album/{id}");
    let res = fetch_json(
        client,
        &url,
        reqwest::Method::GET,
        netease_headers(cookie),
        None,
        8,
    )
    .await?;
    Ok(Album {
        id: jget(&res, &["album", "id"])
            .map(|i| i.to_string())
            .unwrap_or_else(|| id.into()),
        source: "netease".into(),
        name: jget(&res, &["album", "name"])
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string(),
        artist: jget(&res, &["album", "artist", "name"])
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string(),
        cover_url: jget(&res, &["album", "picUrl"])
            .and_then(|p| p.as_str())
            .unwrap_or("")
            .to_string(),
        tracks: jget(&res, &["songs"])
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().map(map_netease_track).collect())
            .unwrap_or_default(),
        publish_time: jget(&res, &["album", "publishTime"]).and_then(|p| p.as_i64()),
    })
}

// ---------- QQ Music ----------

fn map_qq_track(song: &Value) -> Track {
    let mid = jstr_or(song, &["mid", "songmid", "song_mid"]);
    let album_mid = jget(song, &["album"])
        .and_then(|a| a.get("mid"))
        .and_then(|m| m.as_str())
        .map(String::from)
        .unwrap_or_else(|| jstr_or(song, &["albummid", "album_mid"]));
    let action_switch = jget(song, &["action", "switch"])
        .and_then(|s| s.as_i64())
        .unwrap_or(0);
    let pay_play = jget(song, &["pay", "play"]).and_then(|p| p.as_i64()).unwrap_or(-1);
    let interval = ji64(song, &["interval"]);
    Track {
        id: if !mid.is_empty() {
            mid
        } else {
            ji64(song, &["id", "songid"]).to_string()
        },
        source: "qqmusic".into(),
        name: jstr_or(song, &["name", "songname"]),
        artists: jget(song, &["singer"])
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| s.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        album_name: jget(song, &["album"])
            .and_then(|a| a.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string(),
        album_id: album_mid.clone(),
        album_cover_url: if album_mid.is_empty() {
            String::new()
        } else {
            format!("https://y.gtimg.cn/music/photo_new/T002R300x300M000{album_mid}.jpg")
        },
        duration: interval * 1000,
        vip: Some(action_switch == 16 || pay_play == 0),
        quality: None,
        mapped_track_id: None,
        mapped_source: None,
    }
}

fn map_qq_track_lenient(song: &Value) -> Track {
    // Handles the varied response formats across endpoints
    let mid = jstr_or(song, &["mid", "songmid", "song_mid"]);
    let name = jstr_or(song, &["name", "songname", "song_name", "title"]);
    let artists = jget(song, &["singer"])
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|s| {
                    s.get("name")
                        .or_else(|| s.get("singer_name"))
                        .and_then(|n| n.as_str())
                        .map(String::from)
                })
                .collect()
        })
        .unwrap_or_default();
    let album_mid = jget(song, &["album"])
        .and_then(|a| a.get("mid"))
        .and_then(|m| m.as_str())
        .map(String::from)
        .unwrap_or_else(|| jstr_or(song, &["albummid", "album_mid"]));
    let album_name = jget(song, &["album"])
        .and_then(|a| a.get("name"))
        .and_then(|n| n.as_str())
        .map(String::from)
        .unwrap_or_else(|| jstr_or(song, &["albumname", "album_name"]));
    let interval = ji64(song, &["interval", "duration", "play_time"]);
    Track {
        id: if !mid.is_empty() {
            mid
        } else {
            ji64(song, &["id", "songid"]).to_string()
        },
        source: "qqmusic".into(),
        name,
        artists,
        album_name,
        album_id: album_mid.clone(),
        album_cover_url: if album_mid.is_empty() {
            String::new()
        } else {
            format!("https://y.gtimg.cn/music/photo_new/T002R300x300M000{album_mid}.jpg")
        },
        duration: if interval < 10000 { interval * 1000 } else { interval },
        vip: None,
        quality: None,
        mapped_track_id: None,
        mapped_source: None,
    }
}

async fn qq_fetch_song(client: &reqwest::Client, cookie: &str, song_mid: &str) -> Value {
    let uin = uin_from_cookie(cookie);
    let gtk = gtk_from_cookie(cookie);
    let body = json!({
        "req_0": {
            "module": "music.pf_song_detail_svr",
            "method": "get_song_detail_yqq",
            "param": { "song_mid": song_mid, "song_type": 0 }
        },
        "comm": { "uin": uin, "format": "json", "ct": 24, "cv": 0, "g_tk": gtk }
    });
    let res = fetch_json(
        client,
        QQ_API,
        reqwest::Method::POST,
        qq_headers(cookie),
        Some(body),
        8,
    )
    .await
    .unwrap_or(Value::Null);
    jget(&res, &["req_0", "data", "track_info"])
        .or_else(|| jget(&res, &["req_0", "data", "songinfo"]))
        .cloned()
        .unwrap_or(Value::Null)
}

// QQ 移动端搜索签名(NexBox 实测):SHA1(body) 十六进制摘要取位重组 + 异或表转 base64,
// 组出 zzc 前缀小写签名挂 musics.fcg?sign=
fn qq_search_sign(text: &str) -> String {
    use sha1::{Digest, Sha1};
    let mut hasher = Sha1::new();
    hasher.update(text.as_bytes());
    let hash: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    let hash_bytes = hash.as_bytes();

    let part1_indices = [23usize, 14, 6, 36, 16, 40, 7, 19];
    let part2_indices = [16usize, 1, 32, 12, 19, 27, 8, 5];
    let scramble = [
        89u8, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121,
        179,
    ];

    let part1: String = part1_indices.iter().filter_map(|&i| hash_bytes.get(i).map(|&b| b as char)).collect();
    let part2: String = part2_indices.iter().filter_map(|&i| hash_bytes.get(i).map(|&b| b as char)).collect();

    let bytes: Vec<u8> = scramble
        .iter()
        .enumerate()
        .map(|(i, &v)| v ^ u8::from_str_radix(&hash[i * 2..i * 2 + 2], 16).unwrap_or(0))
        .collect();

    let middle: String = base64::engine::general_purpose::STANDARD
        .encode(&bytes)
        .chars()
        .filter(|c| *c != '\\' && *c != '/' && *c != '+' && *c != '=')
        .collect();

    format!("zzc{part1}{middle}{part2}").to_lowercase()
}

// 移动端搜索结果名带 <em> 高亮标签,剥掉
fn strip_html_tags(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut depth = 0usize;
    for ch in text.chars() {
        match ch {
            '<' => depth += 1,
            '>' if depth > 0 => depth -= 1,
            c if depth == 0 => out.push(c),
            _ => {}
        }
    }
    out
}

// 字段取字符串(数值/字符串通吃)——移动端歌单字段 dissid 有两种类型
fn jstr_any(v: &Value, keys: &[&str]) -> String {
    for k in keys {
        if let Some(x) = v.get(*k) {
            match x {
                Value::String(s) => {
                    if !s.is_empty() {
                        return s.clone();
                    }
                }
                Value::Number(n) => return n.to_string(),
                _ => {}
            }
        }
    }
    String::new()
}

// 网易云热门歌单(首页「推荐歌单」卡数据源):api 域名免加密 GET /api/playlist/list(order=hot,cat=全部)
pub async fn netease_hot_playlists(
    client: &reqwest::Client,
    cookie: &str,
    limit: i64,
) -> Result<Vec<Playlist>> {
    let limit = limit.clamp(1, 50);
    let url = format!(
        "{NETEASE_API}/api/playlist/list?cat=%E5%85%A8%E9%83%A8&order=hot&limit={limit}&offset=0"
    );
    let mut headers: Vec<(&str, String)> = vec![("Referer", "https://music.163.com/".into())];
    if !cookie.trim().is_empty() {
        headers.push(("Cookie", cookie.to_string()));
    }
    let res = fetch_json(client, &url, reqwest::Method::GET, headers, None, 15).await?;
    let items = jget(&res, &["playlists"])
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(items
        .iter()
        .filter_map(|item| {
            let id = jget(item, &["id"])
                .and_then(|v| v.as_i64())
                .map(|v| v.to_string())
                .unwrap_or_else(|| jstr_any(item, &["id"]));
            let name = jstr_any(item, &["name"]).trim().to_string();
            if id.is_empty() || name.is_empty() {
                return None;
            }
            Some(Playlist {
                id,
                source: "netease".into(),
                name,
                description: None,
                cover_url: jstr_any(item, &["coverImgUrl", "picUrl"]),
                track_count: jget(item, &["trackCount"]).and_then(|v| v.as_i64()).unwrap_or(0),
                creator_name: jget(item, &["creator", "nickname"])
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                creator_id: String::new(),
                tracks: None,
                is_local: None,
            })
        })
        .collect())
}

// QQ 推荐歌单(歌单广场-推荐分类,NexBox 同源):fcg_get_diss_by_tag 全匿名参数,免登录可用
pub async fn qq_hot_playlists(client: &reqwest::Client, limit: i64) -> Result<Vec<Playlist>> {
    let limit = limit.clamp(1, 50);
    let url = format!(
        "https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg?g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0&categoryId=10000000&sin=0&ein={limit}&order=play&format=json"
    );
    let headers = vec![
        ("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36".to_string()),
        // c.y.qq.com splcloud fcg 需要 y.qq.com Referer,缺了会拉空
        ("Referer", "https://y.qq.com/".to_string()),
    ];
    let res = fetch_json(client, &url, reqwest::Method::GET, headers, None, 15).await?;
    let items = jget(&res, &["data", "list"])
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(items
        .iter()
        .filter_map(|item| {
            let id = jget(item, &["dissid"])
                .and_then(|v| v.as_i64())
                .map(|v| v.to_string())
                .unwrap_or_else(|| jstr_any(item, &["dissid"]));
            let name = strip_html_tags(jstr_any(item, &["dissname"]).trim());
            if id.is_empty() || name.is_empty() {
                return None;
            }
            let mut cover = jstr_any(item, &["imgurl", "logo", "pic"]);
            if cover.starts_with("//") {
                cover = format!("https:{cover}");
            }
            Some(Playlist {
                id,
                source: "qqmusic".into(),
                name,
                description: None,
                cover_url: cover,
                // 该接口无 songnum:以 listennum(播放量)作数量,QQ 卡前端显示「N 万听」
                track_count: jget(item, &["listennum"])
                    .or_else(|| jget(item, &["songnum"]))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
                creator_name: jget(item, &["creator", "name"])
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                creator_id: String::new(),
                tracks: None,
                is_local: None,
            })
        })
        .collect())
}

// QQ 歌单搜索(NexBox 实测):移动端搜索通道 DoSearchForQQMusicMobile(search_type=3 为歌单,
// cat=2 grp=1),body 要 zzc 签名;桌面通道对歌单类型不返回数据(实测空列表),故不走它
pub async fn qq_search_playlists(
    client: &reqwest::Client,
    keyword: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<Playlist>> {
    let kw = keyword.trim();
    if kw.is_empty() {
        return Ok(vec![]);
    }
    let limit = limit.clamp(1, 50);
    let body = json!({
        "comm": {
            "ct": "11", "cv": "14090508", "v": "14090508", "tmeAppID": "qqmusic",
            "phonetype": "EBG-AN10", "os_ver": "12", "OpenUDID": "0", "QIMEI36": "0",
            "udid": "0", "chid": "0", "aid": "0", "oaid": "0", "taid": "0", "tid": "0",
            "wid": "0", "uid": "0", "sid": "0", "modeSwitch": "6", "teenMode": "0",
            "ui_mode": "2", "nettype": "1020"
        },
        "req": {
            "module": "music.search.SearchCgiService",
            "method": "DoSearchForQQMusicMobile",
            "param": {
                "search_type": 3,
                "searchid": format!("{}", now_ms()),
                "query": kw,
                "page_num": offset / limit + 1,
                "num_per_page": limit,
                "highlight": 0,
                "nqc_flag": 0,
                "multi_zhida": 0,
                "cat": 2,
                "grp": 1,
                "sin": offset,
                "sem": offset + limit
            }
        }
    });
    let text = serde_json::to_string(&body)?;
    let sign = qq_search_sign(&text);
    let url = format!("{QQ_MUSICS}?sign={sign}");
    let headers = vec![("User-Agent", QQ_SEARCH_UA.to_string())];
    let res = fetch_json(client, &url, reqwest::Method::POST, headers, Some(body), 10).await?;

    let body_v = jget(&res, &["req", "data"]).cloned().unwrap_or(Value::Null);
    let items = jget(&body_v, &["body", "item_songlist"])
        .or_else(|| jget(&body_v, &["body", "playlist"]))
        .or_else(|| jget(&body_v, &["body", "songlist"]))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(items
        .iter()
        .filter_map(|item| {
            let id = jstr_any(item, &["dissid", "disstid", "tid", "id"]);
            let name = strip_html_tags(jstr_any(item, &["dissname", "diss_name", "name"]).trim());
            if id.is_empty() || name.is_empty() {
                return None;
            }
            let mut cover = jstr_any(item, &["logo", "imgurl", "simgurl", "pic"]);
            if cover.starts_with("//") {
                cover = format!("https:{cover}");
            }
            Some(Playlist {
                id,
                source: "qqmusic".into(),
                name,
                description: None,
                cover_url: cover,
                track_count: jget(item, &["songnum"])
                    .and_then(|v| v.as_i64())
                    .or_else(|| jget(item, &["song_count"]).and_then(|v| v.as_i64()))
                    .unwrap_or(0),
                creator_name: jstr_any(item, &["nickname"]).trim().to_string(),
                creator_id: String::new(),
                tracks: None,
                is_local: None,
            })
        })
        .collect())
}

// QQ 歌手搜索:smartbox_new.fcg 匿名 GET(NexBox 同源,桌面通道 singer 列不全)→ data.singer.itemlist[{mid,name}]
pub async fn qq_smartbox_artists(
    client: &reqwest::Client,
    keyword: &str,
    limit: i64,
) -> Result<Vec<Artist>> {
    let kw = keyword.trim();
    if kw.is_empty() {
        return Ok(vec![]);
    }
    let url = format!(
        "https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?format=json&key={}&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0",
        uri_encode(kw)
    );
    let headers = vec![
        ("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36".to_string()),
        // splcloud 域需要 y.qq.com Referer(同推荐歌单实测)
        ("Referer", "https://y.qq.com/".to_string()),
    ];
    let res = fetch_json(client, &url, reqwest::Method::GET, headers, None, 8).await?;
    let items = jget(&res, &["data", "singer", "itemlist"])
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(items
        .iter()
        .take(limit as usize)
        .filter_map(|item| {
            let id = jstr_any(item, &["mid", "singerMid"]);
            let name = jstr_any(item, &["name", "singerName"]);
            if id.is_empty() || name.is_empty() {
                return None;
            }
            let avatar = format!(
                "https://y.qq.com/music/photo_new/T001R300x300M000{id}.jpg?max_age=2592000"
            );
            Some(Artist {
                id,
                source: "qqmusic".into(),
                name,
                avatar_url: Some(avatar),
            })
        })
        .collect())
}

pub async fn qq_search(
    client: &reqwest::Client,
    cookie: &str,
    request: &SearchRequest,
) -> Result<SearchResult> {
    let t = request
        .search_type
        .as_ref()
        .and_then(|v| v.first())
        .map(String::as_str)
        .unwrap_or("track");
    let search_type = match t {
        "album" => 8,
        "artist" => 9,
        "playlist" => 3,
        _ => 0,
    };
    let limit = request.limit.unwrap_or(30);
    let offset = request.offset.unwrap_or(0);
    // 歌手走 smartbox 通道(NexBox 同源;桌面通道歌手列表不全)
    if search_type == 9 {
        let artists = qq_smartbox_artists(client, &request.query, limit).await?;
        let has_more = (artists.len() as i64) >= limit;
        return Ok(SearchResult {
            tracks: vec![],
            albums: vec![],
            artists,
            has_more,
            playlists: vec![],
            total: 0,
            source: "qqmusic".into(),
        });
    }
    // 歌单类型走移动端签名通道(桌面通道不返回歌单,实测见 qq_search_playlists 注释)
    if search_type == 3 {
        let playlists = qq_search_playlists(client, &request.query, limit, offset).await?;
        return Ok(SearchResult {
            tracks: vec![],
            albums: vec![],
            artists: vec![],
            has_more: playlists.len() as i64 >= limit,
            playlists,
            total: 0,
            source: "qqmusic".into(),
        });
    }
    let page = offset / limit + 1;
    let uin = uin_from_cookie(cookie);
    let gtk = gtk_from_cookie(cookie);
    let body = json!({
        "comm": { "ct": 24, "cv": 0, "uin": uin, "format": "json", "inCharset": "utf-8", "outCharset": "utf-8", "notice": 0, "platform": "h5", "needNewCode": 1, "g_tk": gtk, "g_tk_new_20200303": gtk },
        "req_1": {
            "module": "music.search.SearchCgiService",
            "method": "DoSearchForQQMusicDesktop",
            "param": { "query": request.query, "page_num": page, "num_per_page": limit, "search_type": search_type }
        }
    });
    let res = fetch_json(
        client,
        QQ_API,
        reqwest::Method::POST,
        qq_headers(cookie),
        Some(body),
        10,
    )
    .await?;

    let empty = Vec::new();
    let body_v = jget(&res, &["req_1", "data", "body"]).cloned().unwrap_or(Value::Null);
    let songs = jget(&body_v, &["song", "list"])
        .and_then(|v| v.as_array())
        .unwrap_or(&empty)
        .clone();
    let total = jget(&body_v, &["song", "totalnum"])
        .and_then(|v| v.as_i64())
        .unwrap_or(songs.len() as i64);
    let tracks = songs.iter().map(map_qq_track).collect();

    let albums = jget(&body_v, &["album", "list"])
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|a| {
                    let album_mid = jstr_or(a, &["albumMid", "mid"]);
                    Album {
                        id: album_mid.clone(),
                        source: "qqmusic".into(),
                        name: jstr_or(a, &["albumName", "name"]),
                        artist: jstr_or(a, &["singerName"]),
                        cover_url: if album_mid.is_empty() {
                            String::new()
                        } else {
                            format!("https://y.gtimg.cn/music/photo_new/T002R300x300M000{album_mid}.jpg")
                        },
                        tracks: vec![],
                        publish_time: None,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let artists = jget(&body_v, &["singer", "list"])
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|a| Artist {
                    id: jstr_or(a, &["singerMid", "mid"]),
                    source: "qqmusic".into(),
                    name: jstr_or(a, &["singerName", "name"]),
                    avatar_url: Some(jstr(a, "singerPic")),
                })
                .collect()
        })
        .unwrap_or_default();

    let playlists: Vec<Playlist> = vec![];
    Ok(SearchResult {
        tracks,
        albums,
        artists,
        playlists,
        total,
        has_more: songs.len() as i64 >= limit,
        source: "qqmusic".into(),
    })
}

pub async fn qq_get_track(client: &reqwest::Client, cookie: &str, id: &str) -> Result<Track> {
    let song = qq_fetch_song(client, cookie, id).await;
    Ok(map_qq_track(&song))
}

fn quality_prefix(q: &str) -> (&'static str, &'static str, i64) {
    match q {
        "hires" | "lossless" => ("F000", "flac", 999000),
        "high" => ("M800", "mp3", 320000),
        _ => ("M500", "mp3", 128000),
    }
}

fn quality_fallbacks(q: &str) -> Vec<&'static str> {
    match q {
        "hires" => vec!["lossless", "high", "standard"],
        "lossless" => vec!["lossless", "high", "standard"],
        "high" => vec!["high", "standard"],
        "standard" => vec!["standard"],
        _ => vec!["lossless", "high", "standard"],
    }
}

pub async fn qq_resolve_playback(
    client: &reqwest::Client,
    cookie: &str,
    id: &str,
    quality: &str,
) -> Result<PlaybackInfo> {
    let uin = uin_from_cookie(cookie);
    let gtk = gtk_from_cookie(cookie);
    let guid = {
        let pgv = "pgv_pvid=";
        cookie
            .find(pgv)
            .map(|idx| {
                let rest = &cookie[idx + pgv.len()..];
                let end = rest.find(';').unwrap_or(rest.len());
                rest[..end].chars().filter(|c| c.is_ascii_digit()).collect::<String>()
            })
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "10000".into())
    };

    let song = qq_fetch_song(client, cookie, id).await;
    let mid = jstr_or(&song, &["mid"]);
    let song_mid = if mid.is_empty() { id.to_string() } else { mid };
    let media_mid = {
        let file = song.get("file").cloned().unwrap_or(Value::Null);
        let m = jstr_or(&file, &["media_mid", "mediaMid", "strMediaMid"]);
        if m.is_empty() {
            song_mid.clone()
        } else {
            m
        }
    };

    for q in quality_fallbacks(quality) {
        let (prefix, ext, bitrate) = quality_prefix(q);
        let filename = format!("{prefix}{media_mid}.{ext}");

        // Two endpoint generations, mirroring the Electron implementation
        let attempts = [
            (
                "music.vkey.GetVkey",
                "UrlGetVkey",
                true,
                json!({
                    "guid": guid, "songmid": [song_mid], "filename": [filename],
                    "songtype": [0], "uin": uin, "ctx": 0
                }),
                json!({ "uin": uin, "format": "json", "ct": 24, "cv": 4747474, "platform": "yqq.json", "chid": "0", "g_tk": gtk, "g_tk_new_20200303": gtk, "inCharset": "utf-8", "outCharset": "utf-8", "notice": 0, "needNewCode": 1 }),
            ),
            (
                "vkey.GetVkeyServer",
                "CgiGetVkey",
                false,
                json!({
                    "guid": guid, "songmid": [song_mid], "filename": [filename],
                    "songtype": [0], "uin": uin, "loginflag": 1
                }),
                json!({ "uin": uin, "format": "json", "ct": 24, "cv": 0 }),
            ),
        ];

        for (module, method, _modern, param, comm) in attempts {
            let body = json!({
                "req_0": { "module": module, "method": method, "param": param },
                "comm": comm
            });
            if let Ok(res) = fetch_json(
                client,
                QQ_API,
                reqwest::Method::POST,
                qq_headers(cookie),
                Some(body),
                8,
            )
            .await
            {
                let purl = jget(&res, &["req_0", "data", "midurlinfo"])
                    .and_then(|m| m.as_array())
                    .and_then(|a| a.first())
                    .and_then(|item| item.get("purl"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("");
                if purl.is_empty() {
                    continue;
                }
                let url = if purl.starts_with("http") {
                    purl.to_string()
                } else {
                    let sip = jget(&res, &["req_0", "data", "sip"])
                        .and_then(|s| s.as_array())
                        .and_then(|a| a.iter().find(|s| s.as_str().map(|s| !s.is_empty()).unwrap_or(false)))
                        .and_then(|s| s.as_str())
                        .unwrap_or("https://isure.stream.qqmusic.qq.com/");
                    format!("{sip}{purl}")
                };
                return Ok(PlaybackInfo {
                    url,
                    quality: q.into(),
                    format: ext.into(),
                    bitrate,
                    size: 0,
                });
            }
        }
    }
    Err(anyhow::anyhow!("Failed to get playback URL"))
}

pub async fn qq_get_playlist(
    client: &reqwest::Client,
    cookie: &str,
    id: &str,
) -> Result<Playlist> {
    let uin = uin_from_cookie(cookie);
    let gtk = gtk_from_cookie(cookie);

    // "我喜欢":服务端 dirid=201 歌单,走专用 CgiGetDiss 曲目接口
    if id == "liked" {
        let tracks = qq_get_liked_songs(client, cookie).await;
        return Ok(Playlist {
            id: "liked".into(),
            source: "qqmusic".into(),
            name: "我喜欢的音乐".into(),
            description: None,
            cover_url: QQ_LIKED_COVER.into(),
            track_count: tracks.len() as i64,
            creator_name: "QQ音乐".into(),
            creator_id: uin,
            tracks: Some(tracks),
            is_local: None,
        });
    }

    // Toplist shortcut for small numeric IDs
    if let Ok(topid) = id.parse::<i64>() {
        if topid > 0 && topid < 1000 {
            if let Ok(tracks) = qq_get_toplist(client, cookie, topid, 100).await {
                let names = [
                    (26, "飙升榜"),
                    (4, "流行指数榜"),
                    (27, "热歌榜"),
                    (62, "新歌榜"),
                    (67, "抖音排行榜"),
                ];
                let name = names
                    .iter()
                    .find(|(tid, _)| *tid == topid)
                    .map(|(_, n)| n.to_string())
                    .unwrap_or_else(|| format!("QQ音乐榜{topid}"));
                return Ok(Playlist {
                    id: id.into(),
                    source: "qqmusic".into(),
                    name,
                    description: Some(String::new()),
                    cover_url: String::new(),
                    track_count: tracks.len() as i64,
                    creator_name: "QQ音乐".into(),
                    creator_id: uin,
                    tracks: Some(tracks),
                    is_local: None,
                });
            }
        }
    }

    // Regular playlist
    let body = json!({
        "req_0": {
            "module": "music.srfDissInfo.aiDissInfo",
            "method": "uniform_get_Dissinfo",
            "param": { "disstid": id.parse::<i64>().unwrap_or(0), "dirid": 0, "tag": 1, "charset": "utf8", "g_tk": gtk }
        },
        "comm": { "uin": uin, "format": "json", "ct": 24, "cv": 0, "g_tk": gtk }
    });
    if let Ok(res) = fetch_json(client, QQ_API, reqwest::Method::POST, qq_headers(cookie), Some(body), 10).await {
        let dissinfo = jget(&res, &["req_0", "data"]).cloned().unwrap_or(Value::Null);
        let songlist = jget(&dissinfo, &["songlist"])
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        return Ok(Playlist {
            id: id.into(),
            source: "qqmusic".into(),
            name: jget(&dissinfo, &["dirinfo", "title"])
                .and_then(|t| t.as_str())
                .map(String::from)
                .unwrap_or_else(|| "QQ Music Playlist".into()),
            description: Some(jget(&dissinfo, &["dirinfo", "desc"])
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_string()),
            cover_url: jget(&dissinfo, &["dirinfo", "picurl"])
                .and_then(|p| p.as_str())
                .unwrap_or("")
                .to_string(),
            track_count: jget(&dissinfo, &["dirinfo", "songcnt"])
                .and_then(|c| c.as_i64())
                .unwrap_or(songlist.len() as i64),
            creator_name: jget(&dissinfo, &["dirinfo", "nickname"])
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string(),
            creator_id: jget(&dissinfo, &["dirinfo", "uin"])
                .map(|u| u.to_string())
                .unwrap_or_default(),
            tracks: Some(songlist.iter().map(map_qq_track).collect()),
            is_local: None,
        });
    }

    // Legacy fallback(真实 uin/g_tk,与参考实现一致;loginUin=0 时私有歌单拿不到)
    let legacy_uin = if uin.is_empty() { "0".into() } else { uin.clone() };
    let url = format!(
        "{QQ_LEGACY}/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid={id}&song_begin=0&song_num=500&format=json&g_tk={gtk}&loginUin={legacy_uin}"
    );
    if let Ok(res) = fetch_json(client, &url, reqwest::Method::GET, qq_headers(cookie), None, 10).await {
        let cd = jget(&res, &["cdlist"])
            .and_then(|c| c.as_array())
            .and_then(|a| a.first())
            .cloned()
            .unwrap_or(Value::Null);
        let songlist = jget(&cd, &["songlist"])
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        return Ok(Playlist {
            id: id.into(),
            source: "qqmusic".into(),
            name: jget(&cd, &["dissname"])
                .and_then(|n| n.as_str())
                .map(String::from)
                .unwrap_or_else(|| "QQ Music Playlist".into()),
            description: Some(jstr(&cd, "desc")),
            cover_url: jstr(&cd, "logo"),
            track_count: ji64(&cd, &["total_song_num"]),
            creator_name: jstr(&cd, "nickname"),
            creator_id: jget(&cd, &["uin"]).map(|u| u.to_string()).unwrap_or_default(),
            tracks: Some(songlist.iter().map(map_qq_track).collect()),
            is_local: None,
        });
    }

    Ok(Playlist {
        id: id.into(),
        source: "qqmusic".into(),
        name: "QQ Music Playlist".into(),
        description: Some(String::new()),
        cover_url: String::new(),
        track_count: 0,
        creator_name: String::new(),
        creator_id: String::new(),
        tracks: Some(vec![]),
        is_local: None,
    })
}

pub async fn qq_get_user_playlists(
    client: &reqwest::Client,
    cookie: &str,
    user_id: &str,
) -> Vec<Playlist> {
    let uin = if user_id.is_empty() {
        uin_from_cookie(cookie)
    } else {
        user_id.to_string()
    };
    if uin.is_empty() || uin == "0" {
        return vec![];
    }

    // 自建歌单:rsc/fcg_user_created_diss(专用端点,分页,data.disslist)
    let mut rows: Vec<Value> = vec![];
    for page in 0..QQ_SYNC_MAX_PAGES {
        let sin = page * QQ_SYNC_PAGE_SIZE;
        let url = format!(
            "{QQ_LEGACY}/rsc/fcgi-bin/fcg_user_created_diss?hostuin={uin}&sin={sin}&size={QQ_SYNC_PAGE_SIZE}&g_tk=5381&loginUin={uin}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0"
        );
        match fetch_json(
            client,
            &url,
            reqwest::Method::GET,
            qq_headers_referer(cookie, QQ_PROFILE_REFERER),
            None,
            10,
        )
        .await
        {
            Ok(body) => {
                let page_rows = jget(&body, &["data", "disslist"])
                    .or_else(|| jget(&body, &["data", "cdlist"]))
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let len = page_rows.len();
                rows.extend(page_rows);
                if len < QQ_SYNC_PAGE_SIZE {
                    break;
                }
            }
            Err(e) => {
                eprintln!("[QQPlaylist] created page {page} failed: {e}");
                break;
            }
        }
    }

    // 平铺列表:dirid=201 的"我喜欢"行是服务端原生数据,保真映射(id 归一化
    // 为 "liked" 供详情路由),其余按普通行映射。不再插入任何合成卡片。
    let mut results: Vec<Playlist> = rows
        .iter()
        .map(|r| {
            if is_qq_liked_row(r) {
                map_qq_liked_row(r, &uin)
            } else {
                map_qq_playlist_row(r)
            }
        })
        .filter(|p| !p.id.is_empty() && p.id != "0" && !p.name.is_empty())
        .collect();

    let mut seen = std::collections::HashSet::new();
    results.retain(|p| !p.id.is_empty() && seen.insert(p.id.clone()));
    results
}

// QQ 收藏歌单:与参考实现同端的 reqtype=3(cid=205360956/ct=20/userid,分页);
// 旧版返回为空时降级 musicu PlaylistBaseRead/GetPlaylistByUin(reqtype=2)。
pub async fn qq_get_collected_playlists(
    client: &reqwest::Client,
    cookie: &str,
    user_id: &str,
) -> Vec<Playlist> {
    let uin = if user_id.is_empty() {
        uin_from_cookie(cookie)
    } else {
        user_id.to_string()
    };
    if uin.is_empty() || uin == "0" {
        return vec![];
    }
    let gtk = gtk_from_cookie(cookie);

    let mut rows: Vec<Value> = vec![];
    for page in 0..QQ_SYNC_MAX_PAGES {
        let sin = page * QQ_SYNC_PAGE_SIZE;
        let ein = sin + QQ_SYNC_PAGE_SIZE - 1;
        let url = format!(
            "{QQ_LEGACY}/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?ct=20&cid=205360956&userid={uin}&reqtype=3&sin={sin}&ein={ein}&g_tk={gtk}"
        );
        match fetch_json(
            client,
            &url,
            reqwest::Method::GET,
            qq_headers_referer(cookie, QQ_PROFILE_REFERER),
            None,
            10,
        )
        .await
        {
            Ok(body) => {
                let page_rows = jget(&body, &["data", "cdlist"])
                    .or_else(|| jget(&body, &["data", "v_playlist"]))
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let len = page_rows.len();
                rows.extend(page_rows);
                if len < QQ_SYNC_PAGE_SIZE {
                    break;
                }
            }
            Err(e) => {
                eprintln!("[QQPlaylist] collected legacy page {page} failed: {e}");
                break;
            }
        }
    }

    // 降级:musicu GetPlaylistByUin,qm_keyst 作 authst
    if rows.is_empty() {
        let qm_keyst = cookie_value(cookie, "qm_keyst");
        for page in 0..QQ_SYNC_MAX_PAGES {
            let comm = if !qm_keyst.is_empty() {
                json!({ "uin": uin, "format": "json", "ct": 19, "cv": 0, "authst": qm_keyst })
            } else {
                json!({ "ct": 24, "cv": 0, "format": "json" })
            };
            let payload = json!({
                "comm": comm,
                "req_0": {
                    "module": "music.musicasset.PlaylistBaseRead",
                    "method": "GetPlaylistByUin",
                    "param": {
                        "hostUin": uin,
                        "reqtype": 2,
                        "page": page + 1,
                        "size": QQ_SYNC_PAGE_SIZE,
                        "order": 5
                    }
                }
            });
            match fetch_json(client, QQ_API, reqwest::Method::POST, qq_headers(cookie), Some(payload), 10).await {
                Ok(json) => {
                    let req0 = jget(&json, &["req_0"]).cloned().unwrap_or(Value::Null);
                    let code = req0.get("code").and_then(|v| v.as_i64()).unwrap_or(0);
                    if code != 0 {
                        break;
                    }
                    let page_rows = jget(&req0, &["data", "cdlist"])
                        .or_else(|| jget(&req0, &["data", "playlist"]))
                        .or_else(|| jget(&req0, &["data", "disslist"]))
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let len = page_rows.len();
                    rows.extend(page_rows);
                    if len < QQ_SYNC_PAGE_SIZE {
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("[QQPlaylist] collected musicu page {page} failed: {e}");
                    break;
                }
            }
        }
    }

    let mut results: Vec<Playlist> = rows
        .iter()
        .filter(|r| !is_qq_liked_row(r))
        .map(map_qq_playlist_row)
        .filter(|p| !p.id.is_empty() && p.id != "0" && !p.name.is_empty())
        .collect();
    let mut seen = std::collections::HashSet::new();
    results.retain(|p| !p.id.is_empty() && seen.insert(p.id.clone()));
    results
}

// ---------- QQ 歌单行映射 / 我喜欢(参考 NexBox 的字段兼容映射) ----------

// dirid=201 即"我喜欢"专用歌单
fn is_qq_liked_row(row: &Value) -> bool {
    let dirid = jget(row, &["dirid", "dir_id", "dirId"])
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    if dirid == QQ_LIKED_DIRID {
        return true;
    }
    let id = jstr_or(row, &["id", "dissid"]).to_lowercase();
    id == "liked" || id == "qq-liked" || id == "201"
}

// 我喜欢行:保真透出服务端数据;id 归一化 "liked"。封面一律使用官方
// 素材(服务端该行自带的封面 URL 时常不完整),缺名兜底
fn map_qq_liked_row(row: &Value, uin: &str) -> Playlist {
    let mut p = map_qq_playlist_row(row);
    p.id = "liked".into();
    if p.name.is_empty() {
        p.name = "我喜欢的音乐".into();
    }
    p.cover_url = QQ_LIKED_COVER.into();
    p.creator_id = uin.to_string();
    p
}

// 字段多态映射:不同端点返回 disstid/dissname/logo/song_cnt 等拼写差异
fn map_qq_playlist_row(row: &Value) -> Playlist {
    let id = {
        let s = jstr_or(row, &["dissid", "disstid", "tid", "id", "diss_id"]);
        if !s.is_empty() {
            s
        } else {
            let n = ji64(row, &["dissid", "disstid", "tid", "dirid", "id", "diss_id"]);
            if n != 0 { n.to_string() } else { String::new() }
        }
    };
    let creator_name = {
        let s = jstr_or(row, &["hostname", "nick", "nickname", "creator"]);
        if !s.is_empty() {
            s
        } else {
            jget(row, &["creator"])
                .and_then(|c| c.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string()
        }
    };
    Playlist {
        id,
        source: "qqmusic".into(),
        name: decode_hex_text(jstr_or(row, &["diss_name", "dissname", "name", "title"])),
        description: Some(jstr_or(row, &["desc", "msg"])),
        cover_url: decode_hex_text(jstr_or(
            row,
            &["diss_cover", "dissCover", "logo", "picurl", "cover"],
        )),
        track_count: ji64(
            row,
            &[
                "song_cnt",
                "songCnt",
                "songnum",
                "songNum",
                "total_song_num",
                "song_count",
                "songCount",
            ],
        ),
        creator_name,
        creator_id: {
            let u = jget(row, &["uin"]);
            match u {
                Some(Value::Number(n)) => n.to_string(),
                _ => String::new(),
            }
        },
        tracks: None,
        is_local: None,
    }
}

// QQ 创建歌单的名字常被 hex 编码(e4b8ad… → 中文)
fn decode_hex_text(raw: String) -> String {
    let t = raw.trim();
    if t.len() >= 4 && t.len() % 2 == 0 && t.chars().all(|c| c.is_ascii_hexdigit()) {
        let bytes: Result<Vec<u8>, _> = (0..t.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&t[i..i + 2], 16))
            .collect();
        if let Ok(bytes) = bytes {
            if let Ok(s) = String::from_utf8(bytes) {
                let trimmed = s.trim().to_string();
                if !trimmed.is_empty() && trimmed.chars().any(|c| !c.is_ascii()) {
                    return trimmed;
                }
            }
        }
    }
    raw
}

// 我喜欢的曲目(CgiGetDiss dirid=201,分页拉取)
pub async fn qq_get_liked_songs(client: &reqwest::Client, cookie: &str) -> Vec<Track> {
    if uin_from_cookie(cookie).is_empty() || uin_from_cookie(cookie) == "0" {
        return vec![];
    }
    let mut out: Vec<Track> = vec![];
    for page in 0..QQ_LIKED_PAGES {
        let begin = page * 100;
        let payload = json!({
            "comm": { "ct": 24, "cv": 0 },
            "req_0": {
                "module": "music.srfDissInfo.DissInfo",
                "method": "CgiGetDiss",
                "param": {
                    "disstid": 0,
                    "dirid": QQ_LIKED_DIRID,
                    "tag": 1,
                    "song_begin": begin,
                    "song_num": 100,
                    "userinfo": 1,
                    "orderlist": 1
                }
            }
        });
        match fetch_json(client, QQ_API, reqwest::Method::POST, qq_headers(cookie), Some(payload), 10).await {
            Ok(json) => {
                let data = jget(&json, &["req_0", "data"]).cloned().unwrap_or(Value::Null);
                let rows = jget(&data, &["songlist"])
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let got = rows.len();
                for r in &rows {
                    let t = map_qq_track_lenient(r);
                    if !t.name.is_empty() && !t.id.is_empty() {
                        out.push(t);
                    }
                }
                let total = ji64(&data, &["total_song_num"]);
                if got < 100 || (total > 0 && begin as i64 + got as i64 >= total) {
                    break;
                }
            }
            Err(e) => {
                eprintln!("[QQLiked] tracks page {page} failed: {e}");
                break;
            }
        }
    }
    out
}

pub async fn qq_get_album(client: &reqwest::Client, cookie: &str, id: &str) -> Result<Album> {
    let url = format!("{QQ_LEGACY}/v8/fcg-bin/fcg_v8_album_info_cp.fcg?albummid={id}&format=json&newsong=1");
    let res = fetch_json(client, &url, reqwest::Method::GET, qq_headers(cookie), None, 8).await?;
    let songlist = jget(&res, &["data", "list"])
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(Album {
        id: id.into(),
        source: "qqmusic".into(),
        name: jget(&res, &["data", "name"])
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string(),
        artist: jget(&res, &["data", "singername"])
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string(),
        cover_url: format!("https://y.gtimg.cn/music/photo_new/T002R300x300M000{id}.jpg"),
        tracks: songlist.iter().map(map_qq_track).collect(),
        publish_time: None,
    })
}

pub async fn qq_get_toplist(
    client: &reqwest::Client,
    _cookie: &str, // 榜单走匿名取法(NexBox 实测),登录态不影响结果
    topid: i64,
    limit: i64,
) -> Result<Vec<Track>> {
    let limit = if limit < 1 { 1 } else { limit };

    // 策略 1(NexBox 实测可用): legacy CGI,全匿名参数、不带日期(服务端直接给当前期)
    let url = format!(
        "{QQ_LEGACY}/v8/fcg-bin/fcg_v8_toplist_cp.fcg?g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0&type=top&topid={topid}&format=json&tpl=3&page=detail&song_begin=0&song_num={limit}"
    );
    if let Ok(res) = fetch_json(client, &url, reqwest::Method::GET, qq_headers(""), None, 10).await {
        let songlist = jget(&res, &["songlist"])
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if !songlist.is_empty() {
            return Ok(songlist
                .iter()
                .map(|s| map_qq_track_lenient(&s.get("songinfo").or_else(|| s.get("data")).unwrap_or(s)))
                .take(limit as usize)
                .collect());
        }
    }

    // 策略 2(NexBox 实测可用): musicu 匿名 GetDetail(musicToplist.ToplistInfoServer, ct:24)
    let body = json!({
        "comm": { "uin": "0", "format": "json", "ct": 24, "cv": 0 },
        "req_0": {
            "module": "musicToplist.ToplistInfoServer",
            "method": "GetDetail",
            "param": { "topId": topid, "offset": 0, "num": limit }
        }
    });
    if let Ok(res) = fetch_json(client, QQ_API, reqwest::Method::POST, qq_headers(""), Some(body), 10).await {
        let songs = jget(&res, &["req_0", "data", "data", "songInfoList"])
            .or_else(|| jget(&res, &["req_0", "data", "data", "song", "songInfoList"]))
            .or_else(|| jget(&res, &["req_0", "data", "data", "song"]))
            .or_else(|| jget(&res, &["req_0", "data", "songInfoList"]))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if !songs.is_empty() {
            return Ok(songs
                .iter()
                .map(|item| map_qq_track(&item.get("songInfo").unwrap_or(item)))
                .filter(|t| !t.name.is_empty())
                .take(limit as usize)
                .collect());
        }
    }
    Ok(vec![])
}

// 网易云歌手歌曲(分页):优先 /api/v1/artist/{id}/songs(limit/offset/order=hot);
// 空则回退 top/song;仍空且 offset=0 才用 /api/artist/{id}(hotSongs 首页,不可偏移)
pub async fn netease_get_artist_songs(
    client: &reqwest::Client,
    cookie: &str,
    artist_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<Track>> {
    let url = format!(
        "{NETEASE_API}/api/v1/artist/{artist_id}/songs?limit={limit}&offset={offset}&order=hot"
    );
    let mut tracks: Vec<Track> = match fetch_json(client, &url, reqwest::Method::GET, netease_headers(cookie), None, 8).await {
        Ok(res) => jget(&res, &["songs"])
            .or_else(|| jget(&res, &["data", "songs"]))
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().map(map_netease_track).filter(|t| !t.name.is_empty()).collect())
            .unwrap_or_default(),
        Err(_) => vec![],
    };
    if tracks.is_empty() {
        let fb_url = format!(
            "{NETEASE_API}/api/artist/top/song?id={artist_id}&limit={limit}&offset={offset}"
        );
        if let Ok(fb) = fetch_json(client, &fb_url, reqwest::Method::GET, netease_headers(cookie), None, 8).await {
            tracks = jget(&fb, &["songs"])
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().map(map_netease_track).filter(|t| !t.name.is_empty()).collect())
                .unwrap_or_default();
        }
    }
    if tracks.is_empty() && offset == 0 {
        let url = format!("{NETEASE_API}/api/artist/{artist_id}");
        if let Ok(res) = fetch_json(client, &url, reqwest::Method::GET, netease_headers(cookie), None, 8).await {
            tracks = jget(&res, &["hotSongs"])
                .or_else(|| jget(&res, &["artist", "hotSongs"]))
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().map(map_netease_track).filter(|t| !t.name.is_empty()).collect())
                .unwrap_or_default();
        }
    }
    Ok(tracks)
}

// QQ 歌手歌曲(分页): musicu 匿名 get_singer_detail_info(sort=5 热度,sin 偏移)
pub async fn qq_get_artist_songs(
    client: &reqwest::Client,
    cookie: &str,
    artist_mid: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<Track>> {
    let mid = artist_mid.trim();
    if mid.is_empty() {
        return Ok(vec![]);
    }
    let body = json!({
        "comm": { "ct": 24, "cv": 0, "uin": "0", "format": "json" },
        "req_0": {
            "module": "music.web_singer_info_svr",
            "method": "get_singer_detail_info",
            "param": { "sort": 5, "singermid": mid, "sin": offset, "num": limit.clamp(10, 80) }
        }
    });
    let res = fetch_json(client, QQ_API, reqwest::Method::POST, qq_headers(cookie), Some(body), 10).await?;
    let songs = jget(&res, &["req_0", "data", "songlist"])
        .or_else(|| jget(&res, &["singer", "data", "songlist"]))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(songs
        .iter()
        .filter_map(|row| {
            let track = row
                .get("trackInfo")
                .or_else(|| row.get("track_info"))
                .or_else(|| row.get("songInfo"))
                .unwrap_or(row);
            let t = map_qq_track_lenient(track);
            if t.name.is_empty() || t.id.is_empty() {
                None
            } else {
                Some(t)
            }
        })
        .take(limit as usize)
        .collect())
}

// 歌手歌曲分发(按平台取 cookie)
pub async fn get_artist_songs(
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    source: &str,
    artist_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<Track>> {
    let cookie = cookies.get(source).map(String::as_str).unwrap_or("");
    match source {
        "netease" => netease_get_artist_songs(client, cookie, artist_id, limit, offset).await,
        "qqmusic" => qq_get_artist_songs(client, cookie, artist_id, limit, offset).await,
        _ => Err(anyhow::anyhow!("unknown source")),
    }
}

// ---------- Lyrics ----------

pub fn parse_lrc(lrc_text: &str) -> Vec<LyricsLine> {
    let re = regex::Regex::new(r"\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)").unwrap();
    let mut lines: Vec<LyricsLine> = Vec::new();
    for cap in re.captures_iter(lrc_text) {
        let minutes: i64 = cap[1].parse().unwrap_or(0);
        let seconds: i64 = cap[2].parse().unwrap_or(0);
        let ms_raw = &cap[3];
        let ms: i64 = ms_raw.parse().unwrap_or(0) * if ms_raw.len() == 2 { 10 } else { 1 };
        let text = cap[4].trim().to_string();
        if !text.is_empty() {
            lines.push(LyricsLine {
                time: minutes * 60000 + seconds * 1000 + ms,
                text,
                translation: None,
            });
        }
    }
    lines.sort_by_key(|l| l.time);
    lines
}

fn maybe_decode_base64(s: &str) -> String {
    if s.is_empty() {
        return String::new();
    }
    if s.chars().any(|c| (c as u32) >= 0x2E80) {
        return s.to_string();
    }
    if s.contains('[') && s.contains(':') {
        return s.to_string();
    }
    if s.len() % 4 != 0 {
        return s.to_string();
    }
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .ok()
        .and_then(|b| String::from_utf8(b).ok())
        .unwrap_or_else(|| s.to_string())
}

fn attach_translations(lines: &mut [LyricsLine], trans_text: &str) {
    let translations = parse_lrc(trans_text);
    for line in lines.iter_mut() {
        if let Some(t) = translations.iter().find(|t| (t.time - line.time).abs() < 100) {
            line.translation = Some(t.text.clone());
        }
    }
}

pub async fn netease_get_lyrics(
    client: &reqwest::Client,
    request: &LyricsRequest,
) -> Option<Lyrics> {
    let mut track_id = request.track_id.clone();
    if track_id.is_empty() || track_id == "0" {
        let q = uri_encode(&format!("{} {}", request.track_name, request.artist_name));
        let url = format!("{NETEASE_API}/api/search/get/web?type=1&s={q}&limit=5&offset=0");
        let res = fetch_json(
            client,
            &url,
            reqwest::Method::GET,
            netease_headers(""),
            None,
            8,
        )
        .await
        .ok()?;
        let id = jget(&res, &["result", "songs"])
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|s| s.get("id"))
            .map(|i| i.to_string())?;
        track_id = id;
    }

    let url = format!("{NETEASE_API}/api/song/lyric?id={track_id}&lv=1&kv=1&tv=1&rv=1");
    let res = fetch_json(
        client,
        &url,
        reqwest::Method::GET,
        netease_headers(""),
        None,
        8,
    )
    .await
    .ok()?;

    let raw = jget(&res, &["lrc", "lyric"])
        .and_then(|l| l.as_str())
        .map(String::from)?;
    let mut lines = parse_lrc(&raw);
    if let Some(tlyric) = jget(&res, &["tlyric", "lyric"]).and_then(|l| l.as_str()) {
        attach_translations(&mut lines, tlyric);
    }
    Some(Lyrics {
        source: "netease".into(),
        lines,
        raw_lrc: Some(raw),
    })
}

pub async fn qq_get_lyrics(client: &reqwest::Client, request: &LyricsRequest) -> Option<Lyrics> {
    let songmid = &request.track_id;
    let ts = crate::net::now_ms();
    let url = format!(
        "{QQ_LEGACY}/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid={songmid}&pcachetime={ts}&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&nobase64=1"
    );
    let raw = fetch_text(client, &url, qq_headers(""), 8).await.ok()?;
    let trimmed = raw.trim();
    let json_str = if trimmed.starts_with('{') {
        trimmed
    } else if let (Some(s), Some(e)) = (trimmed.find('('), trimmed.rfind(')')) {
        &trimmed[s + 1..e]
    } else {
        trimmed
    };
    let res: Value = serde_json::from_str(json_str.trim().trim_end_matches(';')).ok()?;

    let lyric = res.get("lyric").and_then(|l| l.as_str())?;
    let lyric_text = maybe_decode_base64(lyric);
    let mut lines = parse_lrc(&lyric_text);
    if let Some(trans) = res.get("trans").and_then(|t| t.as_str()) {
        let trans_text = maybe_decode_base64(trans);
        attach_translations(&mut lines, &trans_text);
    }
    Some(Lyrics {
        source: "qqmusic".into(),
        lines,
        raw_lrc: Some(lyric_text),
    })
}

// ---------- Dispatch helpers ----------

// 搜索结果去重:平台曲库常把同一首歌放进多个发行(单曲/Special Edition/精选集),
// 各条目拥有独立歌曲 ID 但歌名+歌手完全相同;展示上只保留相关性排位最高的第一条
fn dedupe_tracks(tracks: Vec<Track>) -> Vec<Track> {
    let mut seen = std::collections::HashSet::new();
    tracks
        .into_iter()
        .filter(|t| {
            let key = format!(
                "{}|{}",
                t.name.trim().to_lowercase(),
                t.artists.join(",").trim().to_lowercase()
            );
            seen.insert(key)
        })
        .collect()
}

pub async fn search(
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    request: &SearchRequest,
) -> SearchResult {
    let cookie = cookies.get(&request.source).map(String::as_str).unwrap_or("");
    let result = match request.source.as_str() {
        "netease" => netease_search(client, cookie, request).await,
        "qqmusic" => qq_search(client, cookie, request).await,
        _ => Err(anyhow::anyhow!("unknown source")),
    };
    match result {
        // 各平台内同名同歌手去重(不同平台间同名互不影响)
        Ok(r) => SearchResult { tracks: dedupe_tracks(r.tracks), ..r },
        Err(_) => SearchResult {
            tracks: vec![],
            albums: vec![],
            artists: vec![],
            playlists: vec![],
            total: 0,
            has_more: false,
            source: request.source.clone(),
        },
    }
}

pub async fn get_track(
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    source: &str,
    id: &str,
) -> Result<Track> {
    let cookie = cookies.get(source).map(String::as_str).unwrap_or("");
    match source {
        "netease" => netease_get_track(client, cookie, id).await,
        "qqmusic" => qq_get_track(client, cookie, id).await,
        _ => Err(anyhow::anyhow!("unknown source")),
    }
}

pub async fn resolve_playback(
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    source: &str,
    id: &str,
    quality: &str,
) -> Result<PlaybackInfo> {
    let cookie = cookies.get(source).map(String::as_str).unwrap_or("");
    match source {
        "netease" => netease_resolve_playback(client, cookie, id, quality).await,
        "qqmusic" => qq_resolve_playback(client, cookie, id, quality).await,
        _ => Err(anyhow::anyhow!("unknown source")),
    }
}

pub async fn get_playlist(
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    source: &str,
    id: &str,
) -> Result<Playlist> {
    let cookie = cookies.get(source).map(String::as_str).unwrap_or("");
    match source {
        "netease" => netease_get_playlist(client, cookie, id).await,
        "qqmusic" => qq_get_playlist(client, cookie, id).await,
        _ => Err(anyhow::anyhow!("unknown source")),
    }
}

pub async fn get_user_playlists(
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    source: &str,
    user_id: &str,
) -> Vec<Playlist> {
    let cookie = cookies.get(source).map(String::as_str).unwrap_or("");
    match source {
        "netease" => netease_get_user_playlists(client, cookie, user_id)
            .await
            .unwrap_or_default(),
        "qqmusic" => qq_get_user_playlists(client, cookie, user_id).await,
        _ => vec![],
    }
}

// 收藏歌单:QQ 有独立目录;网易云的自建/收藏混合在 user playlists 里,由前端按 creatorId 分组
pub async fn get_collected_playlists(
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    source: &str,
    user_id: &str,
) -> Result<Vec<Playlist>> {
    let cookie = cookies.get(source).map(String::as_str).unwrap_or("");
    match source {
        "qqmusic" => Ok(qq_get_collected_playlists(client, cookie, user_id).await),
        _ => Ok(vec![]),
    }
}

pub async fn get_album(
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    source: &str,
    id: &str,
) -> Result<Album> {
    let cookie = cookies.get(source).map(String::as_str).unwrap_or("");
    match source {
        "netease" => netease_get_album(client, cookie, id).await,
        "qqmusic" => qq_get_album(client, cookie, id).await,
        _ => Err(anyhow::anyhow!("unknown source")),
    }
}

pub async fn get_toplist(
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    source: &str,
    topid: i64,
    limit: i64,
) -> Vec<Track> {
    let cookie = cookies.get(source).map(String::as_str).unwrap_or("");
    match source {
        "qqmusic" => qq_get_toplist(client, cookie, topid, limit).await.unwrap_or_default(),
        _ => vec![],
    }
}

pub async fn get_lyrics(
    client: &reqwest::Client,
    request: &LyricsRequest,
) -> Option<Lyrics> {
    let primary = match request.source.as_str() {
        "netease" => netease_get_lyrics(client, request).await,
        "qqmusic" => qq_get_lyrics(client, request).await,
        _ => None,
    };
    if primary.is_some() {
        return primary;
    }
    let fallback_source = if request.source == "netease" {
        "qqmusic"
    } else {
        "netease"
    };
    let mut req2 = request.clone();
    req2.source = fallback_source.into();
    match fallback_source {
        "netease" => netease_get_lyrics(client, &req2).await,
        "qqmusic" => qq_get_lyrics(client, &req2).await,
        _ => None,
    }
}

fn uri_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

#[cfg(test)]
mod playlist_search_tests {
    use super::*;

    #[test]
    fn qq_playlist_search_real() {
        let client = crate::net::new_client();
        let res = tauri::async_runtime::block_on(async {
            qq_search_playlists(&client, "日系伤感", 30, 0).await
        });
        let list = res.expect("qq_search_playlists 应成功");
        assert!(!list.is_empty(), "QQ 歌单搜索应返回条目, 实际 0 条");
        eprintln!("items={} first={:?} cover={:?} count={:?}",
            list.len(), list[0].name, list[0].cover_url, list[0].track_count);
    }

    #[test]
    fn qq_hot_playlists_real() {
        let client = crate::net::new_client();
        let list = tauri::async_runtime::block_on(async {
            qq_hot_playlists(&client, 12).await
        }).expect("qq_hot_playlists 应成功");
        assert!(!list.is_empty(), "QQ 推荐歌单为空");
        eprintln!("[qq_hot] count={}", list.len());
        for p in list.iter().take(5) {
            eprintln!("[qq_hot] {:?} | count={:?} | creator={:?} | cover={}",
                p.name, p.track_count, p.creator_name, p.cover_url);
        }
    }
}
