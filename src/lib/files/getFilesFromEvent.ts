import { getFileFromEntry } from "./getFileFromEntry";
import { scanDirectory } from "./scanDirectory";

export const getFilesFromEvent = async (
  e: DragEvent | ClipboardEvent,
): Promise<File[]> => {
  const files: File[] = [];

  const dataTransfer
    = e instanceof DragEvent
      ? e.dataTransfer
      : (e).clipboardData;

  if (!dataTransfer) return files;

  if (dataTransfer.items.length) {
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          entries.push(entry);
        }
      }
    }

    for (const entry of entries) {
      if (entry.isFile) {
        files.push(await getFileFromEntry(entry as FileSystemFileEntry));
      }
      else if (entry.isDirectory) {
        const dirFiles = await scanDirectory(
          entry as FileSystemDirectoryEntry,
          entry.name,
        );
        files.push(...dirFiles);
      }
    }
  }
  else if (dataTransfer.files.length) {
    files.push(...Array.from(dataTransfer.files));
  }

  return files;
};
