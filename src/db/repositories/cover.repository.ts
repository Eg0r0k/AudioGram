import { db } from "@/db";
import type { CoverEntity, CoverOwnerType } from "@/db/entities";
import type { AlbumId, ArtistId, PlaylistId } from "@/types/ids";
import { err, ok, type Result } from "neverthrow";
import { toDbError } from "@/db/errors/db.errors";

class CoverRepository {
  async findByOwner(
    ownerType: CoverOwnerType,
    ownerId: string,
  ): Promise<Result<CoverEntity | undefined, Error>> {
    try {
      const cover = await db.covers
        .where("[ownerType+ownerId]")
        .equals([ownerType, ownerId])
        .first();

      return ok(cover);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async getAlbumCover(
    albumId: AlbumId,
  ): Promise<Result<CoverEntity | undefined, Error>> {
    return this.findByOwner("album", albumId);
  }

  async getPlaylistCover(
    playlistId: PlaylistId,
  ): Promise<Result<CoverEntity | undefined, Error>> {
    return this.findByOwner("playlist", playlistId);
  }

  async getArtistCover(
    artistId: ArtistId,
  ): Promise<Result<CoverEntity | undefined, Error>> {
    return this.findByOwner("artist", artistId);
  }

  async upsertOwnerCover(
    ownerType: CoverOwnerType,
    ownerId: string,
    blob: Blob,
  ): Promise<Result<string, Error>> {
    try {
      // find + write inside one transaction: two concurrent upserts for the
      // same owner would otherwise both miss and the second add() would hit
      // the unique [ownerType+ownerId] key.
      const id = await db.transaction("rw", db.covers, async () => {
        const now = Date.now();
        const mimeType = blob.type || "image/jpeg";
        const existing = await db.covers
          .where("[ownerType+ownerId]")
          .equals([ownerType, ownerId])
          .first();

        if (existing) {
          await db.covers.update(existing.id, { blob, mimeType, updatedAt: now });
          return existing.id;
        }

        const freshId = crypto.randomUUID();
        await db.covers.add({
          id: freshId,
          ownerType,
          ownerId,
          blob,
          mimeType,
          addedAt: now,
          updatedAt: now,
        });
        return freshId;
      });

      return ok(id);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async upsertAlbumCover(
    albumId: AlbumId,
    blob: Blob,
  ): Promise<Result<string, Error>> {
    return this.upsertOwnerCover("album", albumId, blob);
  }

  async upsertPlaylistCover(
    playlistId: PlaylistId,
    blob: Blob,
  ): Promise<Result<string, Error>> {
    return this.upsertOwnerCover("playlist", playlistId, blob);
  }

  async upsertArtistCover(
    artistId: ArtistId,
    blob: Blob,
  ): Promise<Result<string, Error>> {
    return this.upsertOwnerCover("artist", artistId, blob);
  }

  async createMany(covers: CoverEntity[]): Promise<Result<void, Error>> {
    try {
      await db.covers.bulkAdd(covers);
      return ok(undefined);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async deleteByOwner(
    ownerType: CoverOwnerType,
    ownerId: string,
  ): Promise<Result<void, Error>> {
    try {
      const existing = await db.covers
        .where("[ownerType+ownerId]")
        .equals([ownerType, ownerId])
        .first();

      if (existing) {
        await db.covers.delete(existing.id);
      }

      return ok(undefined);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async deleteAlbumCover(albumId: AlbumId): Promise<Result<void, Error>> {
    return this.deleteByOwner("album", albumId);
  }

  async deletePlaylistCover(playlistId: PlaylistId): Promise<Result<void, Error>> {
    return this.deleteByOwner("playlist", playlistId);
  }

  async deleteArtistCover(artistId: ArtistId): Promise<Result<void, Error>> {
    return this.deleteByOwner("artist", artistId);
  }
}

export const coverRepository = new CoverRepository();
