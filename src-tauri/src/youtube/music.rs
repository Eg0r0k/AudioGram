//! YouTube Music search commands (rustypipe Innertube, anonymous) plus the
//! paginated video search.

use tauri::{AppHandle, Runtime};

use rustypipe::model::{
    AlbumItem, ArtistItem, MusicItem, MusicPlaylistItem, TrackItem, VideoItem,
};

use futures_util::future::join_all;
use rustypipe::client::RustyPipeQuery;

use super::dto::{
    apply_track_details, page_from_paginator, to_music_album, to_music_artist, to_music_entity,
    to_music_playlist, to_music_track, ContinuationToken, YtMusicEntity, YtPage,
};
use super::{best_thumbnail, yt_client, YtError};

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum YtMusicSearchKind {
    All,
    Tracks,
    Albums,
    Artists,
    Playlists,
}

fn empty_page<T>() -> YtPage<T> {
    YtPage { items: Vec::new(), continuation: None, total: None, corrected_query: None }
}

/// Only the top-result shelf serves stripped rows, so a handful of parallel
/// lookups covers them without turning one search into a request fan-out.
const MAX_ENRICHED_TRACKS: usize = 6;

/// Fills in artist/album/duration/cover for search rows YT returned without
/// them (top-result shelf). Best-effort: a failed lookup leaves its row as
/// it came, and the whole pass never fails the search.
async fn enrich_stripped_tracks(q: &RustyPipeQuery, page: &mut YtPage<YtMusicEntity>) {
    let targets: Vec<(usize, String)> = page
        .items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| match item {
            YtMusicEntity::Track(track) if track.artists.is_empty() => {
                Some((index, track.id.clone()))
            }
            _ => None,
        })
        .take(MAX_ENRICHED_TRACKS)
        .collect();

    if targets.is_empty() {
        return;
    }

    let details = join_all(targets.iter().map(|(_, id)| {
        let q = q.clone();
        let id = id.clone();
        async move {
            match q.music_details(&id).await {
                Ok(details) => Some(to_music_track(details.track)),
                Err(e) => {
                    log::warn!("music_details for {id} failed, keeping the stripped row: {e}");
                    None
                }
            }
        }
    }))
    .await;

    for ((index, _), detail) in targets.into_iter().zip(details) {
        let (Some(detail), Some(YtMusicEntity::Track(track))) = (detail, page.items.get_mut(index))
        else {
            continue;
        };
        apply_track_details(track, detail);
    }
}

#[tauri::command]
pub async fn yt_music_search<R: Runtime>(
    app: AppHandle<R>,
    query: String,
    kind: YtMusicSearchKind,
) -> Result<YtPage<YtMusicEntity>, YtError> {
    let query = query.trim().to_owned();
    if query.is_empty() {
        return Ok(empty_page());
    }

    let rp = yt_client(&app).await?;
    let q = rp.query();

    let (mut page, corrected) = match kind {
        YtMusicSearchKind::All => {
            let result = q.music_search_main(&query).await?;
            (page_from_paginator(result.items, to_music_entity), result.corrected_query)
        }
        YtMusicSearchKind::Tracks => {
            let result = q.music_search_tracks(&query).await?;
            (
                page_from_paginator(result.items, |t| Some(YtMusicEntity::Track(to_music_track(t)))),
                result.corrected_query,
            )
        }
        YtMusicSearchKind::Albums => {
            let result = q.music_search_albums(&query).await?;
            (
                page_from_paginator(result.items, |a| Some(YtMusicEntity::Album(to_music_album(a)))),
                result.corrected_query,
            )
        }
        YtMusicSearchKind::Artists => {
            let result = q.music_search_artists(&query).await?;
            (
                page_from_paginator(result.items, |a| Some(YtMusicEntity::Artist(to_music_artist(a)))),
                result.corrected_query,
            )
        }
        YtMusicSearchKind::Playlists => {
            // community=true searches the larger user-created corpus.
            let result = q.music_search_playlists(&query, true).await?;
            (
                page_from_paginator(result.items, |p| {
                    Some(YtMusicEntity::Playlist(to_music_playlist(p)))
                }),
                result.corrected_query,
            )
        }
    };

    page.corrected_query = corrected;
    enrich_stripped_tracks(&q, &mut page).await;
    Ok(page)
}

/// Fetch-more for music search results AND playlist track listings — the
/// token encodes which Innertube endpoint to hit; `kind` picks the item type
/// (it cannot be encoded in the token, the generic must be instantiated here).
#[tauri::command]
pub async fn yt_continue<R: Runtime>(
    app: AppHandle<R>,
    continuation: String,
    kind: YtMusicSearchKind,
) -> Result<YtPage<YtMusicEntity>, YtError> {
    let token = ContinuationToken::decode(&continuation)?;
    let rp = yt_client(&app).await?;
    let q = rp.query();
    let visitor_data = token.visitor_data.as_deref();

    let mut page = match kind {
        YtMusicSearchKind::All => {
            let p = q
                .continuation::<MusicItem, _>(&token.ctoken, token.endpoint, visitor_data)
                .await?;
            page_from_paginator(p, to_music_entity)
        }
        YtMusicSearchKind::Tracks => {
            let p = q
                .continuation::<TrackItem, _>(&token.ctoken, token.endpoint, visitor_data)
                .await?;
            page_from_paginator(p, |t| Some(YtMusicEntity::Track(to_music_track(t))))
        }
        YtMusicSearchKind::Albums => {
            let p = q
                .continuation::<AlbumItem, _>(&token.ctoken, token.endpoint, visitor_data)
                .await?;
            page_from_paginator(p, |a| Some(YtMusicEntity::Album(to_music_album(a))))
        }
        YtMusicSearchKind::Artists => {
            let p = q
                .continuation::<ArtistItem, _>(&token.ctoken, token.endpoint, visitor_data)
                .await?;
            page_from_paginator(p, |a| Some(YtMusicEntity::Artist(to_music_artist(a))))
        }
        YtMusicSearchKind::Playlists => {
            let p = q
                .continuation::<MusicPlaylistItem, _>(&token.ctoken, token.endpoint, visitor_data)
                .await?;
            page_from_paginator(p, |p| Some(YtMusicEntity::Playlist(to_music_playlist(p))))
        }
    };

    enrich_stripped_tracks(&q, &mut page).await;
    Ok(page)
}

/// Paginated video search continuation (separate from `yt_continue` because
/// the item DTO differs).
#[tauri::command]
pub async fn yt_search_continue<R: Runtime>(
    app: AppHandle<R>,
    continuation: String,
) -> Result<YtPage<YtSearchResult>, YtError> {
    let token = ContinuationToken::decode(&continuation)?;
    let rp = yt_client(&app).await?;
    let p = rp
        .query()
        .continuation::<VideoItem, _>(
            &token.ctoken,
            token.endpoint,
            token.visitor_data.as_deref(),
        )
        .await?;
    Ok(page_from_paginator(p, |v| Some(to_search_result(v))))
}

/// Search suggestions for the YouTube pane (terms only — one cheap GET).
#[tauri::command]
pub async fn yt_music_suggest<R: Runtime>(
    app: AppHandle<R>,
    query: String,
) -> Result<Vec<String>, YtError> {
    let query = query.trim().to_owned();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let rp = yt_client(&app).await?;
    let suggestion = rp.query().music_search_suggestion(&query).await?;
    Ok(suggestion.terms)
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtSearchResult {
    id: String,
    title: String,
    uploader: Option<String>,
    duration: Option<f64>,
    thumbnail: Option<String>,
}

/// Regular YouTube video search (mixes, concerts, uploads absent from YTM).
#[tauri::command]
pub async fn yt_search<R: Runtime>(
    app: AppHandle<R>,
    query: String,
) -> Result<YtPage<YtSearchResult>, YtError> {
    let query = query.trim().to_owned();
    if query.is_empty() {
        return Ok(empty_page());
    }

    let rp = yt_client(&app).await?;
    let result = rp.query().search::<VideoItem, _>(&query).await?;
    Ok(page_from_paginator(result.items, |v| Some(to_search_result(v))))
}

fn to_search_result(item: VideoItem) -> YtSearchResult {
    YtSearchResult {
        thumbnail: best_thumbnail(&item.thumbnail),
        id: item.id,
        title: item.name,
        uploader: item.channel.map(|c| c.name),
        duration: item.duration.map(f64::from),
    }
}
