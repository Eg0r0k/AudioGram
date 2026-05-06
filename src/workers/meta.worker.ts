import { IAudioMetadata, parseBuffer, type IOptions } from "music-metadata";
import type { BaseMetadata, ParseRequest, ParseResponse } from "./types";

const OPTIONS: IOptions = {
  duration: true,
  skipCovers: false,
  includeChapters: false,
  mkvUseIndex: true,
};

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseArtists(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.split(/[,;&|/]\s*/).map(a => a.trim()).filter(a => a !== "");
}

function ratioToDbtp(ratio: number | undefined): number | undefined {
  if (ratio === undefined || ratio <= 0) return undefined;
  return 20 * Math.log10(ratio);
}

function extractLoudness(metadata: IAudioMetadata): Pick<
  BaseMetadata,
  "integratedLufs" | "truePeakDbtp" | "replayGainDb" | "replayPeak"
> {
  const replayGainDb
    = asFiniteNumber(metadata.common.replaygain_track_gain?.dB)
      ?? asFiniteNumber(metadata.format.trackGain);

  const replayPeak
    = asFiniteNumber(metadata.common.replaygain_track_peak?.ratio)
      ?? asFiniteNumber(metadata.common.replaygain_track_peak_ratio)
      ?? asFiniteNumber(metadata.format.trackPeakLevel);

  const truePeakDbtp = ratioToDbtp(replayPeak);

  return {
    integratedLufs: undefined,
    truePeakDbtp,
    replayGainDb,
    replayPeak,
  };
}

self.onmessage = async (e: MessageEvent<ParseRequest>) => {
  const { fileId, fileData, fileName } = e.data;

  try {
    const metadata = await parseBuffer(fileData, undefined, OPTIONS);

    let pictureBlob: Blob | undefined;
    if (metadata.common.picture?.[0]) {
      const pic = metadata.common.picture[0];
      pictureBlob = new Blob([pic.data], { type: pic.format });
    }

    const titleFromFile = fileName.replace(/\.[^/.]+$/, "");
    const loudness = extractLoudness(metadata);

    const artists = parseArtists(metadata.common.artist);

    const meta: BaseMetadata = {
      title: metadata.common.title || titleFromFile,
      artists: artists.map(a => a.trim()).filter(Boolean),
      album: metadata.common.album || "",
      year: metadata.common.year,
      duration: metadata.format.duration || 0,
      trackNo: metadata.common.track.no || undefined,
      diskNo: metadata.common.disk.no || undefined,
      format: {
        codec: metadata.format.codec,
        bitrate: metadata.format.bitrate,
        sampleRate: metadata.format.sampleRate,
        lossless: metadata.format.lossless,
        channels: metadata.format.numberOfChannels,
      },
      pictureBlob,

      integratedLufs: loudness.integratedLufs,
      truePeakDbtp: loudness.truePeakDbtp,
      replayGainDb: loudness.replayGainDb,
      replayPeak: loudness.replayPeak,
    };

    const response: ParseResponse = { success: true, fileId, meta };
    self.postMessage(response);
  }
  catch (error: unknown) {
    if (error instanceof Error) {
      const response: ParseResponse = {
        success: false,
        fileId,
        error: error.message || "Parsing failed",
      };
      self.postMessage(response);
    }
  }
};
