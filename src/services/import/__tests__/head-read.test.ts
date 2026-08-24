import { describe, expect, it } from "vitest";
import { INITIAL_METADATA_READ, MAX_METADATA_READ } from "../constants";
import { initialHeadReadSize, m4aHasMoov, mp3HasVbrHeader } from "../head-read";

const id3Header = (tagSize: number): number[] => [
  0x49, 0x44, 0x33, 3, 0, 0,
  (tagSize >> 21) & 0x7F, (tagSize >> 14) & 0x7F, (tagSize >> 7) & 0x7F, tagSize & 0x7F,
];

const ascii = (s: string): number[] => [...s].map(c => c.charCodeAt(0));

describe("initialHeadReadSize", () => {
  it("starts head-complete formats with the small read", () => {
    expect(initialHeadReadSize("mp3", MAX_METADATA_READ)).toBe(INITIAL_METADATA_READ);
    expect(initialHeadReadSize("flac", MAX_METADATA_READ)).toBe(INITIAL_METADATA_READ);
    expect(initialHeadReadSize("m4a", MAX_METADATA_READ)).toBe(INITIAL_METADATA_READ);
  });

  it("never reads beyond the file itself", () => {
    expect(initialHeadReadSize("mp3", 4096)).toBe(4096);
  });

  it("keeps the full read for formats whose duration needs the tail", () => {
    expect(initialHeadReadSize("wav", MAX_METADATA_READ)).toBe(MAX_METADATA_READ);
    expect(initialHeadReadSize("ogg", MAX_METADATA_READ)).toBe(MAX_METADATA_READ);
    expect(initialHeadReadSize("opus", MAX_METADATA_READ)).toBe(MAX_METADATA_READ);
  });
});

describe("mp3HasVbrHeader", () => {
  it("finds Xing right after the ID3 tag", () => {
    const tagSize = 256;
    const bytes = new Uint8Array(8192);
    bytes.set(id3Header(tagSize), 0);
    bytes.set(ascii("Xing"), 10 + tagSize + 36);
    expect(mp3HasVbrHeader(bytes)).toBe(true);
  });

  it("finds Info and VBRI markers", () => {
    for (const marker of ["Info", "VBRI"]) {
      const bytes = new Uint8Array(4096);
      bytes.set(ascii(marker), 21);
      expect(mp3HasVbrHeader(bytes)).toBe(true);
    }
  });

  it("handles files without an ID3 tag", () => {
    const bytes = new Uint8Array(4096);
    bytes.set(ascii("Xing"), 13);
    expect(mp3HasVbrHeader(bytes)).toBe(true);
  });

  it("returns false for a plain CBR head", () => {
    const bytes = new Uint8Array(8192);
    bytes.set(id3Header(64), 0);
    expect(mp3HasVbrHeader(bytes)).toBe(false);
  });

  it("returns false when the ID3 tag does not fit into the buffer", () => {
    const bytes = new Uint8Array(1024);
    bytes.set(id3Header(4096), 0);
    // Даже с маркером в буфере тег обрезан — заголовок кадра лежит дальше.
    expect(mp3HasVbrHeader(bytes)).toBe(false);
  });

  it("ignores markers beyond the first-frame window", () => {
    const bytes = new Uint8Array(16384);
    bytes.set(id3Header(0), 0);
    bytes.set(ascii("Xing"), 10 + 8000);
    expect(mp3HasVbrHeader(bytes)).toBe(false);
  });
});

const box = (type: string, payload: number[] = []): number[] => {
  const size = 8 + payload.length;
  return [(size >> 24) & 0xFF, (size >> 16) & 0xFF, (size >> 8) & 0xFF, size & 0xFF, ...ascii(type), ...payload];
};

describe("m4aHasMoov", () => {
  it("finds moov placed before the media data", () => {
    const bytes = new Uint8Array([...box("ftyp", [0, 0, 0, 0]), ...box("moov", [1, 2, 3]), ...box("mdat", [4, 5])]);
    expect(m4aHasMoov(bytes)).toBe(true);
  });

  it("returns false when moov sits past the truncated head", () => {
    // ffmpeg without -movflags +faststart writes mdat first; the head read
    // stops inside it and the box never appears.
    const mdatPayload = Array.from({ length: 512 }, () => 0);
    const bytes = new Uint8Array([...box("ftyp", [0, 0, 0, 0]), ...box("mdat", mdatPayload)].slice(0, 300));
    expect(m4aHasMoov(bytes)).toBe(false);
  });

  it("does not mistake the four letters inside audio data for the box", () => {
    // "moov" occurs freely in compressed payloads; only the box chain counts.
    const payload = [...Array.from({ length: 40 }, () => 0)];
    payload.splice(20, 4, ...ascii("moov"));
    const bytes = new Uint8Array([...box("ftyp", [0, 0, 0, 0]), ...box("mdat", payload)]);
    expect(m4aHasMoov(bytes)).toBe(false);
  });

  it("stops on a box that declares an impossible size", () => {
    const bytes = new Uint8Array([0, 0, 0, 2, ...ascii("ftyp"), 0, 0, 0, 0]);
    expect(m4aHasMoov(bytes)).toBe(false);
  });

  it("stops on a box that runs to the end of the file", () => {
    const bytes = new Uint8Array([0, 0, 0, 0, ...ascii("mdat"), ...Array.from({ length: 64 }, () => 0)]);
    expect(m4aHasMoov(bytes)).toBe(false);
  });

  it("walks past a 64-bit largesize box", () => {
    const large = [0, 0, 0, 1, ...ascii("mdat"), 0, 0, 0, 0, 0, 0, 0, 24, ...Array.from({ length: 8 }, () => 0)];
    const bytes = new Uint8Array([...large, ...box("moov", [7])]);
    expect(m4aHasMoov(bytes)).toBe(true);
  });
});
