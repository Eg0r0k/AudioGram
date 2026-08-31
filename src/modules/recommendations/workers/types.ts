import type { AudioFeaturesEntity } from "@/db/entities";
import type { TrackId } from "@/types/ids";

export interface AnalysisRequest {
  // UUID for pending responce
  requestId: string;
  trackId: TrackId;
  fileData: Uint8Array;
}

export type AnalysisResponse
  = | {
    success: true;
    requestId: string;
    trackId: TrackId;
    features: Omit<AudioFeaturesEntity, "trackId" | "analyzedAt" | "algorithmVersion">;
  }
  | {
    success: false;
    requestId: string;
    trackId: TrackId;
    error: string;
  };
