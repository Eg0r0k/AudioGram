import { db } from "@/db";
import type { TrackEntity } from "@/db/entities";
import type { TrackSortKey } from "@/modules/tracks/types";
import type { AlbumId, ArtistId, TagId, TrackId } from "@/types/ids";
import type { Collection } from "dexie";
import { Result, ok, err } from "neverthrow";
import { BaseRepository } from "./base.repository";

class TrackRepository extends BaseRepository<TrackEntity, TrackId> {
  constructor() {
    super(db.tracks);
  }

  private getSortedCollection(sortKey: TrackSortKey): Collection<TrackEntity, TrackId, TrackEntity> {
    switch (sortKey) {
      case "date_added_asc":
        return this.table.orderBy("addedAt");
      case "date_added_desc":
        return this.table.orderBy("addedAt").reverse();
      case "title_asc":
        return this.table.orderBy("title");
      case "title_desc":
        return this.table.orderBy("title").reverse();
      case "duration_asc":
        return this.table.orderBy("duration");
      case "duration_desc":
        return this.table.orderBy("duration").reverse();
      case "plays_desc":
        return this.table.orderBy("playCount").reverse();
      case "artist_asc":
        return this.table.orderBy("artistName").reverse();
      case "album_asc":
      case "album_desc":
        return this.table.orderBy("albumTitle");
      default:
        return this.table.orderBy("addedAt").reverse();
    }
  }

  async findByAlbumId(albumId: AlbumId): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.table
        .where("albumId")
        .equals(albumId)
        .sortBy("trackNo");
      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findByArtistId(artistId: ArtistId): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.table
        .where("artistIds")
        .equals(artistId)
        .toArray();
      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async deleteByAlbumId(albumId: AlbumId): Promise<Result<number, Error>> {
    try {
      const count = await this.table
        .where("albumId")
        .equals(albumId)
        .delete();
      return ok(count);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async deleteByArtistId(artistId: ArtistId): Promise<Result<number, Error>> {
    try {
      const count = await this.table
        .where("artistIds")
        .equals(artistId)
        .delete();
      return ok(count);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async countByAlbumId(albumId: AlbumId): Promise<Result<number, Error>> {
    try {
      const count = await this.table
        .where("albumId")
        .equals(albumId)
        .count();
      return ok(count);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async countByArtistId(artistId: ArtistId): Promise<Result<number, Error>> {
    try {
      const count = await this.table
        .where("artistIds")
        .equals(artistId)
        .count();

      return ok(count);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async sumDurationByAlbumId(albumId: AlbumId): Promise<Result<number, Error>> {
    try {
      const tracks = await this.table
        .where("albumId")
        .equals(albumId)
        .toArray();
      const total = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
      return ok(total);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async sumDurationByArtistId(artistId: ArtistId): Promise<Result<number, Error>> {
    try {
      const tracks = await this.table
        .where("artistIds")
        .equals(artistId)
        .toArray();
      const total = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
      return ok(total);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async sumDurationByTrackIds(trackIds: TrackId[]): Promise<Result<number, Error>> {
    try {
      if (trackIds.length === 0) {
        return ok(0);
      }
      const tracks = await this.table
        .where("id")
        .anyOf(trackIds)
        .toArray();
      const total = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
      return ok(total);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findByIds(ids: TrackId[]): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.table
        .where("id")
        .anyOf(ids)
        .toArray();

      const map = new Map(tracks.map(track => [track.id, track]));
      return ok(ids.flatMap(id => map.get(id) ? [map.get(id)!] : []));
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findPaginated(offset: number, limit: number): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.table
        .orderBy("addedAt")
        .reverse()
        .offset(offset)
        .limit(limit)
        .toArray();
      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findAllSorted(sortKey: TrackSortKey): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.getSortedCollection(sortKey).toArray();

      if (sortKey === "album_desc") {
        return ok(tracks.reverse());
      }

      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findSortedByIds(ids: TrackId[], sortKey: TrackSortKey): Promise<Result<TrackEntity[], Error>> {
    try {
      if (ids.length === 0) {
        return ok([]);
      }

      const idSet = new Set(ids);
      const sorted = await this.getSortedCollection(sortKey)
        .filter(track => idSet.has(track.id))
        .toArray();

      if (sortKey === "album_desc") {
        return ok(sorted.reverse());
      }

      return ok(sorted);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async countAll(): Promise<Result<number, Error>> {
    try {
      const count = await this.table.count();
      return ok(count);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async sumDurationAll(): Promise<Result<number, Error>> {
    try {
      const tracks = await this.table.toArray();
      const total = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
      return ok(total);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async setLiked(id: TrackId, isLiked: boolean): Promise<Result<void, Error>> {
    try {
      await this.table.update(id, {
        likedAt: isLiked ? Date.now() : undefined,
      });

      return ok(undefined);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async setLyricsPath(id: TrackId, lyricsPath: string): Promise<Result<void, Error>> {
    try {
      await this.table.update(id, {
        lyricsPath,
      });

      return ok(undefined);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async toggleLiked(id: TrackId, isLiked: boolean): Promise<Result<number | undefined, Error>> {
    try {
      const nextLikedAt = isLiked ? undefined : Date.now();

      await this.table.update(id, {
        likedAt: nextLikedAt,
      });

      return ok(nextLikedAt);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findLiked(): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.table
        .where("likedAt").above(0)
        .reverse()
        .toArray();
      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async sumDurationByLiked(): Promise<Result<number, Error>> {
    try {
      const tracks = await this.table.where("likedAt").above(0).toArray();
      return ok(tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0));
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findLikedPaginated(offset: number, limit: number): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.table
        .where("likedAt")
        .above(0)
        .reverse()
        .offset(offset)
        .limit(limit)
        .toArray();
      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async countLiked(): Promise<Result<number, Error>> {
    try {
      const count = await this.table
        .where("likedAt")
        .above(0)
        .count();
      return ok(count);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async addTagToTrack(trackId: TrackId, tagId: TagId): Promise<Result<void, Error>> {
    try {
      const track = await this.table.get(trackId);
      if (!track) {
        return err(new Error(`Track not found: ${trackId}`));
      }
      const currentTagIds = track.tagIds ?? [];
      if (currentTagIds.includes(tagId)) {
        return ok(undefined);
      }
      await this.table.update(trackId, {
        tagIds: [...currentTagIds, tagId],
      });
      return ok(undefined);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async removeTagFromTrack(trackId: TrackId, tagId: TagId): Promise<Result<void, Error>> {
    try {
      const track = await this.table.get(trackId);
      if (!track) {
        return err(new Error(`Track not found: ${trackId}`));
      }
      const currentTagIds = track.tagIds ?? [];
      const newTagIds = currentTagIds.filter(id => id !== tagId);
      await this.table.update(trackId, {
        tagIds: newTagIds,
      });
      return ok(undefined);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findByTagId(tagId: TagId): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.table
        .where("tagIds")
        .equals(tagId)
        .toArray();
      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findByAlbumIdPaginated(
    albumId: AlbumId,
    offset: number,
    limit: number,
  ): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.table
        .where("albumId")
        .equals(albumId)
        .offset(offset)
        .limit(limit)
        .sortBy("trackNo");
      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findByArtistIdPaginated(
    artistId: ArtistId,
    offset: number,
    limit: number,
  ): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.table
        .where("artistIds")
        .equals(artistId)
        .offset(offset)
        .limit(limit)
        .toArray();
      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findByStoragePath(path: string): Promise<Result<TrackEntity | undefined, Error>> {
    try {
      const track = await this.table.where("storagePath").equals(path).first();
      return ok(track);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async existsByFingerprint(fingerprint: string): Promise<Result<boolean, Error>> {
    try {
      const count = await this.table.where("fingerprint").equals(fingerprint).count();
      return ok(count > 0);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async getAllFingerprints(): Promise<Result<Set<string>, Error>> {
    try {
      const tracks = await this.table.where("fingerprint").above("").toArray();
      return ok(new Set(tracks.map(t => t.fingerprint).filter((fp): fp is string => !!fp)));
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findByStoragePathPrefix(prefix: string): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.table.where("storagePath").startsWith(prefix).toArray();
      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findAllIds(): Promise<Result<TrackId[], Error>> {
    try {
      const ids = await this.table.toCollection().primaryKeys() as TrackId[];
      return ok(ids);
    }
    catch (error) {
      return err(error as Error);
    }
  }
}

export const trackRepository = new TrackRepository();
