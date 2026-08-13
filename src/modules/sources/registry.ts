import { parseTrackRef, type SourceKind } from "@/types/track-ref";
import type { TrackId } from "@/types/ids";
import type { SourceProvider } from "./types";
import { ytSourceProvider } from "./providers/yt.provider";

// "local" and "nd" register here as their providers land (M2).
const providers: Partial<Record<SourceKind, SourceProvider>> = {
  yt: ytSourceProvider,
};

export const sources = {
  get(kind: SourceKind): SourceProvider {
    const provider = providers[kind];
    if (!provider) {
      throw new Error(`No source provider registered for "${kind}"`);
    }
    return provider;
  },

  forTrack(id: TrackId): SourceProvider {
    return sources.get(parseTrackRef(id).kind);
  },

  available(): SourceProvider[] {
    return Object.values(providers).filter(provider => provider.isAvailable);
  },
};
