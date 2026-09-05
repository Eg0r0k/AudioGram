import { buildAlbumDoc, buildAllSearchDocuments, buildArtistDoc, buildTrackDoc } from "./buildDocuments";
import { createSearchEngine, type SearchEngine } from "./searchEngine";
import type { SearchDocument, SearchFilter, SearchOptions, SearchResponse } from "../types";
import { db } from "@/db";
import { albumRepository, artistRepository, trackRepository } from "@/db/repositories";
import { countTrackDocuments, trackProjectionMismatch } from "../projectionCheck";
import { mapTracks } from "@/modules/tracks/lib/mappers";
import type { Track } from "@/modules/player/types";
import type { TrackId } from "@/types/ids";

export type { SearchResponse } from "../types";

let engine: SearchEngine | null = null;
let initPromise: Promise<SearchEngine> | null = null;

/**
 * Discards the in-session index without rebuilding. The next search (or
 * explicit rebuild) starts from a fresh full scan of the database.
 */
export function resetSearchIndex(): void {
  engine = null;
  initPromise = null;
}

/** Dev-only projection check; must never break search init. */
async function assertProjectionInDev(documents: SearchDocument[]): Promise<void> {
  if (!import.meta.env.DEV) return;
  try {
    // The index carries library members only — compare against that count.
    const dbTrackCount = await db.tracks.where("pinned").equals(1).count();
    const drift = trackProjectionMismatch(dbTrackCount, countTrackDocuments(documents));
    if (drift) console.error(drift);
  }
  catch {
    // Counting failed — nothing useful to report.
  }
}

const ensureEngine = (): Promise<SearchEngine> => {
  if (engine) return Promise.resolve(engine);
  if (initPromise) return initPromise;

  initPromise = buildAllSearchDocuments()
    .then(async (documents) => {
      const built = createSearchEngine();
      built.build(documents);
      engine = built;
      await assertProjectionInDev(documents);
      return built;
    })
    .catch((err: unknown) => {
      initPromise = null;
      throw err;
    });

  return initPromise;
};

export async function initSearchIndex(): Promise<void> {
  await ensureEngine();
}

export async function searchDocuments(
  query: string,
  filter: SearchFilter,
  options?: SearchOptions,
): Promise<SearchResponse> {
  return (await ensureEngine()).search(query, filter, options);
}

async function hydrateTracksByIds(ids: TrackId[]): Promise<Track[]> {
  if (ids.length === 0) return [];

  const entitiesResult = await trackRepository.findByIds(ids);
  if (entitiesResult.isErr()) throw entitiesResult.error;
  const entities = entitiesResult.value;

  const artistIds = [...new Set(entities.flatMap(entity => entity.artistIds))];
  const albumIds = [...new Set(entities.map(entity => entity.albumId))];

  const [artistsResult, albumsResult] = await Promise.all([
    artistRepository.findByIds(artistIds),
    albumRepository.findByIds(albumIds),
  ]);
  if (artistsResult.isErr()) throw artistsResult.error;
  if (albumsResult.isErr()) throw albumsResult.error;

  return mapTracks(entities, artistsResult.value, albumsResult.value);
}

export async function searchTracks(
  query: string,
  offset = 0,
  limit?: number,
) {
  const response = await searchDocuments(query, "track", { offset, limit });

  // Invariant: the search document is only a matching/rendering source. Playable
  // tracks are hydrated from the DB by entityId, so paths stay current after a
  // folder relink or REMOTE_HLS TTL expiry. Order follows the search score.
  const ids = response.results.map(item => item.entityId as TrackId);
  const tracks = await hydrateTracksByIds(ids);

  return {
    tracks,
    total: response.total,
    totalDuration: response.totalDuration,
  };
}

export async function upsertSearchDocuments(documents: SearchDocument[]): Promise<void> {
  if (documents.length === 0) return;

  (await ensureEngine()).upsert(documents);
}

export async function removeSearchDocuments(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  (await ensureEngine()).remove(ids);
}

/**
 * Upserts freshly imported/pinned tracks (with their artists and albums)
 * into the live index — the full build happens only once per session.
 */
export async function indexImportedTracks(trackIds: TrackId[]): Promise<void> {
  if (trackIds.length === 0) return;

  const tracksResult = await trackRepository.findByIds(trackIds);
  if (tracksResult.isErr()) throw tracksResult.error;
  const tracks = tracksResult.value.filter(track => track.pinned !== 0);
  if (tracks.length === 0) return;

  const artistIds = [...new Set(tracks.flatMap(track => track.artistIds))];
  const albumIds = [...new Set(tracks.map(track => track.albumId))];

  const [artistsResult, albumsResult] = await Promise.all([
    artistRepository.findByIds(artistIds),
    albumRepository.findByIds(albumIds),
  ]);
  if (artistsResult.isErr()) throw artistsResult.error;
  if (albumsResult.isErr()) throw albumsResult.error;

  const artistMap = new Map(artistsResult.value.map(artist => [artist.id, artist]));
  const albumMap = new Map(albumsResult.value.map(album => [album.id, album]));

  await upsertSearchDocuments([
    ...artistsResult.value.filter(a => a.pinned !== 0).map(artist => buildArtistDoc(artist)),
    ...albumsResult.value.filter(a => a.pinned !== 0).map(album => buildAlbumDoc(album, artistMap)),
    ...tracks.map(track => buildTrackDoc(track, artistMap, albumMap)),
  ]);
}

export async function rebuildSearchIndex() {
  resetSearchIndex();
  await initSearchIndex();
}
