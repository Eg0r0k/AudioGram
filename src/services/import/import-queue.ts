import pLimit from "p-limit";

/**
 * Global serialization of the import pipeline. The EntityResolver cache is
 * per-instance, so two imports resolving the same artist name concurrently
 * (watched-folder sync + drag&drop + open-with) would each mint a fresh id
 * and persist duplicate rows GC never merges. Every entry point of the
 * import subsystem runs through this queue so a resolver always sees the
 * rows the previous import committed.
 */
export const importQueue = pLimit(1);
