import pLimit from "p-limit";

/**
 * Serializes the import pipeline: the EntityResolver cache is per-instance,
 * so concurrent imports would mint duplicate artist/album rows.
 */
export const importQueue = pLimit(1);
