export function requestFiles(options?: {
  accept?: string;
  multiple?: boolean;
}): Promise<File[]> {
  const input = document.createElement("input");
  input.type = "file";
  input.style.display = "none";

  if (options?.accept) {
    input.accept = options.accept;
  }

  if (options?.multiple) {
    input.multiple = true;
  }

  document.body.append(input);

  const promise = new Promise<File[]>((resolve, reject) => {
    input.addEventListener(
      "change",
      (e: Event) => {
        const files = Array.from((e.target as HTMLInputElement).files || []);
        if (files.length === 0) {
          reject(new Error("NO_FILE_SELECTED"));
          return;
        }
        resolve(files);
      },
      {
        once: true,
      }
    );
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (input.files?.length === 0) {
            reject(new Error("CANCELLED"));
          }
        }, 300);
      },
      { once: true }
    );
  }).finally(() => {
    input.remove();
  });
  input.click();

  return promise;
}
