import SearchWorkerCtor from "../search.worker?worker";
import { buildAlbumDoc, buildAllSearchDocuments, buildArtistDoc, buildTrackDoc } from "./buildDocuments";
import type {
  SearchDocument,
  SearchFilter,
  SearchResultItem,
  WorkerRequest,
  WorkerResponse,
} from "../types";
import { db } from "@/db";
import { albumRepository, artistRepository, trackRepository } from "@/db/repositories";
import { countTrackDocuments, trackProjectionMismatch } from "../projectionCheck";
import { mapTracks } from "@/modules/tracks/lib/mappers";
import type { Track } from "@/modules/player/types";
import type { TrackId } from "@/types/ids";
import { getLogger } from "@/lib/logger";

const SEARCH_TIMEOUT_MS = 10_000;

type PendingSearch = {
  resolve: (results: SearchResponse) => void;
  reject: (err: Error) => void;
  timeoutId: number;
};

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  totalDuration: number;
}

interface SearchOptions {
  limit?: number;
  offset?: number;
}

class SearchWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingSearch>();
  private idCounter = 0;

  constructor(private readonly onFatal: (failed: SearchWorkerClient, error: Error) => void) {
    this.worker = new SearchWorkerCtor();
    this.worker.addEventListener("message", this.handleMessage);
    this.worker.addEventListener("error", this.handleWorkerFailure);
    this.worker.addEventListener("messageerror", this.handleWorkerFailure);
  }

  private handleMessage = (e: MessageEvent<WorkerResponse>): void => {
    const msg = e.data;

    if (msg.action === "results") {
      const pendingSearch = this.takePending(msg.id);
      pendingSearch?.resolve({
        results: msg.results,
        total: msg.total,
        totalDuration: msg.totalDuration,
      });
    }
    else if (msg.action === "error") {
      if (msg.id != null) {
        this.takePending(msg.id)?.reject(new Error(msg.message));
      }
      else {
        // A fire-and-forget add/remove failed inside the worker: the index
        // has silently diverged from the database. Discard it; the next
        // search rebuilds from a full scan.
        this.fail(new Error(msg.message));
      }
    }
  };

  private handleWorkerFailure = (event: Event): void => {
    const message = event instanceof ErrorEvent && event.message
      ? event.message
      : "Search worker crashed";
    this.fail(new Error(message));
  };

  private takePending(id: number): PendingSearch | undefined {
    const pendingSearch = this.pending.get(id);
    if (pendingSearch) {
      clearTimeout(pendingSearch.timeoutId);
      this.pending.delete(id);
    }
    return pendingSearch;
  }

  private fail(error: Error): void {
    for (const pendingSearch of this.pending.values()) {
      clearTimeout(pendingSearch.timeoutId);
      pendingSearch.reject(error);
    }
    this.pending.clear();
    this.onFatal(this, error);
  }

  build(documents: SearchDocument[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.action === "ready") {
          this.worker.removeEventListener("message", handler);
          resolve();
        }
        else if (msg.action === "error" && msg.id == null) {
          this.worker.removeEventListener("message", handler);
          reject(new Error(msg.message));
        }
      };

      this.worker.addEventListener("message", handler);
      this.post({ action: "build", documents });
    });
  }

  search(query: string, filter: SearchFilter, options?: SearchOptions): Promise<SearchResponse> {
    const id = ++this.idCounter;

    // Executor form on purpose: tsconfig lib is ES2020, so
    // Promise.withResolvers is not available to the type checker.
    return new Promise((resolve, reject) => {
      const timeoutId = self.setTimeout(() => {
        // A worker that stops answering is wedged for every later request
        // too: discard it so the next search starts on a fresh one.
        this.fail(new Error(`Search timed out after ${SEARCH_TIMEOUT_MS}ms`));
      }, SEARCH_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timeoutId });
      this.post({
        action: "search",
        query,
        id,
        filter,
        limit: options?.limit,
        offset: options?.offset,
      });
    });
  }

  add(documents: SearchDocument[]): void {
    this.post({ action: "add", documents });
  }

  remove(ids: string[]): void {
    this.post({ action: "remove", ids });
  }

  terminate(): void {
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.removeEventListener("error", this.handleWorkerFailure);
    this.worker.removeEventListener("messageerror", this.handleWorkerFailure);
    this.worker.terminate();
  }

  private post(msg: WorkerRequest): void {
    this.worker.postMessage(msg);
  }
}

let client: SearchWorkerClient | null = null;
let initPromise: Promise<void> | null = null;

function getClient(): SearchWorkerClient {
  if (!client) {
    client = new SearchWorkerClient(discardFailedClient);
  }

  return client;
}

function discardFailedClient(failed: SearchWorkerClient, error: Error): void {
  getLogger().error(`[Search] worker failed, discarding index: ${error.message}`);
  if (client !== failed) return;
  resetSearchIndex();
}

/**
 * Discards the in-session index without rebuilding. The next search (or
 * explicit rebuild) starts from a fresh full scan of the database.
 */
export function resetSearchIndex(): void {
  client?.terminate();
  client = null;
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

export function initSearchIndex(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = buildAllSearchDocuments()
    .then(async (documents) => {
      await getClient().build(documents);
      await assertProjectionInDev(documents);
    })
    .catch((err: unknown) => {
      initPromise = null;
      throw err;
    });

  return initPromise;
}

export async function searchDocuments(
  query: string,
  filter: SearchFilter,
  options?: SearchOptions,
): Promise<SearchResponse> {
  await initSearchIndex();
  return getClient().search(query, filter, options);
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

  await initSearchIndex();
  getClient().add(documents);
}

export async function removeSearchDocuments(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  await initSearchIndex();
  getClient().remove(ids);
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
