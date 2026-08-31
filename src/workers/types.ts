import type { AudioFormat } from "@/db/entities";

export interface ParseRequest {
  fileId: string;
  fileName: string;
  fileData: Uint8Array;
  extractCover?: boolean;
}

export type ParseResponse
  = | { success: true; fileId: string; meta: BaseMetadata }
    | { success: false; fileId: string; error: string };

export interface BaseMetadata {
  title: string;
  artists: string[];
  album: string;
  year?: number;
  duration: number;
  trackNo?: number;
  diskNo?: number;

  format: AudioFormat;

  pictureBlob?: Blob;

  /**
   * EBU R128 / LUFS-style metadata if present in tags
   */
  integratedLufs?: number;
  truePeakDbtp?: number;

  replayGainDb?: number;
  replayPeak?: number;

}
