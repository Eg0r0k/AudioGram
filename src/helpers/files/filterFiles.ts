export const filterFilesByExtension = (
  files: File[],
  extensions: string[]
): File[] => {
  if (!extensions.length) return files;

  return files.filter((file) =>
    extensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext.toLowerCase())
    )
  );
};

export const filterFilesByType = (files: File[], types: string[]): File[] => {
  if (!types.length) return files;

  return files.filter((file) =>
    types.some((type) => {
      if (type.endsWith("/*")) {
        return file.type.startsWith(type.replace("/*", "/"));
      }
      return file.type === type;
    })
  );
};
