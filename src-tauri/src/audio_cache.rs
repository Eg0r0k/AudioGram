//! Bounded in-memory cache of whole prefetched tracks — the one structure
//! behind both the Navidrome and the YouTube prefetch paths.
//!
//! A source's `*_prefetch` command fills it for the next queue entry while
//! the current track plays, and the media server answers that entry's Range
//! requests straight from memory, so the next track starts instantly. Two
//! caps: a per-track byte limit (a multi-hour upload would pin hundreds of
//! MB for a head start streaming already provides) and a track count, past
//! which the oldest entry goes. Eviction is FIFO, not LRU: with two or three
//! queue-ahead entries, recency never matters.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use bytes::Bytes;

/// `Bytes` so a hit — and every Range slice served from it — is a refcounted
/// view, never a copy of a 100 MB track.
#[derive(Clone)]
pub(crate) struct CachedAudio {
    pub(crate) content_type: String,
    pub(crate) bytes: Bytes,
}

pub(crate) struct AudioCache {
    max_tracks: usize,
    max_track_bytes: usize,
    entries: Mutex<(HashMap<String, CachedAudio>, VecDeque<String>)>,
}

impl AudioCache {
    pub(crate) fn new(max_tracks: usize, max_track_bytes: usize) -> Self {
        Self {
            max_tracks,
            max_track_bytes,
            entries: Mutex::default(),
        }
    }

    pub(crate) fn get(&self, id: &str) -> Option<CachedAudio> {
        let entries = self.entries.lock().ok()?;
        entries.0.get(id).cloned()
    }

    pub(crate) fn contains(&self, id: &str) -> bool {
        self.entries
            .lock()
            .map(|entries| entries.0.contains_key(id))
            .unwrap_or(false)
    }

    /// Returns false when the track is over the per-track cap and was NOT
    /// cached — the command must surface that instead of reporting success.
    pub(crate) fn insert(&self, id: String, content_type: String, bytes: Bytes) -> bool {
        if bytes.len() > self.max_track_bytes {
            return false;
        }
        let Ok(mut entries) = self.entries.lock() else {
            return false;
        };
        let (map, order) = &mut *entries;
        let audio = CachedAudio {
            content_type,
            bytes,
        };
        if map.insert(id.clone(), audio).is_none() {
            order.push_back(id);
        }
        while map.len() > self.max_tracks {
            let Some(oldest) = order.pop_front() else {
                break;
            };
            map.remove(&oldest);
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn filled(cache: &AudioCache, id: &str, len: usize) -> bool {
        cache.insert(
            id.to_owned(),
            "audio/flac".into(),
            Bytes::from(vec![0u8; len]),
        )
    }

    #[test]
    fn insert_and_get_round_trip() {
        let cache = AudioCache::new(2, 64);
        assert!(filled(&cache, "s1", 16));

        let hit = cache.get("s1").expect("cached entry");
        assert_eq!(hit.content_type, "audio/flac");
        assert_eq!(hit.bytes.len(), 16);
        assert!(cache.contains("s1"));
        assert!(!cache.contains("s2"));
    }

    #[test]
    fn insert_rejects_tracks_over_the_per_track_cap() {
        let cache = AudioCache::new(2, 64);
        assert!(!filled(&cache, "big", 65));
        assert!(!cache.contains("big"));
    }

    #[test]
    fn insert_evicts_the_oldest_entry_beyond_the_track_cap() {
        let cache = AudioCache::new(2, 64);
        assert!(filled(&cache, "s1", 8));
        assert!(filled(&cache, "s2", 8));
        assert!(filled(&cache, "s3", 8));

        assert!(!cache.contains("s1"));
        assert!(cache.contains("s2"));
        assert!(cache.contains("s3"));
    }

    #[test]
    fn reinserting_an_id_replaces_it_without_evicting_others() {
        let cache = AudioCache::new(2, 64);
        assert!(filled(&cache, "s1", 8));
        assert!(filled(&cache, "s2", 8));
        assert!(filled(&cache, "s2", 24));

        assert!(cache.contains("s1"));
        assert_eq!(cache.get("s2").expect("updated entry").bytes.len(), 24);
    }
}
