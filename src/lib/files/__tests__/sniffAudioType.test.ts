import { describe, it, expect } from "vitest";
import { sniffAudioExtension } from "../sniffAudioType";

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap(x => typeof x === "string" ? [...x].map(c => c.charCodeAt(0)) : [x]));

describe("sniffAudioExtension", () => {
  it("detects ID3-tagged and bare mpeg audio as mp3", () => {
    expect(sniffAudioExtension(bytes("ID3", 4, 0, 0))).toBe("mp3");
    expect(sniffAudioExtension(bytes(0xFF, 0xFB, 0x90))).toBe("mp3");
    expect(sniffAudioExtension(bytes(0xFF, 0xF3, 0x40))).toBe("mp3");
  });

  it("detects flac, ogg and wav containers", () => {
    expect(sniffAudioExtension(bytes("fLaC"))).toBe("flac");
    expect(sniffAudioExtension(bytes("OggS", 0, 2))).toBe("ogg");
    expect(sniffAudioExtension(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBe("wav");
  });

  it("detects the mp4 ftyp box as m4a", () => {
    expect(sniffAudioExtension(bytes(0, 0, 0, 24, "ftypM4A "))).toBe("m4a");
    expect(sniffAudioExtension(bytes(0, 0, 0, 32, "ftypisom"))).toBe("m4a");
  });

  it("detects the Monkey's Audio magic as ape", () => {
    expect(sniffAudioExtension(bytes("MAC ", 0x96, 0x0F))).toBe("ape");
  });

  it("returns null for unknown payloads", () => {
    expect(sniffAudioExtension(bytes("PK", 3, 4))).toBeNull();
    expect(sniffAudioExtension(bytes("RIFF", 0, 0, 0, 0, "AVI "))).toBeNull();
    expect(sniffAudioExtension(new Uint8Array(0))).toBeNull();
  });
});
