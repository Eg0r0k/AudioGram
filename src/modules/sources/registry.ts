import { parseTrackRef, type SourceKind } from "@/types/track-ref";
import type { TrackId } from "@/types/ids";
import type { SourceProvider } from "./types";
import { ytSourceProvider } from "./providers/yt.provider";
import { ndSourceProvider } from "./providers/nd.provider";

// "local" registers here when its thin repository wrapper lands.
const providers: Partial<Record<SourceKind, SourceProvider>> = {
  yt: ytSourceProvider,
  nd: ndSourceProvider,
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
