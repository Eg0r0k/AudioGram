import { getFileFromEntry } from "./getFileFromEntry";

/**
 * readEntries hands over a batch at a time and signals the end with an empty
 * one, so a directory is only fully read after repeated calls.
 */
const readAllEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
  new Promise((resolve) => {
    const allEntries: FileSystemEntry[] = [];

    const readBatch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(allEntries);
        }
        else {
          allEntries.push(...entries);
          readBatch();
        }
      });
    };

    readBatch();
  });

export const scanDirectory = async (
  dirEntry: FileSystemDirectoryEntry,
  path: string = "",
): Promise<File[]> => {
  const files: File[] = [];
  const entries = await readAllEntries(dirEntry.createReader());

  for (const entry of entries) {
    if (entry.isFile) {
      const file = await getFileFromEntry(entry as FileSystemFileEntry);
      Object.defineProperty(file, "relativePath", {
        value: path ? `${path}/${file.name}` : file.name,
        writable: false,
      });
      files.push(file);
    }
    else if (entry.isDirectory) {
      const subPath = path ? `${path}/${entry.name}` : entry.name;
      const subFiles = await scanDirectory(
        entry as FileSystemDirectoryEntry,
        subPath,
      );
      files.push(...subFiles);
    }
  }

  return files;
};
