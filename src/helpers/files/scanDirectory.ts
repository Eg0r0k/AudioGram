import { getFileFromEntry } from "./getFileFromEntry";

export const scanDirectory = async (
  dirEntry: FileSystemDirectoryEntry,
  path: string = ""
): Promise<File[]> => {
  const files: File[] = [];
  const dirReader = dirEntry.createReader();
  const readAllEntries = (): Promise<FileSystemEntry[]> => {
    return new Promise((resolve) => {
      const allEntries: FileSystemEntry[] = [];

      const readBatch = () => {
        dirReader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...entries);
            readBatch();
          }
        });
      };

      readBatch();
    });
  };

  const entries = await readAllEntries();

  for (const entry of entries) {
    if (entry.isFile) {
      const file = await getFileFromEntry(entry as FileSystemFileEntry);
      if (file) {
        Object.defineProperty(file, "relativePath", {
          value: path ? `${path}/${file.name}` : file.name,
          writable: false,
        });
        files.push(file);
      }
    } else if (entry.isDirectory) {
      const subPath = path ? `${path}/${entry.name}` : entry.name;
      const subFiles = await scanDirectory(
        entry as FileSystemDirectoryEntry,
        subPath
      );
      files.push(...subFiles);
    }
  }

  return files;
};
