export const getFileFromEntry = (
  entry: FileSystemFileEntry
): Promise<File | null> => {
  return new Promise((resolve) => {
    entry.file((file) => resolve(file));
    () => resolve(null);
  });
};
