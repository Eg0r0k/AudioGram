//! Lazy transcoding of Chromium-undecodable lossless formats to WAV for the
//! loopback media server.
//!
//! Chromium ships no ALAC and no Monkey's Audio decoder on any platform, so
//! an `<audio>` element fed such bytes fails with MEDIA_ERR_SRC_NOT_SUPPORTED
//! no matter how they are transported. The server therefore inspects
//! `.m4a`/`.mp4` (ALAC probe via symphonia) and `.ape` (ape-decoder) requests
//! and decodes them once — both decoders are pure Rust, so Android works too —
//! into a WAV file under the app cache dir, then serves that file through the
//! existing Range-aware local path.
//!
//! WAV is chosen over FLAC because writing it needs no encoder and the file
//! lives on loopback — bitrate is irrelevant. The cache key embeds source
//! mtime + length so an edited/replaced file re-transcodes.

use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_ALAC};
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Extensions worth probing at all — everything else is served raw.
pub(crate) fn is_mp4_family(path: &str) -> bool {
    let ext = path.rsplit('.').next().unwrap_or_default().to_ascii_lowercase();
    matches!(ext.as_str(), "m4a" | "mp4" | "m4b")
}

fn is_ape(path: &str) -> bool {
    path.rsplit('.').next().unwrap_or_default().eq_ignore_ascii_case("ape")
}

/// Cheap extension gate for the server: paths that may need a WAV rendition.
pub(crate) fn is_transcode_candidate(path: &str) -> bool {
    is_mp4_family(path) || is_ape(path)
}

fn open_format(src: &Path) -> Result<Box<dyn FormatReader>, String> {
    let file = std::fs::File::open(src).map_err(|e| e.to_string())?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension("m4a");
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| e.to_string())?;
    Ok(probed.format)
}

/// Header-only probe: does the container carry an ALAC audio track?
pub(crate) fn is_alac(src: &Path) -> bool {
    let Ok(format) = open_format(src) else {
        return false;
    };
    format
        .tracks()
        .iter()
        .any(|t| t.codec_params.codec == CODEC_TYPE_ALAC)
}

/// Cache file name for `src`: content-addressed by path + mtime + length so
/// replacing the source invalidates the entry without any bookkeeping. The
/// codec prefix keeps entries distinguishable when inspecting the cache.
fn cache_name(src: &Path, prefix: &str) -> std::io::Result<String> {
    let meta = std::fs::metadata(src)?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    src.to_string_lossy().hash(&mut hasher);
    meta.len().hash(&mut hasher);
    if let Ok(mtime) = meta.modified() {
        mtime.hash(&mut hasher);
    }
    Ok(format!("{prefix}-{:016x}.wav", hasher.finish()))
}

/// Decodes the ALAC track of `src` into `dst` as PCM WAV, preserving the
/// source bit depth (16/24/32; sub-byte depths round up).
fn decode_to_wav(src: &Path, dst: &Path) -> Result<(), String> {
    let mut format = open_format(src)?;

    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec == CODEC_TYPE_ALAC)
        .ok_or("no ALAC track")?
        .clone();

    let src_bits = track.codec_params.bits_per_sample.unwrap_or(16);
    // WAV wants whole bytes; symphonia hands us full-scale i32 samples either
    // way, so shifting down to the container depth is exact.
    let out_bits: u16 = match src_bits {
        0..=16 => 16,
        17..=24 => 24,
        _ => 32,
    };

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| e.to_string())?;

    // Rate and channel count live in the ALAC magic cookie, which only the
    // decoder parses — the writer is created off the first decoded buffer.
    let mut writer: Option<hound::WavWriter<std::io::BufWriter<std::fs::File>>> = None;
    let mut sample_buf: Option<SampleBuffer<i32>> = None;
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            // UnexpectedEof is symphonia's normal end-of-stream signal.
            Err(symphonia::core::errors::Error::IoError(e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(e) => return Err(e.to_string()),
        };
        if packet.track_id() != track.id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            // A corrupt packet mid-file should not kill the whole track.
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(e) => return Err(e.to_string()),
        };
        let spec = *decoded.spec();
        let out = match &mut writer {
            Some(out) => out,
            None => writer.insert(
                hound::WavWriter::create(
                    dst,
                    hound::WavSpec {
                        channels: spec.channels.count() as u16,
                        sample_rate: spec.rate,
                        bits_per_sample: out_bits,
                        sample_format: hound::SampleFormat::Int,
                    },
                )
                .map_err(|e| e.to_string())?,
            ),
        };
        let buf = sample_buf.get_or_insert_with(|| {
            SampleBuffer::new(decoded.capacity() as u64, spec)
        });
        buf.copy_interleaved_ref(decoded);
        let shift = 32 - u32::from(out_bits);
        for &sample in buf.samples() {
            out.write_sample(sample >> shift).map_err(|e| e.to_string())?;
        }
    }

    writer.ok_or("empty audio stream")?.finalize().map_err(|e| e.to_string())
}

/// Decodes a Monkey's Audio file into `dst` as PCM WAV, frame by frame — one
/// APE frame of PCM in memory at a time. The header carries exact sizes, so
/// Range math on the rendition is byte-accurate.
fn decode_ape_to_wav(src: &Path, dst: &Path) -> Result<(), String> {
    use std::io::Write;

    let file = std::fs::File::open(src).map_err(|e| e.to_string())?;
    let mut decoder = ape_decoder::ApeDecoder::new(std::io::BufReader::new(file))
        .map_err(|e| e.to_string())?;

    // RIFF sizes are u32 — a multi-hour album image can exceed them and the
    // header would silently wrap. Refuse; the raw-file fallback applies.
    let info = decoder.info();
    let pcm_bytes = info.total_samples
        * u64::from(info.channels)
        * u64::from(info.bits_per_sample / 8);
    if pcm_bytes + 44 > u64::from(u32::MAX) {
        return Err(format!("decoded size {pcm_bytes} exceeds the WAV 4 GiB limit"));
    }

    let out = std::fs::File::create(dst).map_err(|e| e.to_string())?;
    let mut out = std::io::BufWriter::new(out);
    out.write_all(&decoder.info().generate_wav_header())
        .map_err(|e| e.to_string())?;
    for frame in 0..decoder.total_frames() {
        let pcm = decoder.decode_frame(frame).map_err(|e| e.to_string())?;
        out.write_all(&pcm).map_err(|e| e.to_string())?;
    }
    out.flush().map_err(|e| e.to_string())
}

/// Returns the WAV rendition of a source the webview cannot decode (ALAC in
/// mp4, Monkey's Audio), transcoding on first use. `None` when the source
/// needs no rendition or anything fails — the caller then serves the raw
/// file exactly as before.
/// Removes tmp files orphaned by a previous process killed mid-decode.
/// Called once at server spawn, before any transcode can be in flight.
pub(crate) fn clean_stale_tmp(cache_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(cache_dir) else {
        return;
    };
    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy().contains(".tmp-") {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

type DecodeFn = fn(&Path, &Path) -> Result<(), String>;

pub(crate) fn wav_rendition_path(src: &Path, cache_dir: &Path) -> Option<PathBuf> {
    let path_str = src.to_string_lossy();
    let (prefix, decode): (&str, DecodeFn) = if is_ape(&path_str) {
        ("ape", decode_ape_to_wav)
    } else if is_mp4_family(&path_str) && is_alac(src) {
        ("alac", decode_to_wav)
    } else {
        return None;
    };

    let name = match cache_name(src, prefix) {
        Ok(name) => name,
        Err(e) => {
            log::warn!("{prefix} transcode: source metadata failed: {e}");
            return None;
        }
    };
    let dst = cache_dir.join(name);
    if dst.is_file() {
        log::info!("{prefix} transcode: cache hit for {}", src.display());
        return Some(dst);
    }

    if let Err(e) = std::fs::create_dir_all(cache_dir) {
        log::warn!("{prefix} transcode: cache dir failed: {e}");
        return None;
    }

    // The media element opens 2+ connections per load; without this lock the
    // concurrent cache misses would decode the same file in parallel (doubled
    // CPU, colliding tmp writes). Serialize decodes and re-check the cache
    // under the lock — the loser wakes up to a finished WAV. Runs inside
    // spawn_blocking, so blocking here is fine.
    static DECODE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = DECODE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if dst.is_file() {
        log::info!("{prefix} transcode: cache hit for {}", src.display());
        return Some(dst);
    }

    // Unique tmp per attempt: a half-written file is never visible under the
    // final name, and no two writers ever share a tmp path.
    static TMP_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = TMP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let tmp = cache_dir.join(format!(
        "{}.tmp-{}-{seq}",
        dst.file_name()?.to_string_lossy(),
        std::process::id(),
    ));
    let started = std::time::Instant::now();
    match decode(src, &tmp) {
        Ok(()) => {
            log::info!(
                "{prefix} transcode: {} decoded in {:.1}s",
                src.display(),
                started.elapsed().as_secs_f32(),
            );
            if let Err(e) = std::fs::rename(&tmp, &dst) {
                let _ = std::fs::remove_file(&tmp);
                // Lost the race to another writer — the destination exists.
                if !dst.is_file() {
                    log::warn!("{prefix} transcode: rename failed: {e}");
                    return None;
                }
            }
            Some(dst)
        }
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            log::warn!("{prefix} transcode: decode failed: {e}");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
    }

    fn temp_cache() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("audiogram-transcode-test-{}", crate::media_server::new_token()));
        std::fs::create_dir_all(&dir).expect("create temp cache");
        dir
    }

    #[test]
    fn concurrent_first_requests_produce_one_clean_wav() {
        let cache = temp_cache();
        let src = fixture("tiny-alac.m4a");

        let paths: Vec<_> = std::thread::scope(|scope| {
            (0..4)
                .map(|_| scope.spawn(|| wav_rendition_path(&src, &cache)))
                .collect::<Vec<_>>()
                .into_iter()
                .map(|h| h.join().expect("thread").expect("wav path"))
                .collect()
        });

        assert!(paths.windows(2).all(|w| w[0] == w[1]), "all callers see one path");
        hound::WavReader::open(&paths[0]).expect("valid wav");

        // No half-written tmp files may survive the race.
        let leftovers: Vec<_> = std::fs::read_dir(&cache)
            .expect("cache dir")
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".tmp-"))
            .collect();
        assert!(leftovers.is_empty(), "leftover tmp files: {leftovers:?}");

        let _ = std::fs::remove_dir_all(cache);
    }

    #[test]
    fn stale_tmp_files_are_cleaned_but_finished_wavs_kept() {
        let cache = temp_cache();
        std::fs::write(cache.join("ape-abc.wav.tmp-123-0"), b"partial").unwrap();
        std::fs::write(cache.join("alac-def.wav"), b"done").unwrap();

        clean_stale_tmp(&cache);

        assert!(!cache.join("ape-abc.wav.tmp-123-0").exists());
        assert!(cache.join("alac-def.wav").exists());
        let _ = std::fs::remove_dir_all(cache);
    }

    #[test]
    fn transcode_candidates_cover_mp4_family_and_ape() {
        assert!(is_transcode_candidate("/a/b.m4a"));
        assert!(is_transcode_candidate("C:/x/y.APE"));
        assert!(!is_transcode_candidate("/a/b.mp3"));
        assert!(!is_transcode_candidate("/a/b.flac"));
    }

    #[test]
    fn transcodes_ape_to_playable_wav_and_caches_it() {
        let cache = temp_cache();
        let src = fixture("tiny-impulse.ape");

        let wav = wav_rendition_path(&src, &cache).expect("transcoded path");
        assert!(wav.file_name().unwrap().to_string_lossy().starts_with("ape-"));

        let reader = hound::WavReader::open(&wav).expect("valid wav");
        let spec = reader.spec();
        assert_eq!(spec.channels, 2);
        assert_eq!(spec.sample_rate, 44100);
        assert_eq!(spec.bits_per_sample, 16);
        // The fixture is exactly 1.0s of 44.1kHz audio.
        assert_eq!(reader.duration(), 44100);

        let again = wav_rendition_path(&src, &cache).expect("cached path");
        assert_eq!(again, wav);

        let _ = std::fs::remove_dir_all(cache);
    }

    #[test]
    fn mp4_family_matches_only_mp4_extensions() {
        assert!(is_mp4_family("/a/b.m4a"));
        assert!(is_mp4_family("C:/x/y.MP4"));
        assert!(!is_mp4_family("/a/b.mp3"));
        assert!(!is_mp4_family("/a/b.flac"));
    }

    #[test]
    fn detects_alac_and_rejects_aac() {
        assert!(is_alac(&fixture("tiny-alac.m4a")));
        assert!(!is_alac(&fixture("tiny-aac.m4a")));
    }

    #[test]
    fn aac_source_is_left_alone() {
        let cache = temp_cache();
        assert_eq!(wav_rendition_path(&fixture("tiny-aac.m4a"), &cache), None);
        let _ = std::fs::remove_dir_all(cache);
    }

    #[test]
    fn transcodes_alac_to_playable_wav_and_caches_it() {
        let cache = temp_cache();
        let src = fixture("tiny-alac.m4a");

        let wav = wav_rendition_path(&src, &cache).expect("transcoded path");
        assert!(wav.is_file());

        let reader = hound::WavReader::open(&wav).expect("valid wav");
        let spec = reader.spec();
        assert_eq!(spec.channels, 2);
        assert_eq!(spec.sample_rate, 44100);
        assert_eq!(spec.bits_per_sample, 16);
        // 0.2s of 44.1kHz — the fixture's full duration must have survived.
        let frames = reader.duration();
        assert!((8000..=9000).contains(&frames), "unexpected frame count {frames}");

        // Second call hits the cache: same path, no re-transcode (mtime of
        // the wav is untouched because the file is simply found).
        let again = wav_rendition_path(&src, &cache).expect("cached path");
        assert_eq!(again, wav);

        let _ = std::fs::remove_dir_all(cache);
    }
}
