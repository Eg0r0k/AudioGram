export const filterFilesByExtension = (
  files: File[],
  extensions: readonly string[],
): File[] => {
  if (!extensions.length) return files;

  return files.filter(file =>
    extensions.some(ext =>
      file.name.toLowerCase().endsWith(ext.toLowerCase()),
    ),
  );
};

export const filterFilesByType = (files: File[], types: string[]): File[] => {
  if (!types.length) return files;

  return files.filter(file =>
    types.some((type) => {
      if (type.endsWith("/*")) {
        return file.type.startsWith(type.replace("/*", "/"));
      }
      return file.type === type;
    }),
  );
};

export const normalizePath = (path: string): string => {
  const normalizedPath = path.replace(/\\/g, "/");
  let end = normalizedPath.length;

  while (end > 0 && normalizedPath[end - 1] === "/") {
    end -= 1;
  }

  return normalizedPath.slice(0, end);
};
