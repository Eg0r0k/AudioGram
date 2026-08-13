import type { Transaction } from "dexie";
import type { PinnedFlag } from "./entities";

/**
 * v10 upgrade transform: every row existing before the multi-source schema is
 * a real library member, so it gets `pinned = 1`. Kept as a standalone
 * function so the transform is unit-testable without IndexedDB.
 */
export function markPinned(row: { pinned?: PinnedFlag }): void {
  row.pinned = 1;
}

/** Minimal slice of Dexie's Transaction the v10 upgrade actually touches. */
export type UpgradeTransaction = Pick<Transaction, "table">;

export async function upgradeToV10(tx: UpgradeTransaction): Promise<void> {
  await Promise.all(
    ["tracks", "albums", "artists"].map(name =>
      tx.table(name).toCollection().modify(markPinned),
    ),
  );
}
