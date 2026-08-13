import { storageService } from "@/db/storage";
import { parseLrc, type LyricsLine } from "../lib/lrc";
import { isLibraryTrack, type PlayerTrack } from "../types";
import { fetchLrcLibLyrics } from "./lyrics.service";

export type TrackLyricsLoadStatus = "idle" | "ready" | "error";

export interface TrackLyricsLoadResult {
  lines: LyricsLine[];
  status: TrackLyricsLoadStatus;
}

export async function loadTrackLyrics(track: PlayerTrack | null): Promise<TrackLyricsLoadResult> {
  if (!track) {
    return { lines: [], status: "idle" };
  }

  // Ephemeral tracks (YouTube streams, radio) have no lyricsPath, but a
  // title + artist is enough for the lrclib lookup below.
  if (isLibraryTrack(track) && track.lyricsPath) {
    const result = await storageService.getFile(track.lyricsPath);
    if (result.isErr()) {
      return { lines: [], status: "error" };
    }

    try {
      const text = await result.value.text();
      return { lines: parseLrc(text), status: "ready" };
    }
    catch {
      return { lines: [], status: "error" };
    }
  }

  if (!track.title || !track.artist) {
    return { lines: [], status: "idle" };
  }

  const result = await fetchLrcLibLyrics(track.title, track.artist);

  return result.match(
    lines => ({ lines, status: "ready" }),
    error => ({ lines: [], status: error.type === "NETWORK" ? "error" : "idle" }),
  );
}
