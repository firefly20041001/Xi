// Playlist service: local/imported playlists stored as SyncedPlaylist JSON
use crate::net::now_ms;
use crate::store;
use crate::types::*;
use anyhow::{anyhow, Result};
use serde_json::Value;
use std::collections::HashMap;
use tauri::AppHandle;

fn playlist_map(app: &AppHandle) -> serde_json::Map<String, Value> {
    store::load_playlists(app)
}

fn parse(value: &Value) -> Option<SyncedPlaylist> {
    serde_json::from_value(value.clone()).ok()
}

fn generate_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64 + d.as_secs())
        .unwrap_or(0);
    format!("{:x}{}", nanos, (nanos % 46656) as u32)
}

pub async fn create(app: &AppHandle, name: String) -> Result<SyncedPlaylist> {
    let id = generate_id();
    let now = now_ms();
    let record = SyncedPlaylist {
        id: id.clone(),
        name,
        description: Some(String::new()),
        cover_url: Some(String::new()),
        source: "local".into(),
        source_playlist_id: String::new(),
        source_type: "local".into(),
        source_url: Some(String::new()),
        tracks: vec![],
        last_synced_at: now,
        created_at: now,
    };
    let mut map = playlist_map(app);
    map.insert(id, serde_json::to_value(&record).unwrap_or(Value::Null));
    store::save_playlists(app, &map);
    Ok(record)
}

pub async fn create_from_remote(
    app: &AppHandle,
    playlist: Playlist,
    source_url: Option<String>,
) -> Result<SyncedPlaylist> {
    let id = generate_id();
    let now = now_ms();
    let tracks = playlist
        .tracks
        .unwrap_or_default()
        .into_iter()
        .map(|track| SyncedTrack {
            id: format!("{}-{}", track.id, track.source),
            track,
            origin: "import".into(),
            matched_track: None,
            match_confidence: 0.0,
            added_at: now,
        })
        .collect();
    let record = SyncedPlaylist {
        id: id.clone(),
        name: playlist.name,
        description: Some(playlist.description.unwrap_or_default()),
        cover_url: Some(playlist.cover_url),
        source: playlist.source.clone(),
        source_playlist_id: playlist.id,
        source_type: "import".into(),
        source_url: Some(source_url.unwrap_or_default()),
        tracks,
        last_synced_at: now,
        created_at: now,
    };
    let mut map = playlist_map(app);
    map.insert(id, serde_json::to_value(&record).unwrap_or(Value::Null));
    store::save_playlists(app, &map);
    Ok(record)
}

pub fn get_all(app: &AppHandle) -> Vec<SyncedPlaylist> {
    playlist_map(app)
        .values()
        .filter_map(parse)
        .collect()
}

pub fn get_by_id(app: &AppHandle, id: &str) -> Option<SyncedPlaylist> {
    playlist_map(app).get(id).and_then(parse)
}

pub async fn delete(app: &AppHandle, id: &str) {
    let mut map = playlist_map(app);
    map.remove(id);
    store::save_playlists(app, &map);
}

fn put(app: &AppHandle, record: &SyncedPlaylist) {
    let mut map = playlist_map(app);
    map.insert(
        record.id.clone(),
        serde_json::to_value(record).unwrap_or(Value::Null),
    );
    store::save_playlists(app, &map);
}

pub async fn refresh(app: &AppHandle, client: &reqwest::Client, id: &str) -> Result<PlaylistRefreshResult> {
    let record = get_by_id(app, id).ok_or_else(|| anyhow!("Playlist not found"))?;
    if record.source_type != "import" {
        return Err(anyhow!("Not an imported playlist"));
    }

    let remote = crate::providers::get_playlist(client, &accounts_cookie_map(app), &record.source, &record.source_playlist_id).await?;
    let remote_tracks = remote.tracks.unwrap_or_default();

    let mut record = record;
    if !remote.name.is_empty() {
        record.name = remote.name;
    }
    if !remote.cover_url.is_empty() {
        record.cover_url = Some(remote.cover_url);
    }

    let imported: Vec<SyncedTrack> = record
        .tracks
        .iter()
        .filter(|t| t.origin == "import")
        .cloned()
        .collect();
    let remote_ids: std::collections::HashSet<&String> =
        remote_tracks.iter().map(|t| &t.id).collect();
    let remote_by_id: HashMap<&String, &Track> =
        remote_tracks.iter().map(|t| (&t.id, t)).collect();

    let existing_imported_ids: std::collections::HashSet<&String> =
        imported.iter().map(|t| &t.track.id).collect();
    let new_tracks: Vec<&Track> = remote_tracks
        .iter()
        .filter(|t| !existing_imported_ids.contains(&t.id))
        .collect();
    let removed_count = imported
        .iter()
        .filter(|t| !remote_ids.contains(&t.track.id))
        .count() as i64;

    // Keep the stored order for all existing tracks while refreshing
    // imported metadata
    let now = now_ms();
    let mut existing_tracks: Vec<SyncedTrack> = record
        .tracks
        .iter()
        .filter(|t| t.origin == "manual" || remote_ids.contains(&t.track.id))
        .cloned()
        .collect();
    for existing in existing_tracks.iter_mut() {
        if existing.origin != "import" {
            continue;
        }
        if let Some(remote_track) = remote_by_id.get(&existing.track.id) {
            existing.track = (*remote_track).clone();
        }
    }

    // Prepend newly discovered tracks
    let new_imported: Vec<SyncedTrack> = new_tracks
        .iter()
        .map(|track| SyncedTrack {
            id: format!("{}-{}", track.id, track.source),
            track: (*track).clone(),
            origin: "import".into(),
            matched_track: None,
            match_confidence: 0.0,
            added_at: now,
        })
        .collect();

    let kept = record.tracks.iter().filter(|t| t.origin == "manual").count() as i64;
    record.tracks = [new_imported, existing_tracks].concat();
    record.last_synced_at = now;
    let total = record.tracks.len() as i64;
    put(app, &record);

    Ok(PlaylistRefreshResult {
        added: new_tracks.len() as i64,
        removed: removed_count,
        kept,
        total,
    })
}

pub async fn add_track(app: &AppHandle, playlist_id: &str, track: Track) {
    let mut record = match get_by_id(app, playlist_id) {
        Some(r) => r,
        None => return,
    };
    record
        .tracks
        .retain(|t| !(t.track.id == track.id && t.track.source == track.source));
    record.tracks.insert(
        0,
        SyncedTrack {
            id: format!("{}-{}", track.id, track.source),
            track,
            origin: "manual".into(),
            matched_track: None,
            match_confidence: 0.0,
            added_at: now_ms(),
        },
    );
    put(app, &record);
}

pub async fn remove_track(app: &AppHandle, playlist_id: &str, track_id: &str) {
    let mut record = match get_by_id(app, playlist_id) {
        Some(r) => r,
        None => return,
    };
    record.tracks.retain(|t| t.track.id != track_id);
    put(app, &record);
}

pub async fn sync(
    app: &AppHandle,
    client: &reqwest::Client,
    request: &PlaylistSyncRequest,
) -> Result<PlaylistSyncResult> {
    let accounts = accounts_cookie_map(app);
    let remote = crate::providers::get_playlist(client, &accounts, &request.source, &request.playlist_id).await?;

    let existing = get_all(app)
        .into_iter()
        .find(|p| p.source == request.source && p.source_playlist_id == request.playlist_id);

    if let Some(existing) = existing {
        let _ = refresh(app, client, &existing.id).await?;
        let updated = get_by_id(app, &existing.id).ok_or_else(|| anyhow!("playlist vanished"))?;
        return Ok(PlaylistSyncResult {
            success: true,
            playlist: updated,
            matched_count: 0,
            unmatched_count: 0,
            errors: vec![],
        });
    }

    let created = create_from_remote(app, remote, None).await?;
    Ok(PlaylistSyncResult {
        success: true,
        playlist: created,
        matched_count: 0,
        unmatched_count: 0,
        errors: vec![],
    })
}

/// All stored account cookies keyed by provider, for provider calls
pub fn accounts_cookie_map(app: &AppHandle) -> HashMap<String, String> {
    store::load_accounts(app)
        .into_iter()
        .map(|(k, v)| (k, v.cookie))
        .collect()
}
