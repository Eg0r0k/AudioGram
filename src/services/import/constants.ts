/** How many bytes to read when the file size is unknown. */
export const HEAD_READ_SIZE = 10 * 1024 * 1024;
/** Upper bound on bytes read for metadata parsing. */
export const MAX_METADATA_READ = 12 * 1024 * 1024;
/** Concurrent parse/copy operations. */
export const PROCESS_CONCURRENCY = 16;
/** Tracks persisted per DB transaction. */
export const DB_BATCH_SIZE = 50;
/** Items handled per pipeline iteration. */
export const PIPELINE_BATCH_SIZE = 100;
/** Concurrent fingerprint computations. */
export const FINGERPRINT_CONCURRENCY = 16;

export const AUDIO_FILE_EXTENSIONS = [
  "mp3", "flac", "wav", "ogg", "m4a", "aac", "opus", "wma", "alac",
];
