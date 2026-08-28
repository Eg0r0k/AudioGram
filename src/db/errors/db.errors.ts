//
// Typed wrapper over Dexie/IndexedDB failures. Repositories return this in
// their `err` branch so callers can react to the few cases that matter
// (quota, version mismatch, upgrade failure) instead of pattern-matching on
// message strings.
//
export type DbErrorCode
  /** Installed database version is newer than the schema this build declares (app downgrade). */
  = | "VERSION"
  /** A `.upgrade()` handler threw — the database could not be migrated. */
    | "UPGRADE"
  /** Browser/WebView storage quota exhausted. */
    | "QUOTA"
  /** Connection closed (after `versionchange` from another instance). */
    | "CLOSED"
  /** Unique-key violation, including a `BulkError` from bulkAdd/bulkPut. */
    | "CONSTRAINT"
    | "UNKNOWN";

export class DbError extends Error {
  constructor(
    public readonly code: DbErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DbError";
  }
}

const NAME_TO_CODE: Record<string, DbErrorCode> = {
  VersionError: "VERSION",
  UpgradeError: "UPGRADE",
  QuotaExceededError: "QUOTA",
  DatabaseClosedError: "CLOSED",
  ConstraintError: "CONSTRAINT",
  BulkError: "CONSTRAINT",
};

const errorName = (value: unknown): string =>
  typeof value === "object" && value !== null && "name" in value
    ? String((value as { name?: unknown }).name)
    : "";

// Dexie surfaces some native failures wrapped (an AbortError whose `inner`
// is the QuotaExceededError that actually aborted the transaction).
const innerOf = (value: unknown): unknown =>
  typeof value === "object" && value !== null && "inner" in value
    ? (value as { inner?: unknown }).inner
    : undefined;

export const toDbError = (error: unknown): DbError => {
  if (error instanceof DbError) return error;

  const code = NAME_TO_CODE[errorName(error)] ?? NAME_TO_CODE[errorName(innerOf(error))] ?? "UNKNOWN";
  const message = error instanceof Error ? error.message : String(error);

  return new DbError(code, message, error);
};
