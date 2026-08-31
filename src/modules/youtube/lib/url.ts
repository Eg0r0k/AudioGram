export type YtLinkTarget
  = | { kind: "playlist"; id: string }
    | { kind: "album"; id: string }
    | { kind: "artist"; id: string }
    | { kind: "video"; id: string };

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

// Personal (WL/LL) and auto-generated mix (RD…) lists are not resolvable
// through the anonymous playlist endpoint — fall back to text search.
const isOpenablePlaylistId = (id: string): boolean =>
  id.length > 0 && id !== "WL" && id !== "LL" && !id.startsWith("RD");

const VIDEO_ID_RE = /^[\w-]{11}$/;

export const parseYoutubeCollectionUrl = (input: string): YtLinkTarget | null => {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  }
  catch {
    return null;
  }
  if (!YT_HOSTS.has(url.hostname.toLowerCase())) return null;

  const list = url.searchParams.get("list");
  if (list && isOpenablePlaylistId(list)) {
    return { kind: "playlist", id: list };
  }

  const album = /^\/browse\/(MPREb[\w-]+)$/.exec(url.pathname);
  if (album) return { kind: "album", id: album[1] };

  const artist = /^\/channel\/(UC[\w-]+)$/.exec(url.pathname);
  if (artist) return { kind: "artist", id: artist[1] };

  const video = url.searchParams.get("v")
    ?? /^\/shorts\/([\w-]{11})$/.exec(url.pathname)?.[1]
    ?? (url.hostname.toLowerCase() === "youtu.be" ? url.pathname.slice(1) : null);
  if (video && VIDEO_ID_RE.test(video)) {
    return { kind: "video", id: video };
  }

  return null;
};
