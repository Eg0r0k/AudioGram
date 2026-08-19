// Without these the first session after registration is uncontrolled and
// every /opfs/ URL falls through to the network (media error instead of
// playback until the app is reloaded).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
          // An unclamped end declares a Content-Length larger than the body,
          // which Chromium aborts as a length mismatch mid-playback.
          const end = match[2]
            ? Math.min(parseInt(match[2], 10), file.size - 1)
            : file.size - 1;

          if (start >= file.size || start > end) {
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${file.size}` },
            });
          }

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
