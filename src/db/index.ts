import Dexie, { type Table } from "dexie";
import type {
  AlbumEntity,
  ArtistEntity,
  AudioFeaturesEntity,
  CoverEntity,
  DownloadJobEntity,
  ListenEventEntity,
  OfflineCopyEntity,
  PlaylistEntity,
  RadioStationEntity,
  SidebarFolderEntity,
  TagEntity,
  TrackChapterEntity,
  TrackEntity,
} from "./entities";
import { upgradeToV10, upgradeToV12, upgradeToV14 } from "./migrations";
import type { DbError } from "./errors/db.errors";
import { toDbError } from "./errors/db.errors";
import { getLogger } from "@/lib/logger";
import type { AlbumId, ArtistId, PlaylistId, RadioStationId, SidebarFolderId, TagId, TrackId } from "@/types/ids";
import { err, ok, type Result } from "neverthrow";

export class AppDatabase extends Dexie {
  tracks!: Table<TrackEntity, TrackId>;
  artists!: Table<ArtistEntity, ArtistId>;
  albums!: Table<AlbumEntity, AlbumId>;
  tags!: Table<TagEntity, TagId>;
  playlists!: Table<PlaylistEntity, PlaylistId>;
  folders!: Table<SidebarFolderEntity, SidebarFolderId>;
  listenEvents!: Table<ListenEventEntity, string>;
  covers!: Table<CoverEntity, string>;
  radioStations!: Table<RadioStationEntity, RadioStationId>;
  audioFeatures!: Table<AudioFeaturesEntity, TrackId>;
  trackChapters!: Table<TrackChapterEntity, TrackId>;
  offlineCopies!: Table<OfflineCopyEntity, TrackId>;
  downloadJobs!: Table<DownloadJobEntity, string>;

  constructor() {
    super("AudiogramDB");

    this.version(9).stores({
      tracks: "&id, title, artistName, albumTitle, *artistIds, albumId, *tagIds, state, likedAt, addedAt, duration, playCount, storagePath, fingerprint, [title+likedAt], [addedAt+likedAt], [duration+likedAt], [artistName+likedAt], [albumTitle+likedAt], [playCount+likedAt]",
      artists: "&id, name, updatedAt",
      albums: "&id, title, artistId, year, updatedAt, [artistId+year], [title+artistId]",
      tags: "&id, &name",
      playlists: "&id, name, updatedAt, addedAt",
      folders: "&id, name, updatedAt, addedAt",
      listenEvents: "&id, trackId, artistId, albumId, startedAt",
      covers: "&id, ownerType, ownerId, [ownerType+ownerId], updatedAt",
      radioStations: "&id, name, isFavorite, addedAt, lastPlayedAt",
      audioFeatures: "&trackId, analyzedAt, algorithmVersion",
      trackChapters: "&trackId, updatedAt",
    });

    this.version(10).stores({
      tracks: "&id, title, artistName, albumTitle, *artistIds, albumId, *tagIds, state, likedAt, addedAt, duration, playCount, storagePath, fingerprint, pinned, source, [title+likedAt], [addedAt+likedAt], [duration+likedAt], [artistName+likedAt], [albumTitle+likedAt], [playCount+likedAt]",
      offlineCopies: "&trackId",
      downloadJobs: "&id, status, batchId",
    }).upgrade(upgradeToV10);

    this.version(11).stores({}).upgrade(async (tx) => {
      await tx.table("trackChapters").delete("");
    });

    // Data normalization only — see upgradeToV12 for why it precedes v13.
    this.version(12).stores({}).upgrade(upgradeToV12);

    // Index-only change. A listed table gets its complete new index list;
    // tags / offlineCopies / radioStations are untouched.
    //   tracks:       - state, - source (never queried); + [albumId+pinned]
    //   artists:      - updatedAt; + pinned
    //   albums:       - year, updatedAt, [artistId+year], [title+artistId]; + pinned, [artistId+pinned]
    //   playlists:    - updatedAt, addedAt
    //   folders:      - name, updatedAt, addedAt
    //   listenEvents: - albumId
    //   covers:       - ownerId, updatedAt; [ownerType+ownerId] becomes unique
    //   audioFeatures:- analyzedAt
    //   trackChapters:- updatedAt
    //   downloadJobs: - batchId; + trackId, [trackId+status]
    this.version(13).stores({
      tracks: "&id, title, artistName, albumTitle, *artistIds, albumId, *tagIds, likedAt, addedAt, duration, playCount, storagePath, fingerprint, pinned, [albumId+pinned], [title+likedAt], [addedAt+likedAt], [duration+likedAt], [artistName+likedAt], [albumTitle+likedAt], [playCount+likedAt]",
      artists: "&id, name, pinned",
      albums: "&id, title, artistId, pinned, [artistId+pinned]",
      playlists: "&id, name",
      folders: "&id",
      listenEvents: "&id, trackId, artistId, startedAt",
      covers: "&id, ownerType, &[ownerType+ownerId]",
      audioFeatures: "&trackId, algorithmVersion",
      trackChapters: "&trackId",
      downloadJobs: "&id, status, trackId, [trackId+status]",
    });

    this.version(14).stores({}).upgrade(upgradeToV14);

    this.tracks = this.table("tracks");
    this.artists = this.table("artists");
    this.albums = this.table("albums");
    this.tags = this.table("tags");
    this.playlists = this.table("playlists");
    this.folders = this.table("folders");
    this.listenEvents = this.table("listenEvents");
    this.covers = this.table("covers");
    this.radioStations = this.table("radioStations");
    this.audioFeatures = this.table("audioFeatures");
    this.trackChapters = this.table("trackChapters");
    this.offlineCopies = this.table("offlineCopies");
    this.downloadJobs = this.table("downloadJobs");
  }
}

export const db = new AppDatabase();

/**
 * Explicit open so a failure is classified once, at startup, instead of
 * surfacing as an opaque error on the first query. Dexie still auto-opens
 * on first use, so callers that skip this keep working.
 */
export const openDatabase = async (): Promise<Result<void, DbError>> => {
  try {
    await db.open();
    return ok(undefined);
  }
  catch (error) {
    return err(toDbError(error));
  }
};

// Another connection (a second window/instance) is upgrading the schema.
// Dexie's default just closes this connection, after which every query dies
// with DatabaseClosedError; reloading picks up the new schema instead.
db.on("versionchange", () => {
  db.close();
  if (typeof window !== "undefined") window.location.reload();
});

db.on("blocked", () => {
  getLogger().warn("[DB] open() is blocked by another connection that has not closed yet");
});
