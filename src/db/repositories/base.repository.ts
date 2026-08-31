import type { Table, UpdateSpec } from "dexie";
import type { Result } from "neverthrow";
import { ok, err } from "neverthrow";
import { toDbError } from "@/db/errors/db.errors";

export abstract class BaseRepository<TEntity, TId> {
  constructor(protected table: Table<TEntity, TId>) {}

  async findById(id: TId): Promise<Result<TEntity | undefined, Error>> {
    try {
      const entity = await this.table.get(id);
      return ok(entity);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async findAll(): Promise<Result<TEntity[], Error>> {
    try {
      const entities = await this.table.toArray();
      return ok(entities);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async findByIds(ids: TId[]): Promise<Result<TEntity[], Error>> {
    try {
      const results = await this.table.bulkGet(ids);
      const entities = results.filter((e): e is TEntity => e !== undefined);
      return ok(entities);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async create(entity: TEntity): Promise<Result<TId, Error>> {
    try {
      const id = await this.table.add(entity);
      return ok(id as TId);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async update(id: TId, changes: Partial<TEntity>): Promise<Result<number, Error>> {
    try {
      const count = await this.table.update(id, changes as UpdateSpec<TEntity>);
      return ok(count);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async delete(id: TId): Promise<Result<void, Error>> {
    try {
      await this.table.delete(id);
      return ok(undefined);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async createMany(entities: TEntity[]): Promise<Result<TId[], Error>> {
    try {
      const ids = await this.table.bulkAdd(entities, { allKeys: true });
      return ok(ids);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async upsert(entity: TEntity): Promise<Result<TId, Error>> {
    try {
      return ok((await this.table.put(entity)) as TId);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async upsertMany(entities: TEntity[]): Promise<Result<TId[], Error>> {
    try {
      const ids = await this.table.bulkPut(entities, { allKeys: true });
      return ok(ids);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async updateMany(
    updates: { key: TId; changes: UpdateSpec<TEntity> }[],
  ): Promise<Result<number, Error>> {
    try {
      const count = await this.table.bulkUpdate(updates);
      return ok(count);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async deleteMany(ids: TId[]): Promise<Result<void, Error>> {
    try {
      await this.table.bulkDelete(ids);
      return ok(undefined);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }
}
