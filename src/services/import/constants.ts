import { AUDIO_MIME_TYPES } from "@/types/media";

/** How many bytes to read when the file size is unknown. */
export const HEAD_READ_SIZE = 10 * 1024 * 1024;
/** Upper bound on bytes read for metadata parsing. */
export const MAX_METADATA_READ = 12 * 1024 * 1024;
/**
 * First-attempt head read for formats whose metadata lives entirely in the
 * head (see head-read.ts) — enough for tags plus a typical embedded cover.
 * Parsing failures fall back to {@link MAX_METADATA_READ}.
 */
export const INITIAL_METADATA_READ = 1024 * 1024;
/** Concurrent parse/copy operations. */
export const PROCESS_CONCURRENCY = 16;
/** Tracks persisted per DB transaction. */
export const DB_BATCH_SIZE = 50;
/** Items handled per pipeline iteration. */
export const PIPELINE_BATCH_SIZE = 100;
/** Concurrent fingerprint computations. */
export const FINGERPRINT_CONCURRENCY = 16;

/**
 * Extensions offered by the file picker.
 *
 * Derived from {@link AUDIO_MIME_TYPES} (skipping the `container-codec` keys)
 * so the picker can only ever offer what import validation accepts — offering
 * more just produces "unsupported format" failures on files the user picked.
 */
export const AUDIO_FILE_EXTENSIONS = Object.keys(AUDIO_MIME_TYPES)
  .filter(key => !key.includes("-"));
