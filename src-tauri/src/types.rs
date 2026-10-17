use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub source: String,
    pub name: String,
    #[serde(default)]
    pub artists: Vec<String>,
    #[serde(default)]
    pub album_name: String,
    #[serde(default)]
    pub album_id: String,
    #[serde(default)]
    pub album_cover_url: String,
    #[serde(default)]
    pub duration: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quality: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vip: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mapped_track_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mapped_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub source: String,
    pub name: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub cover_url: String,
    #[serde(default)]
    pub tracks: Vec<Track>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub publish_time: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artist {
    pub id: String,
    pub source: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub source: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub cover_url: String,
    #[serde(default)]
    pub track_count: i64,
    #[serde(default)]
    pub creator_name: String,
    #[serde(default)]
    pub creator_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracks: Option<Vec<Track>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_local: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    #[serde(default)]
    pub tracks: Vec<Track>,
    #[serde(default)]
    pub albums: Vec<Album>,
    #[serde(default)]
    pub artists: Vec<Artist>,
    #[serde(default)]
    pub playlists: Vec<Playlist>,
    #[serde(default)]
    pub total: i64,
    #[serde(default)]
    pub has_more: bool,
    pub source: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub query: String,
    pub source: String,
    #[serde(default, rename = "type")]
    pub search_type: Option<Vec<String>>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackInfo {
    pub url: String,
    pub quality: String,
    pub format: String,
    pub bitrate: i64,
    pub size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsLine {
    pub time: i64,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub translation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub source: String,
    pub lines: Vec<LyricsLine>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_lrc: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsRequest {
    #[serde(default)]
    pub track_id: String,
    pub track_name: String,
    #[serde(default)]
    pub artist_name: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncedTrack {
    pub id: String,
    pub track: Track,
    #[serde(default = "default_origin")]
    pub origin: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub matched_track: Option<Track>,
    #[serde(default)]
    pub match_confidence: f64,
    #[serde(default)]
    pub added_at: i64,
}

fn default_origin() -> String {
    "manual".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncedPlaylist {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    pub source: String,
    #[serde(default)]
    pub source_playlist_id: String,
    #[serde(default = "default_origin")]
    pub source_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(default)]
    pub tracks: Vec<SyncedTrack>,
    #[serde(default)]
    pub last_synced_at: i64,
    #[serde(default)]
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSyncRequest {
    pub source: String,
    pub playlist_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[allow(dead_code)]
    pub target_source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSyncResult {
    pub success: bool,
    pub playlist: SyncedPlaylist,
    pub matched_count: i64,
    pub unmatched_count: i64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistRefreshResult {
    pub added: i64,
    pub removed: i64,
    pub kept: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeningEvent {
    #[serde(default)]
    pub song_id: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub song_name: String,
    #[serde(default)]
    pub artists: Vec<String>,
    #[serde(default)]
    pub completed: bool,
    #[serde(default)]
    pub skipped: bool,
    #[serde(default)]
    pub duration: i64,
    #[serde(default)]
    pub total_duration: i64,
    #[serde(default)]
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    #[serde(default)]
    pub artist_weights: std::collections::HashMap<String, f64>,
    #[serde(default)]
    pub total_events: i64,
    #[serde(default)]
    pub last_updated: i64,
}
