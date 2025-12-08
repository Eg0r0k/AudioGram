export const getFileFromEntry = (
  entry: FileSystemFileEntry,
): Promise<File> => {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
};
