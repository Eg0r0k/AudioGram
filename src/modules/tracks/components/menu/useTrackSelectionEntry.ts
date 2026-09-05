import { inject, provide } from "vue";
import type { InjectionKey } from "vue";
import type { TrackId } from "@/types/ids";

export type TrackSelectionEntry = (trackId: TrackId) => void;

const TrackSelectionEntryKey: InjectionKey<TrackSelectionEntry> = Symbol("track-selection-entry");

/** A page that supports select mode provides this; the track menu then shows "Select". */
export const provideTrackSelectionEntry = (enter: TrackSelectionEntry) => {
  provide(TrackSelectionEntryKey, enter);
};

export const useTrackSelectionEntry = (): TrackSelectionEntry | null =>
  inject(TrackSelectionEntryKey, null);
