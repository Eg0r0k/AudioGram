//
// Recognizes pasted YouTube collection links so the search pane can open the
// entity directly instead of text-searching the URL string.
//

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

/**
 * Maps a pasted YouTube URL onto an in-app target: any `list=` playlist
 * (including OLAK5uy_ album-playlists, which the playlist page resolves),
 * `/browse/MPREb…` music albums, `/channel/UC…` artists, and plain videos —
 * `watch?v=`, `youtu.be/<id>`, `/shorts/<id>`. A mix link (`list=RD…`) falls
 * back to its `v=` video, since the session-generated mix itself cannot be
 * fetched anonymously. Returns null for plain text and foreign hosts.
 */
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

  const album = url.pathname.match(/^\/browse\/(MPREb[\w-]+)$/);
  if (album) return { kind: "album", id: album[1] };

  const artist = url.pathname.match(/^\/channel\/(UC[\w-]+)$/);
  if (artist) return { kind: "artist", id: artist[1] };

  const video = url.searchParams.get("v")
    ?? url.pathname.match(/^\/shorts\/([\w-]{11})$/)?.[1]
    ?? (url.hostname.toLowerCase() === "youtu.be" ? url.pathname.slice(1) : null);
  if (video && VIDEO_ID_RE.test(video)) {
    return { kind: "video", id: video };
  }

  return null;
};
