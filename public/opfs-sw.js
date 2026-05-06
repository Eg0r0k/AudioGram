self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith("/opfs/")) return;

  const opfsPath = decodeURIComponent(url.pathname.replace("/opfs/", ""));

  event.respondWith(
    navigator.storage.getDirectory().then(async (root) => {
      const parts = opfsPath.split("/").filter(Boolean);
      const filename = parts.pop();

      let dir = root;
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part);
      }

      const fileHandle = await dir.getFileHandle(filename);
      const file = await fileHandle.getFile();

      const rangeHeader = event.request.headers.get("range");

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : file.size - 1;
          const chunk = file.slice(start, end + 1);

          return new Response(chunk, {
            status: 206,
            headers: {
              "Content-Type": file.type || "audio/mpeg",
              "Content-Range": `bytes ${start}-${end}/${file.size}`,
              "Content-Length": String(end - start + 1),
              "Accept-Ranges": "bytes",
            },
          });
        }
      }

      return new Response(file, {
        status: 200,
        headers: {
          "Content-Type": file.type || "audio/mpeg",
          "Content-Length": String(file.size),
          "Accept-Ranges": "bytes",
        },
      });
    }).catch(() => new Response("Not found", { status: 404 })),
  );
});