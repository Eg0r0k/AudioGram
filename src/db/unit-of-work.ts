import { err, ok, Result } from "neverthrow";
import { db } from ".";
import { Table } from "dexie";
import { toDbError } from "@/db/errors/db.errors";

type RwCallback<T> = () => Promise<T>;

export class UnitOfWork {
  async run<T>(callback: RwCallback<T>): Promise<Result<T, Error>> {
    try {
      const result = await db.transaction("rw", db.tables, callback);
      return ok(result);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async runScoped<T>(
    tables: Table[],
    callback: RwCallback<T>,
  ): Promise<Result<T, Error>> {
    try {
      const result = await db.transaction("rw", tables, callback);
      return ok(result);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }
}

export const unitOfWork = new UnitOfWork();
