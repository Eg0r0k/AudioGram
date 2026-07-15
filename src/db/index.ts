import Dexie, { type Table } from "dexie";
import {
  AlbumEntity,
  ArtistEntity,
  AudioFeaturesEntity,
  CoverEntity,
  ListenEventEntity,
  PlaylistEntity,
  RadioStationEntity,
  SidebarFolderEntity,
  TagEntity,
  TrackChapterEntity,
  TrackEntity,
} from "./entities";
import { AlbumId, ArtistId, PlaylistId, RadioStationId, SidebarFolderId, TagId, TrackId } from "@/types/ids";

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
  }
}

export const db = new AppDatabase();
