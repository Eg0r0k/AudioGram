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

  /**
   * Library-list scope: shadow rows (pinned = 0) exist only so history,
   * stats and the persisted queue keep valid FKs — "All music" style
   * listings and library counts must never surface them. Point lookups
   * (findById/findByIds) and deletion cascades stay unscoped on purpose.
   */
  private isLibraryMember(track: TrackEntity): boolean {
    return track.pinned !== 0;
  }

  private getSortedCollection(sortKey: TrackSortKey): Collection<TrackEntity, TrackId, TrackEntity> {
    return this.getSortedAllCollection(sortKey).filter(track => this.isLibraryMember(track));
  }

  private getSortedAllCollection(sortKey: TrackSortKey): Collection<TrackEntity, TrackId, TrackEntity> {
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
        return this.table.orderBy("artistName");
      case "album_asc":
        return this.table.orderBy("albumTitle");
      case "album_desc":
        return this.table.orderBy("albumTitle").reverse();
      default:
        return this.table.orderBy("addedAt").reverse();
    }
  }

  private getSortField(sortKey: TrackSortKey): string {
    switch (sortKey) {
      case "title_asc": case "title_desc": return "title";
      case "duration_asc": case "duration_desc": return "duration";
      case "plays_desc": return "playCount";
      case "artist_asc": return "artistName";
      case "album_asc": case "album_desc": return "albumTitle";
      case "date_added_asc": case "date_added_desc": return "addedAt";
      default: return "addedAt";
    }
  }

  private getSortedLikedCollection(sortKey: TrackSortKey): Collection<TrackEntity, TrackId> {
    const field = this.getSortField(sortKey);
    const compoundKey = `[${field}+likedAt]`;
    const isNumeric = ["addedAt", "duration", "playCount"].includes(field);
    const isDesc = sortKey.endsWith("_desc");
    const collection = this.table.where(compoundKey).between(
      isNumeric ? [0, 1] : ["", 1],
      isNumeric ? [Infinity, Infinity] : ["\uffff", Infinity],
    );
    return isDesc ? collection.reverse() : collection;
  }

  async findLikedSorted(sortKey: TrackSortKey): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.getSortedLikedCollection(sortKey).toArray();
      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findLikedSortedPaginated(
    sortKey: TrackSortKey,
    offset: number,
    limit: number,
  ): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.getSortedLikedCollection(sortKey)
        .offset(offset)
        .limit(limit)
        .toArray();
      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findAllSortedPaginated(
    sortKey: TrackSortKey,
    offset: number,
    limit: number,
  ): Promise<Result<TrackEntity[], Error>> {
    try {
      const tracks = await this.getSortedCollection(sortKey)
        .offset(offset)
        .limit(limit)
        .toArray();

      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findByAlbumId(albumId: AlbumId): Promise<Result<TrackEntity[], Error>> {
    try {
      const all = await this.table
        .where("albumId")
        .equals(albumId)
        .toArray();
      all.sort((a, b) =>
        (a.diskNo ?? 1) - (b.diskNo ?? 1) || (a.trackNo ?? 0) - (b.trackNo ?? 0),
      );
      return ok(all);
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

  async countByAlbumIds(albumIds: AlbumId[]): Promise<Result<Map<AlbumId, number>, Error>> {
    try {
      const counts = new Map<AlbumId, number>();
      for (const albumId of albumIds) counts.set(albumId, 0);
      if (albumIds.length > 0) {
        await this.table
          .where("albumId")
          .anyOf(albumIds)
          .each((track) => {
            if (!this.isLibraryMember(track)) return;
            counts.set(track.albumId, (counts.get(track.albumId) ?? 0) + 1);
          });
      }
      return ok(counts);
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
        .and(track => this.isLibraryMember(track))
        .count();

      return ok(count);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async countByArtistIds(artistIds: ArtistId[]): Promise<Result<Map<ArtistId, number>, Error>> {
    try {
      const counts = new Map<ArtistId, number>();
      for (const id of artistIds) counts.set(id, 0);
      if (artistIds.length > 0) {
        const wanted = new Set<string>(artistIds);
        // distinct(): the multi-entry index emits a row once per matching
        // artistId — count each track once per artist via its own ids instead.
        await this.table
          .where("artistIds")
          .anyOf(artistIds)
          .distinct()
          .each((track) => {
            if (!this.isLibraryMember(track)) return;
            for (const id of track.artistIds) {
              if (!wanted.has(id)) continue;
              counts.set(id, (counts.get(id) ?? 0) + 1);
            }
          });
      }
      return ok(counts);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async sumDurationByAlbumId(albumId: AlbumId): Promise<Result<number, Error>> {
    try {
      let total = 0;
      await this.table
        .where("albumId")
        .equals(albumId)
        .each((track) => { total += track.duration ?? 0; });
      return ok(total);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async sumDurationByArtistId(artistId: ArtistId): Promise<Result<number, Error>> {
    try {
      let total = 0;
      await this.table
        .where("artistIds")
        .equals(artistId)
        .each((track) => { total += track.duration ?? 0; });
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
      let total = 0;
      await this.table
        .where("id")
        .anyOf(trackIds)
        .each((track) => { total += track.duration ?? 0; });
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
        .filter(track => this.isLibraryMember(track))
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

      const field = this.getSortField(sortKey);
      const isDesc = sortKey.endsWith("_desc");

      const tracks = await this.table
        .where("id")
        .anyOf(ids)
        .sortBy(field);

      if (isDesc) {
        tracks.reverse();
      }

      return ok(tracks);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async countAll(): Promise<Result<number, Error>> {
    try {
      const count = await this.table.where("pinned").equals(1).count();
      return ok(count);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async sumDurationAll(): Promise<Result<number, Error>> {
    try {
      let total = 0;
      await this.table.where("pinned").equals(1).each((track) => {
        total += track.duration ?? 0;
      });
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
      let total = 0;
      await this.table
        .where("likedAt")
        .above(0)
        .each((track) => { total += track.duration ?? 0; });
      return ok(total);
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
      const all = await this.table
        .where("albumId")
        .equals(albumId)
        .toArray();
      all.sort((a, b) =>
        (a.diskNo ?? 1) - (b.diskNo ?? 1) || (a.trackNo ?? 0) - (b.trackNo ?? 0),
      );
      return ok(all.slice(offset, offset + limit));
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
        .and(track => this.isLibraryMember(track))
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
      const keys = await this.table.where("fingerprint").above("").uniqueKeys();
      return ok(new Set(keys as string[]));
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
