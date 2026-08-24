import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: fetchMock }));

import {
  mapHttpStatus,
  mapSubsonicErrorCode,
  parseSubsonicBody,
  randomSalt,
  subsonicAuthParams,
  subsonicFetch,
  subsonicUrl,
  type NdConfig,
} from "../subsonic";

// The canonical example from the public Subsonic API docs — not a real
// credential: password "sesame" + salt "c19b2d".
const DOCS_CONFIG: NdConfig = {
  baseUrl: "https://demo.example",
  username: "joe",
  password: "sesame",
};
const DOCS_SALT = "c19b2d";
const DOCS_TOKEN = "26719a1196d2a940705a59634eb18eab";

describe("subsonicAuthParams", () => {
  it("builds the documented token for the docs example", () => {
    expect(subsonicAuthParams(DOCS_CONFIG, DOCS_SALT)).toEqual({
      u: "joe",
      t: DOCS_TOKEN,
      s: DOCS_SALT,
      v: "1.16.1",
      c: "audiogram",
      f: "json",
    });
  });

  it("uses a fresh salt per call, changing the token", () => {
    const first = subsonicAuthParams(DOCS_CONFIG);
    const second = subsonicAuthParams(DOCS_CONFIG);

    expect(first.s).not.toBe(second.s);
    expect(first.t).not.toBe(second.t);
    expect(first.t).not.toContain("sesame");
  });
});

describe("randomSalt", () => {
  it("returns 16 hex chars", () => {
    expect(randomSalt()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("subsonicUrl", () => {
  it("targets /rest/<endpoint> with auth and extra params, trimming trailing slashes", () => {
    const url = new URL(subsonicUrl({ ...DOCS_CONFIG, baseUrl: "https://demo.example/" }, "getAlbum", { id: "al-1" }, DOCS_SALT));

    expect(url.origin).toBe("https://demo.example");
    expect(url.pathname).toBe("/rest/getAlbum");
    expect(url.searchParams.get("id")).toBe("al-1");
    expect(url.searchParams.get("t")).toBe(DOCS_TOKEN);
    expect(url.searchParams.get("f")).toBe("json");
  });
});

describe("mapSubsonicErrorCode", () => {
  it("maps 40/41 to AUTH, 70 to NOT_FOUND, 0 and unknown to UNKNOWN", () => {
    expect(mapSubsonicErrorCode(40, "m").kind).toBe("AUTH");
    expect(mapSubsonicErrorCode(41, "m").kind).toBe("AUTH");
    expect(mapSubsonicErrorCode(70, "m").kind).toBe("NOT_FOUND");
    expect(mapSubsonicErrorCode(0, "m").kind).toBe("UNKNOWN");
    expect(mapSubsonicErrorCode(50, "m").kind).toBe("UNKNOWN");
    expect(mapSubsonicErrorCode(undefined, "m").kind).toBe("UNKNOWN");
  });
});

describe("parseSubsonicBody", () => {
  it("returns the envelope payload on ok", () => {
    const parsed = parseSubsonicBody<{ song: { id: string } }>({
      "subsonic-response": { status: "ok", version: "1.16.1", song: { id: "s1" } },
    });

    expect(parsed).toMatchObject({ ok: true, value: { song: { id: "s1" } } });
  });

  it("maps a failed envelope through the error codes", () => {
    const parsed = parseSubsonicBody({
      "subsonic-response": { status: "failed", error: { code: 40, message: "Wrong username or password" } },
    });

    expect(parsed).toEqual({ ok: false, error: { kind: "AUTH", message: "Wrong username or password" } });
  });

  it("flags a missing envelope as PARSE", () => {
    expect(parseSubsonicBody({ nope: true })).toMatchObject({ ok: false, error: { kind: "PARSE" } });
    expect(parseSubsonicBody(null)).toMatchObject({ ok: false, error: { kind: "PARSE" } });
  });
});

interface ResponseStub {
  ok?: boolean;
  status?: number;
  contentType?: string;
  body: string;
}

const respond = ({ ok = true, status = 200, contentType = "application/json", body }: ResponseStub) => ({
  ok,
  status,
  headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) },
  text: () => Promise.resolve(body),
});

const respondJson = (body: unknown) => respond({ body: JSON.stringify(body) });

describe("mapHttpStatus", () => {
  it("separates expired credentials from a server that is down", () => {
    expect(mapHttpStatus(401, "ping").kind).toBe("AUTH");
    expect(mapHttpStatus(403, "ping").kind).toBe("AUTH");
    expect(mapHttpStatus(404, "ping").kind).toBe("NOT_FOUND");
    expect(mapHttpStatus(500, "ping").kind).toBe("UNAVAILABLE");
    expect(mapHttpStatus(502, "ping").kind).toBe("UNAVAILABLE");
    expect(mapHttpStatus(418, "ping").kind).toBe("UNKNOWN");
  });

  it("names the endpoint and the status in the message", () => {
    expect(mapHttpStatus(503, "getArtists").message).toBe("getArtists failed with HTTP 503");
  });
});

describe("subsonicFetch", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("resolves the typed payload for an ok response", async () => {
    fetchMock.mockResolvedValue(
      respondJson({ "subsonic-response": { status: "ok", playlists: { playlist: [] } } }),
    );

    const result = await subsonicFetch<{ playlists: { playlist: unknown[] } }>(DOCS_CONFIG, "getPlaylists");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().playlists).toEqual({ playlist: [] });
    const requested = fetchMock.mock.calls[0][0] as string;
    expect(requested).toContain("/rest/getPlaylists?");
    expect(requested).not.toContain("sesame");
  });

  it("maps transport failures to NETWORK", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    const result = await subsonicFetch(DOCS_CONFIG, "ping");

    expect(result._unsafeUnwrapErr()).toEqual({ kind: "NETWORK", message: "Request to ping failed" });
  });

  it("classifies an HTTP failure by status instead of trying to parse it", async () => {
    // A proxy in front of Navidrome answering with its own error page: the
    // body is HTML, but the status is what actually explains the failure.
    fetchMock.mockResolvedValue(respond({
      ok: false,
      status: 502,
      contentType: "text/html",
      body: "<html><body>502 Bad Gateway</body></html>",
    }));

    const error = (await subsonicFetch(DOCS_CONFIG, "getAlbumList2"))._unsafeUnwrapErr();

    expect(error.kind).toBe("UNAVAILABLE");
    expect(error.message).toContain("502");
  });

  it("reports an expired session as AUTH, not as a parse failure", async () => {
    fetchMock.mockResolvedValue(respond({ ok: false, status: 401, contentType: "text/html", body: "denied" }));

    expect((await subsonicFetch(DOCS_CONFIG, "getArtists"))._unsafeUnwrapErr().kind).toBe("AUTH");
  });

  it("puts the content-type and the body into a PARSE error", async () => {
    fetchMock.mockResolvedValue(respond({
      contentType: "text/html",
      body: "<!doctype html><title>Just a moment...</title>",
    }));

    const error = (await subsonicFetch(DOCS_CONFIG, "getArtists"))._unsafeUnwrapErr();

    expect(error.kind).toBe("PARSE");
    expect(error.message).toContain("getArtists");
    expect(error.message).toContain("text/html");
    expect(error.message).toContain("Just a moment");
  });

  it("truncates an oversized body so one bad response cannot flood the log", async () => {
    fetchMock.mockResolvedValue(respond({ contentType: "text/html", body: "x".repeat(50_000) }));

    const error = (await subsonicFetch(DOCS_CONFIG, "getArtists"))._unsafeUnwrapErr();

    expect(error.message.length).toBeLessThan(400);
  });

  it("maps api errors through the code table", async () => {
    fetchMock.mockResolvedValue(respondJson({
      "subsonic-response": { status: "failed", error: { code: 70, message: "not found" } },
    }));

    expect((await subsonicFetch(DOCS_CONFIG, "getAlbum", { id: "x" }))._unsafeUnwrapErr().kind).toBe("NOT_FOUND");
  });
});
