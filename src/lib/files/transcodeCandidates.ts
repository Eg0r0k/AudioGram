/**
 * Extensions the native media server may have to transcode to WAV before the
 * webview can play them (ALAC probe for the mp4 family, always for APE).
 * Mirrors `is_transcode_candidate` in src-tauri/src/transcode.rs — first
 * playback of such a file pays a full decode, so it is worth pre-warming.
 */
const TRANSCODE_CANDIDATE_EXTENSIONS = new Set(["m4a", "mp4", "m4b", "ape"]);

export const isTranscodeCandidatePath = (path: string | undefined): boolean => {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TRANSCODE_CANDIDATE_EXTENSIONS.has(ext);
};
