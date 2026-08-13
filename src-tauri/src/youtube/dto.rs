//! Serialized DTOs for YouTube Music entities plus mapping from rustypipe
//! models and the opaque pagination-token codec.
//!
//! ID kinds (all pass the `[A-Za-z0-9_-]` character class, so they must be
//! routed to the right command — never feed a browse id to resolve/download):
//! - track/video id: 11 chars, plays through `yt_resolve`/`yt_download`/`ytstream://`
//! - album browse id: `MPREb_…` → `yt_music_album`
//! - playlist id: `PL…` / `OLAK5uy_…` / `RDCLAK…` → `yt_music_playlist`
//! - artist channel id: `UC…` → `yt_music_artist`

use rustypipe::model::paginator::{ContinuationEndpoint, Paginator};
use rustypipe::model::richtext::ToPlaintext;
use rustypipe::model::{
    AlbumItem, AlbumType, ArtistItem, MusicAlbum, MusicArtist, MusicItem, MusicPlaylist,
    MusicPlaylistItem, TrackItem,
};

use super::{best_thumbnail, YtError};

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtArtistRef {
    pub id: Option<String>,
    pub name: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtAlbumRef {
    pub id: String,
    pub name: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtMusicTrack {
    /// Regular video id — valid for `yt_resolve`/`yt_download`/`ytstream://`.
    pub id: String,
    pub title: String,
    pub artists: Vec<YtArtistRef>,
    pub album: Option<YtAlbumRef>,
    /// Seconds; `None` when extracted from an artist page.
    pub duration: Option<u32>,
    pub thumbnail: Option<String>,
    /// True for music videos/episodes (i.ytimg thumbnail, no album).
    pub is_video: bool,
    /// Set when the track came from an album listing.
    pub track_nr: Option<u16>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtMusicAlbum {
    /// `MPREb_…` browse id — for `yt_music_album` only.
    pub id: String,
    pub title: String,
    pub artists: Vec<YtArtistRef>,
    /// "album" | "ep" | "single" | "audiobook" | "show"
    pub album_type: String,
    pub year: Option<u16>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtMusicArtist {
    /// `UC…` channel id — for `yt_music_artist` only.
    pub id: String,
    pub name: String,
    pub thumbnail: Option<String>,
    pub subscriber_count: Option<u64>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtMusicPlaylist {
    /// `PL…` / `OLAK5uy_…` / `RDCLAK…` — for `yt_music_playlist` only.
    pub id: String,
    pub title: String,
    pub owner: Option<String>,
    pub track_count: Option<u64>,
    pub thumbnail: Option<String>,
}

/// Uniform payload for the "All" search chip and continuations.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum YtMusicEntity {
    Track(YtMusicTrack),
    Album(YtMusicAlbum),
    Artist(YtMusicArtist),
    Playlist(YtMusicPlaylist),
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtPage<T> {
    pub items: Vec<T>,
    /// Opaque token; pass back verbatim to the matching continue command.
    pub continuation: Option<String>,
    /// Display-only estimate — never use to detect the end of the list.
    pub total: Option<u64>,
    /// Search only: the query YouTube actually used after typo correction.
    pub corrected_query: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtPlaylistDetail {
    pub id: String,
    pub title: String,
    pub owner: Option<String>,
    pub description: Option<String>,
    pub track_count: Option<u64>,
    pub thumbnail: Option<String>,
    pub from_ytm: bool,
    pub tracks: YtPage<YtMusicTrack>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtAlbumDetail {
    pub id: String,
    /// `OLAK5uy_…` playlist id of the album, when available.
    pub playlist_id: Option<String>,
    pub title: String,
    pub artists: Vec<YtArtistRef>,
    pub album_type: String,
    pub year: Option<u16>,
    pub thumbnail: Option<String>,
    pub track_count: u16,
    /// Albums are bounded — rustypipe returns the full track list.
    pub tracks: Vec<YtMusicTrack>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtArtistDetail {
    pub id: String,
    pub name: String,
    pub thumbnail: Option<String>,
    pub subscriber_count: Option<u64>,
    pub top_tracks: Vec<YtMusicTrack>,
    pub albums: Vec<YtMusicAlbum>,
    pub playlists: Vec<YtMusicPlaylist>,
}

/// The opaque continuation token handed to the frontend: everything
/// `RustyPipeQuery::continuation` needs, so the backend stays stateless.
#[derive(serde::Serialize, serde::Deserialize)]
pub(super) struct ContinuationToken {
    pub ctoken: String,
    pub endpoint: ContinuationEndpoint,
    pub visitor_data: Option<String>,
}

impl ContinuationToken {
    pub fn decode(raw: &str) -> Result<Self, YtError> {
        serde_json::from_str(raw)
            .map_err(|_| YtError::invalid_input("malformed continuation token"))
    }
}

fn encode_continuation<T>(paginator: &Paginator<T>) -> Option<String> {
    let ctoken = paginator.ctoken.clone()?;
    let token = ContinuationToken {
        ctoken,
        endpoint: paginator.endpoint,
        visitor_data: paginator.visitor_data.clone(),
    };
    serde_json::to_string(&token).ok()
}

/// Converts a rustypipe paginator into a serialized page, dropping items the
/// mapper rejects (e.g. `MusicItem::User`).
pub(super) fn page_from_paginator<T, D>(
    paginator: Paginator<T>,
    map: impl Fn(T) -> Option<D>,
) -> YtPage<D> {
    let continuation = encode_continuation(&paginator);
    YtPage {
        items: paginator.items.into_iter().filter_map(map).collect(),
        continuation,
        total: paginator.count,
        corrected_query: None,
    }
}

fn album_type_str(album_type: AlbumType) -> String {
    match album_type {
        AlbumType::Album => "album",
        AlbumType::Ep => "ep",
        AlbumType::Single => "single",
        AlbumType::Audiobook => "audiobook",
        AlbumType::Show => "show",
        _ => "album",
    }
    .to_owned()
}

fn artist_refs(artists: Vec<rustypipe::model::ArtistId>) -> Vec<YtArtistRef> {
    artists
        .into_iter()
        .map(|a| YtArtistRef { id: a.id, name: a.name })
        .collect()
}

pub(super) fn to_music_track(item: TrackItem) -> YtMusicTrack {
    YtMusicTrack {
        thumbnail: best_thumbnail(&item.cover),
        is_video: item.track_type.is_video(),
        id: item.id,
        title: item.name,
        artists: artist_refs(item.artists),
        album: item.album.map(|a| YtAlbumRef { id: a.id, name: a.name }),
        duration: item.duration,
        track_nr: item.track_nr,
    }
}

pub(super) fn to_music_album(item: AlbumItem) -> YtMusicAlbum {
    YtMusicAlbum {
        thumbnail: best_thumbnail(&item.cover),
        id: item.id,
        title: item.name,
        artists: artist_refs(item.artists),
        album_type: album_type_str(item.album_type),
        year: item.year,
    }
}

pub(super) fn to_music_artist(item: ArtistItem) -> YtMusicArtist {
    YtMusicArtist {
        thumbnail: best_thumbnail(&item.avatar),
        id: item.id,
        name: item.name,
        subscriber_count: item.subscriber_count,
    }
}

pub(super) fn to_music_playlist(item: MusicPlaylistItem) -> YtMusicPlaylist {
    YtMusicPlaylist {
        thumbnail: best_thumbnail(&item.thumbnail),
        id: item.id,
        title: item.name,
        owner: item.channel.map(|c| c.name),
        track_count: item.track_count,
    }
}

pub(super) fn to_music_entity(item: MusicItem) -> Option<YtMusicEntity> {
    match item {
        MusicItem::Track(t) => Some(YtMusicEntity::Track(to_music_track(t))),
        MusicItem::Album(a) => Some(YtMusicEntity::Album(to_music_album(a))),
        MusicItem::Artist(a) => Some(YtMusicEntity::Artist(to_music_artist(a))),
        MusicItem::Playlist(p) => Some(YtMusicEntity::Playlist(to_music_playlist(p))),
        MusicItem::User(_) => None,
    }
}

pub(super) fn to_playlist_detail(playlist: MusicPlaylist) -> YtPlaylistDetail {
    YtPlaylistDetail {
        thumbnail: best_thumbnail(&playlist.thumbnail),
        id: playlist.id,
        title: playlist.name,
        owner: playlist.channel.map(|c| c.name),
        description: playlist
            .description
            .map(|d| d.to_plaintext())
            .filter(|d| !d.is_empty()),
        track_count: playlist.track_count,
        from_ytm: playlist.from_ytm,
        tracks: page_from_paginator(playlist.tracks, |t| Some(to_music_track(t))),
    }
}

pub(super) fn to_album_detail(album: MusicAlbum) -> YtAlbumDetail {
    YtAlbumDetail {
        thumbnail: best_thumbnail(&album.cover),
        id: album.id,
        playlist_id: album.playlist_id,
        title: album.name,
        artists: artist_refs(album.artists),
        album_type: album_type_str(album.album_type),
        year: album.year,
        track_count: album.track_count,
        tracks: album.tracks.into_iter().map(to_music_track).collect(),
    }
}

pub(super) fn to_artist_detail(artist: MusicArtist) -> YtArtistDetail {
    YtArtistDetail {
        thumbnail: best_thumbnail(&artist.header_image),
        id: artist.id,
        name: artist.name,
        subscriber_count: artist.subscriber_count,
        top_tracks: artist.tracks.into_iter().map(to_music_track).collect(),
        albums: artist.albums.into_iter().map(to_music_album).collect(),
        playlists: artist.playlists.into_iter().map(to_music_playlist).collect(),
    }
}
