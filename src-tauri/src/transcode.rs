//! Lazy renditions of sources the webview cannot play as-is, for the loopback
//! media server. Two unrelated reasons a file needs one:
//!
//! **The codec is missing.** Chromium ships no ALAC and no Monkey's Audio
//! decoder on any platform, so an `<audio>` element fed such bytes fails with
//! MEDIA_ERR_SRC_NOT_SUPPORTED no matter how they are transported. Those are
//! decoded once into WAV — both decoders are pure Rust, so Android works too.
//! WAV is chosen over FLAC because writing it needs no encoder and the file
//! lives on loopback, where bitrate is irrelevant.
//!
//! **The file carries video.** Chromium refuses to play media with a video
//! track while its page is hidden: backgrounding the app pauses the element
//! within milliseconds and releases the video decoder. Plenty of `.m4a`
//! downloads are really videos by extension alone, so an mp4 with a `vide`
//! handler gets its AAC track rewrapped as ADTS — a header-only transform,
//! no decoding — and everything else is dropped. The same rewrap also makes
//! seeking cheap, since there is no longer an H.264 stream to re-initialise.
//!
//! The cache key embeds source mtime + length so an edited/replaced file
//! re-renders, and the codec prefix keeps the two kinds apart.

use std::hash::{Hash, Hasher};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_AAC, CODEC_TYPE_ALAC};
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

/// Reads the box header at the reader's position as `(size, type, header_len)`.
/// `size` covers the whole box including its header. `None` at a clean EOF.
fn read_box_header<R: Read>(reader: &mut R) -> std::io::Result<Option<(u64, [u8; 4], u64)>> {
    let mut head = [0u8; 8];
    match reader.read_exact(&mut head) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let mut size = u64::from(u32::from_be_bytes([head[0], head[1], head[2], head[3]]));
    let kind = [head[4], head[5], head[6], head[7]];
    let mut header_len = 8u64;
    // size == 1 escapes to a 64-bit largesize right after the type.
    if size == 1 {
        let mut ext = [0u8; 8];
        reader.read_exact(&mut ext)?;
        size = u64::from_be_bytes(ext);
        header_len = 16;
    }
    Ok(Some((size, kind, header_len)))
}

/// moov > trak > mdia > hdlr is the shallowest path to a handler type.
const VIDEO_SCAN_MAX_DEPTH: u8 = 4;

/// Walks container boxes looking for a track whose media handler is `vide`,
/// seeking over `mdat` rather than reading it — cost is independent of file
/// size.
fn scan_for_video<R: Read + Seek>(reader: &mut R, end: u64, depth: u8) -> std::io::Result<bool> {
    if depth > VIDEO_SCAN_MAX_DEPTH {
        return Ok(false);
    }
    loop {
        let pos = reader.stream_position()?;
        if pos >= end {
            return Ok(false);
        }
        let Some((size, kind, header_len)) = read_box_header(reader)? else {
            return Ok(false);
        };
        // size == 0 means "runs to the end of the file"; anything shorter than
        // its own header is malformed and would stall the walk.
        let size = if size == 0 { end - pos } else { size };
        if size < header_len {
            return Ok(false);
        }
        let body_end = pos.saturating_add(size).min(end);

        match &kind {
            // FullBox: version+flags (4), pre_defined (4), handler_type (4).
            b"hdlr" => {
                let mut buf = [0u8; 12];
                if reader.read_exact(&mut buf).is_ok() && &buf[8..12] == b"vide" {
                    return Ok(true);
                }
            }
            b"moov" | b"trak" | b"mdia" => {
                if scan_for_video(reader, body_end, depth + 1)? {
                    return Ok(true);
                }
            }
            _ => {}
        }
        reader.seek(SeekFrom::Start(body_end))?;
    }
}

/// Does this mp4 carry a video track? Chromium refuses to play media with one
/// while its page is hidden — the element is paused the moment the app is
/// backgrounded — so such files need an audio-only rendition even though their
/// audio codec is perfectly playable.
pub(crate) fn has_video_track(src: &Path) -> bool {
    let Ok(file) = std::fs::File::open(src) else {
        return false;
    };
    let Ok(len) = file.metadata().map(|m| m.len()) else {
        return false;
    };
    let mut reader = std::io::BufReader::new(file);
    scan_for_video(&mut reader, len, 0).unwrap_or(false)
}

/// Cache file name for `src`: content-addressed by path + mtime + length so
/// replacing the source invalidates the entry without any bookkeeping. The
/// codec prefix keeps entries distinguishable when inspecting the cache.
fn cache_name(src: &Path, prefix: &str, ext: &str) -> std::io::Result<String> {
    let meta = std::fs::metadata(src)?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    src.to_string_lossy().hash(&mut hasher);
    meta.len().hash(&mut hasher);
    if let Ok(mtime) = meta.modified() {
        mtime.hash(&mut hasher);
    }
    Ok(format!("{prefix}-{:016x}.{ext}", hasher.finish()))
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

/// AudioSpecificConfig → `(object_type, sampling_frequency_index,
/// channel_config)`, the three fields ADTS needs. The first 16 bits carry
/// 5 + 4 + 4 of them; the escape encodings (object type 31, frequency index
/// 15) are rejected by the caller because ADTS cannot express them.
fn parse_audio_specific_config(asc: &[u8]) -> Option<(u8, u8, u8)> {
    if asc.len() < 2 {
        return None;
    }
    let bits = u16::from_be_bytes([asc[0], asc[1]]);
    Some((
        ((bits >> 11) & 0x1F) as u8,
        ((bits >> 7) & 0x0F) as u8,
        ((bits >> 3) & 0x0F) as u8,
    ))
}

/// The 7-byte ADTS header (no CRC) that turns one raw AAC frame into a
/// self-describing one. `None` when the frame will not fit its 13-bit length.
fn adts_header(
    object_type: u8,
    freq_index: u8,
    channel_config: u8,
    payload_len: usize,
) -> Option<[u8; 7]> {
    let frame_len = payload_len.checked_add(7)?;
    if frame_len >= 1 << 13 {
        return None;
    }
    let profile = object_type.checked_sub(1)? & 0x03;
    Some([
        0xFF,
        // MPEG-4, layer 0, protection absent.
        0xF1,
        (profile << 6) | ((freq_index & 0x0F) << 2) | ((channel_config >> 2) & 0x01),
        ((channel_config & 0x03) << 6) | ((frame_len >> 11) & 0x03) as u8,
        ((frame_len >> 3) & 0xFF) as u8,
        (((frame_len & 0x07) << 5) as u8) | 0x1F,
        0xFC,
    ])
}

/// Rewraps the AAC track of an mp4 as raw ADTS, dropping every other track.
/// No decoding happens: mp4 already stores the exact AAC frames, they just
/// lack the per-frame header a bare stream needs. The point is losing the
/// video track — see {@link has_video_track}.
fn remux_mp4_aac_to_adts(src: &Path, dst: &Path) -> Result<(), String> {
    use std::io::Write;

    let mut format = open_format(src)?;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec == CODEC_TYPE_AAC)
        .ok_or("no AAC track")?
        .clone();

    let asc = track
        .codec_params
        .extra_data
        .as_deref()
        .ok_or("AAC track carries no AudioSpecificConfig")?;
    let (object_type, freq_index, channel_config) =
        parse_audio_specific_config(asc).ok_or("unreadable AudioSpecificConfig")?;
    // AAC Main/LC/SSR/LTP with a table-indexed rate and a plain channel
    // layout. Anything else (HE-AAC signalling, explicit rates, program
    // config elements) would need more than a header rewrite.
    if !(1..=4).contains(&object_type) || freq_index > 12 || !(1..=7).contains(&channel_config) {
        return Err(format!(
            "unsupported AAC config: object_type={object_type} \
             freq_index={freq_index} channel_config={channel_config}"
        ));
    }

    let out = std::fs::File::create(dst).map_err(|e| e.to_string())?;
    let mut out = std::io::BufWriter::new(out);
    let mut frames: u64 = 0;
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
        let data = packet.buf();
        let header = adts_header(object_type, freq_index, channel_config, data.len())
            .ok_or("AAC frame too large for ADTS")?;
        out.write_all(&header).map_err(|e| e.to_string())?;
        out.write_all(data).map_err(|e| e.to_string())?;
        frames += 1;
    }
    if frames == 0 {
        return Err("no AAC frames".into());
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

/// Returns the rendition of a source the webview cannot play as-is,
/// producing it on first use:
///
/// - Monkey's Audio and ALAC → WAV, because Chromium ships neither decoder;
/// - any mp4 carrying a video track → audio-only ADTS, because Chromium
///   refuses to play video-bearing media while the page is hidden.
///
/// `None` when the source needs no rendition or anything fails — the caller
/// then serves the raw file exactly as before.
pub(crate) fn rendition_path(src: &Path, cache_dir: &Path) -> Option<PathBuf> {
    let path_str = src.to_string_lossy();
    let (prefix, ext, decode): (&str, &str, DecodeFn) = if is_ape(&path_str) {
        ("ape", "wav", decode_ape_to_wav)
    }
    else if is_mp4_family(&path_str) {
        // ALAC first: its WAV rendition drops the video track anyway.
        if is_alac(src) {
            ("alac", "wav", decode_to_wav)
        }
        else if has_video_track(src) {
            ("aacv", "aac", remux_mp4_aac_to_adts)
        }
        else {
            return None;
        }
    }
    else {
        return None;
    };

    let name = match cache_name(src, prefix, ext) {
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
                .map(|_| scope.spawn(|| rendition_path(&src, &cache)))
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

        let wav = rendition_path(&src, &cache).expect("transcoded path");
        assert!(wav.file_name().unwrap().to_string_lossy().starts_with("ape-"));

        let reader = hound::WavReader::open(&wav).expect("valid wav");
        let spec = reader.spec();
        assert_eq!(spec.channels, 2);
        assert_eq!(spec.sample_rate, 44100);
        assert_eq!(spec.bits_per_sample, 16);
        // The fixture is exactly 1.0s of 44.1kHz audio.
        assert_eq!(reader.duration(), 44100);

        let again = rendition_path(&src, &cache).expect("cached path");
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
        assert_eq!(rendition_path(&fixture("tiny-aac.m4a"), &cache), None);
        let _ = std::fs::remove_dir_all(cache);
    }

    #[test]
    fn detects_video_track_only_when_one_is_present() {
        assert!(has_video_track(&fixture("tiny-video.m4a")));
        assert!(!has_video_track(&fixture("tiny-aac.m4a")));
        assert!(!has_video_track(&fixture("tiny-alac.m4a")));
        // A non-mp4 must not be mistaken for one carrying video.
        assert!(!has_video_track(&fixture("tiny-impulse.ape")));
    }

    #[test]
    fn remuxes_video_bearing_mp4_to_audio_only_adts() {
        let cache = temp_cache();
        let src = fixture("tiny-video.m4a");

        let out = rendition_path(&src, &cache).expect("rendition path");
        assert_eq!(out.extension().and_then(|e| e.to_str()), Some("aac"));
        assert!(out.file_name().unwrap().to_string_lossy().starts_with("aacv-"));

        let bytes = std::fs::read(&out).expect("readable rendition");
        assert!(!bytes.is_empty(), "rendition must not be empty");
        // Every ADTS frame starts with the 12-bit syncword.
        assert_eq!(bytes[0], 0xFF, "missing ADTS syncword");
        assert_eq!(bytes[1] & 0xF0, 0xF0, "missing ADTS syncword");

        // Walking the declared frame lengths must land exactly on the end of
        // the file — proof the headers describe the payload they precede.
        let mut offset = 0usize;
        let mut frames = 0u32;
        while offset + 7 <= bytes.len() {
            assert_eq!(bytes[offset], 0xFF, "frame {frames} lost sync");
            let len = (usize::from(bytes[offset + 3] & 0x03) << 11)
                | (usize::from(bytes[offset + 4]) << 3)
                | (usize::from(bytes[offset + 5]) >> 5);
            assert!(len > 7, "frame {frames} has a degenerate length {len}");
            offset += len;
            frames += 1;
        }
        assert_eq!(offset, bytes.len(), "frame lengths must tile the file");
        assert!(frames > 1, "expected several frames, got {frames}");

        // The rendition carries no video: it is far smaller than the source.
        let src_len = std::fs::metadata(&src).expect("source metadata").len();
        assert!(
            (bytes.len() as u64) < src_len / 2,
            "expected the video track to be gone: {} vs {src_len}",
            bytes.len(),
        );

        let again = rendition_path(&src, &cache).expect("cached path");
        assert_eq!(again, out);

        let _ = std::fs::remove_dir_all(cache);
    }

    #[test]
    fn adts_header_encodes_length_and_config() {
        let header = adts_header(2, 4, 2, 100).expect("header");
        assert_eq!(header[0], 0xFF);
        assert_eq!(header[1], 0xF1);
        // profile = object_type - 1 = 1, freq_index = 4, channel high bit = 0.
        assert_eq!(header[2], (1 << 6) | (4 << 2));
        let len = (usize::from(header[3] & 0x03) << 11)
            | (usize::from(header[4]) << 3)
            | (usize::from(header[5]) >> 5);
        assert_eq!(len, 107, "frame length must include the 7-byte header");
        // 13 bits cannot describe a frame this large.
        assert_eq!(adts_header(2, 4, 2, 1 << 13), None);
    }

    #[test]
    fn audio_specific_config_splits_into_adts_fields() {
        // 00010 0100 0010 000 → LC (2), 44.1kHz (4), stereo (2).
        assert_eq!(parse_audio_specific_config(&[0x12, 0x10]), Some((2, 4, 2)));
        assert_eq!(parse_audio_specific_config(&[0x12]), None);
    }

    #[test]
    fn transcodes_alac_to_playable_wav_and_caches_it() {
        let cache = temp_cache();
        let src = fixture("tiny-alac.m4a");

        let wav = rendition_path(&src, &cache).expect("transcoded path");
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
        let again = rendition_path(&src, &cache).expect("cached path");
        assert_eq!(again, wav);

        let _ = std::fs::remove_dir_all(cache);
    }
}
