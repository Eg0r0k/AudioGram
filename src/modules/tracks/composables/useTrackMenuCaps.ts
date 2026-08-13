import { computed, type Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { parseTrackRef, type SourceKind } from "@/types/track-ref";
import { ytVideoIdFromStreamUrl } from "@/lib/stream-url";
import { sources } from "@/modules/sources";
import { offlineCopyQueries } from "@/queries/offlineCopy.queries";
import { trackHasLocalFile } from "@/modules/tracks/lib/trackPredicates";
import type { TrackId } from "@/types/ids";
import type { TrackMenuSubject } from "../components/menu/type";

//
// "WHAT can be done with this subject" — the second axis of the menu system.
// Contexts answer "WHERE the menu is open"; capabilities answer everything
// source/pinned/offline-dependent, so item components never inspect the
// source themselves.
//
export interface TrackMenuCaps {
  source: SourceKind;
  /** A library row with pinned = 1 — visible on library pages. */
  isInLibrary: boolean;
  /** A Dexie row exists at all (shadow rows included). */
  isPinned: boolean;
  hasOfflineCopy: boolean;
  /** Local file OR offline copy on disk → "Save as…" can produce a file. */
  canExportFile: boolean;
  /** The source can hand over a file and no copy exists yet. */
  canOffline: boolean;
  /** Lyrics attach to library rows only (stored locally on the pinned row). */
  canAttachLyrics: boolean;
  canOpenExternal: boolean;
}

function subjectTrackId(subject: TrackMenuSubject | null): TrackId | null {
  if (!subject) return null;
  if (subject.kind === "library") return subject.track.id;
  if (subject.kind === "remote") return subject.dto.id;
  // Ephemeral tracks never have a TrackId.
  return null;
}

function subjectSource(subject: TrackMenuSubject | null): SourceKind {
  if (!subject) return "local";
  if (subject.kind === "ephemeral") {
    const { source } = subject.track;
    return source.type === "url" && ytVideoIdFromStreamUrl(source.url) ? "yt" : "local";
  }
  return subject.kind === "library"
    ? parseTrackRef(subject.track.id).kind
    : parseTrackRef(subject.dto.id).kind;
}

/** Capability lookup that tolerates sources not registered yet (nd until M2). */
function sourceCanDownload(kind: SourceKind): boolean {
  try {
    return sources.get(kind).capabilities.download;
  }
  catch {
    return false;
  }
}

/**
 * Computes the capability set for the active menu subject. The synchronous
 * part derives from the subject itself; the offline copy comes from the
 * `offlineCopy(trackId)` query (cache-synced by the download manager).
 *
 * Shells compute this once per active subject and pass it down next to
 * `actions` — item components receive ready-made booleans.
 */
export function useTrackMenuCaps(subject: Ref<TrackMenuSubject | null>): Ref<TrackMenuCaps> {
  const source = computed(() => subjectSource(subject.value));
  const isRemote = computed(() => source.value !== "local");
  const trackId = computed(() => (isRemote.value ? subjectTrackId(subject.value) : null));

  const { data: offlineCopy } = useQuery(computed(() => offlineCopyQueries.detail(trackId.value)));

  return computed<TrackMenuCaps>(() => {
    const current = subject.value;
    const isLibrary = current?.kind === "library";
    const hasOfflineCopy = !!offlineCopy.value;
    const hasLocalFile = isLibrary && trackHasLocalFile(current.track);

    return {
      source: source.value,
      isInLibrary: isLibrary && (current.track.pinned ?? 1) === 1,
      isPinned: isLibrary,
      hasOfflineCopy,
      canExportFile: hasLocalFile || hasOfflineCopy,
      canOffline: isRemote.value && sourceCanDownload(source.value) && !hasOfflineCopy,
      canAttachLyrics: isLibrary,
      canOpenExternal: isRemote.value,
    };
  });
}
