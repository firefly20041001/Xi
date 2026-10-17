// Streaming + lyrics + daily recommend providers, ported from the
// Electron main process (NetEase/QQ plain web APIs with cookie auth).
use crate::net::{
    fetch_json, fetch_text, gtk_from_cookie, jget, ji64, jstr, jstr_or, netease_headers,
    qq_headers, uin_from_cookie,
};
use crate::types::*;
use anyhow::Result;
use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;

const NETEASE_API: &str = "https://music.163.com";
const QQ_API: &str = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const QQ_LEGACY: &str = "https://c.y.qq.com";

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
    let url = format!("{NETEASE_API}/api/v6/playlist/detail?id={id}");
    let res = fetch_json(
        client,
        &url,
        reqwest::Method::GET,
        netease_headers(cookie),
        None,
        8,
    )
    .await?;
    let pl = jget(&res, &["playlist"]).ok_or_else(|| anyhow::anyhow!("Playlist not found"))?;

    // Full track list via the track-all endpoint
    let mut tracks = Vec::new();
    if let Ok(tr) = fetch_json(
        client,
        &format!("{NETEASE_API}/api/playlist/track/all?id={id}&limit=200&offset=0"),
        reqwest::Method::GET,
        netease_headers(cookie),
        None,
        8,
    )
    .await
    {
        if let Some(songs) = jget(&tr, &["songs"]).and_then(|v| v.as_array()) {
            tracks = songs.iter().map(map_netease_track).collect();
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
    let url = format!("{NETEASE_API}/api/user/playlist?uid={user_id}&limit=1000&offset=0&includeVideo=true");
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
    Ok(jget(&res, &["playlist"])
        .and_then(|v| v.as_array())
        .unwrap_or(&empty)
        .iter()
        .map(|pl| Playlist {
            id: pl
                .get("id")
                .map(|i| i.to_string())
                .unwrap_or_default(),
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
            tracks: None,
            is_local: None,
        })
        .collect())
}

pub async fn netease_get_liked_songs(
    client: &reqwest::Client,
    cookie: &str,
    user_id: &str,
) -> Vec<Track> {
    let url = format!("{NETEASE_API}/api/song/like/get?uid={user_id}");
    match fetch_json(
        client,
        &url,
        reqwest::Method::GET,
        netease_headers(cookie),
        None,
        8,
    )
    .await
    {
        Ok(res) => jget(&res, &["ids"])
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|id| Track {
                        id: id.to_string(),
                        source: "netease".into(),
                        name: String::new(),
                        artists: vec![],
                        album_name: String::new(),
                        album_id: String::new(),
                        album_cover_url: String::new(),
                        duration: 0,
                        quality: None,
                        vip: None,
                        mapped_track_id: None,
                        mapped_source: None,
                    })
                    .collect()
            })
            .unwrap_or_default(),
        Err(_) => vec![],
    }
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

pub async fn netease_daily_recommend(client: &reqwest::Client, cookie: &str) -> Vec<Track> {
    if cookie.is_empty() {
        return vec![];
    }
    match fetch_json(
        client,
        "https://music.163.com/api/v3/discovery/recommend/songs",
        reqwest::Method::GET,
        netease_headers(cookie),
        None,
        10,
    )
    .await
    {
        Ok(res) => {
            let songs = jget(&res, &["data", "dailySongs"])
                .or_else(|| jget(&res, &["recommend"]))
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            songs.iter().map(map_netease_track).collect()
        }
        Err(_) => vec![],
    }
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

    // Legacy fallback
    let url = format!("{QQ_LEGACY}/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid={id}&format=json&g_tk=5381&loginUin=0");
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
    let gtk = gtk_from_cookie(cookie);
    let mut results: Vec<Playlist> = vec![];

    let url = format!(
        "{QQ_LEGACY}/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?loginUin={uin}&hostUin={uin}&cid=205360772&reqtype=2&sin=0&ein=49&format=json&g_tk={gtk}"
    );
    if let Ok(res) = fetch_json(client, &url, reqwest::Method::GET, qq_headers(cookie), None, 10).await {
        if let Some(cdlist) = jget(&res, &["data", "cdlist"]).and_then(|v| v.as_array()) {
            for cd in cdlist {
                results.push(Playlist {
                    id: jstr_or(cd, &["disstid", "dissid"]),
                    source: "qqmusic".into(),
                    name: jstr_or(cd, &["dissname", "title"]),
                    description: Some(jstr(cd, "desc")),
                    cover_url: jstr_or(cd, &["logo", "picurl"]),
                    track_count: ji64(cd, &["song_cnt", "total_song_num"]),
                    creator_name: jstr(cd, "nickname"),
                    creator_id: jget(cd, &["uin"])
                        .map(|u| u.to_string())
                        .unwrap_or_else(|| uin.clone()),
                    tracks: None,
                    is_local: None,
                });
            }
        }
    }

    results.insert(
        0,
        Playlist {
            id: "qq_toplist_26".into(),
            source: "qqmusic".into(),
            name: "QQ音乐飙升榜".into(),
            description: Some("QQ音乐热门歌曲排行榜".into()),
            cover_url: String::new(),
            track_count: 50,
            creator_name: "QQ音乐".into(),
            creator_id: uin,
            tracks: None,
            is_local: None,
        },
    );
    results
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
    cookie: &str,
    topid: i64,
    limit: i64,
) -> Result<Vec<Track>> {
    let uin = uin_from_cookie(cookie);
    let gtk = gtk_from_cookie(cookie);

    let url = format!(
        "{QQ_LEGACY}/v8/fcg-bin/fcg_v8_toplist_cp.fcg?tpl=3&page=detail&date=2024-01-01&topid={topid}&type=top&song_begin=0&song_num={limit}&g_tk={gtk}&loginUin={uin}&format=json"
    );
    if let Ok(res) = fetch_json(client, &url, reqwest::Method::GET, qq_headers(cookie), None, 10).await
    {
        let songlist = jget(&res, &["songlist"])
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if !songlist.is_empty() {
            return Ok(songlist
                .iter()
                .map(|s| map_qq_track_lenient(&s.get("songinfo").or_else(|| s.get("data")).unwrap_or(s)))
                .collect());
        }
    }

    let body = json!({
        "req_0": {
            "module": "music.srfToplist.Toplist",
            "method": "GetDetail",
            "param": { "topid": topid, "offset": 0, "num": limit, "period": "" }
        },
        "comm": { "uin": uin, "format": "json", "ct": 24, "cv": 0, "g_tk": gtk }
    });
    if let Ok(res) = fetch_json(client, QQ_API, reqwest::Method::POST, qq_headers(cookie), Some(body), 10).await {
        let songlist = jget(&res, &["req_0", "data", "songInfoList"])
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if !songlist.is_empty() {
            return Ok(songlist.iter().map(map_qq_track).collect());
        }
    }
    Ok(vec![])
}

pub async fn qq_daily_recommend(client: &reqwest::Client, cookie: &str) -> Vec<Track> {
    if cookie.is_empty() {
        return vec![];
    }
    let uin = uin_from_cookie(cookie);
    let gtk = gtk_from_cookie(cookie);

    // Method 1: daily recommend API
    let body = json!({
        "comm": { "ct": 24, "cv": 0, "uin": format!("o{uin}"), "g_tk": gtk, "format": "json", "inCharset": "utf-8", "outCharset": "utf-8", "notice": 0, "platform": "h5", "needNewCode": 1 },
        "req_0": {
            "module": "music.musichallComm.PlayLogicComm",
            "method": "GetDailyRecommend",
            "param": { "uin": format!("o{uin}") }
        }
    });
    if let Ok(res) = fetch_json(client, QQ_API, reqwest::Method::POST, qq_headers(cookie), Some(body), 10).await {
        let songs = jget(&res, &["req_0", "data", "songlist"])
            .or_else(|| jget(&res, &["req_0", "data", "songs"]))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if !songs.is_empty() {
            return songs.iter().map(map_qq_track_lenient).collect();
        }
    }

    // Method 2: popular playlist
    let url = format!("{QQ_LEGACY}/v8/fcg-bin/fcg_v8_playlist_cp.fcg?disstid=888888&format=json&song_num=30&song_begin=0&g_tk=5381");
    if let Ok(res) = fetch_json(client, &url, reqwest::Method::GET, qq_headers(cookie), None, 10).await {
        let songs = jget(&res, &["cdlist"])
            .and_then(|c| c.as_array())
            .and_then(|a| a.first())
            .and_then(|cd| cd.get("songlist"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if !songs.is_empty() {
            return songs.iter().map(map_qq_track_lenient).collect();
        }
    }

    // Method 3: toplist
    if let Ok(res) = qq_get_toplist(client, cookie, 26, 30).await {
        if !res.is_empty() {
            return res;
        }
    }
    vec![]
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
        Ok(r) => r,
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

pub async fn get_liked_songs(
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    source: &str,
    user_id: &str,
) -> Vec<Track> {
    let cookie = cookies.get(source).map(String::as_str).unwrap_or("");
    match source {
        "netease" => netease_get_liked_songs(client, cookie, user_id).await,
        _ => vec![],
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

pub async fn get_daily_recommend(
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    source: &str,
) -> Vec<Track> {
    let cookie = cookies.get(source).map(String::as_str).unwrap_or("");
    match source {
        "netease" => netease_daily_recommend(client, cookie).await,
        "qqmusic" => qq_daily_recommend(client, cookie).await,
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
