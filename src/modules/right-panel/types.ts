import type { PlayerTrack, Track } from "@/modules/player/types";

export type RightPanelView = "queue" | "current-track" | "lyrics" | "track-info" | "edit-track" | "add-tracks" | "chapters" | "downloads" | "entity-select" | "none";
export type RightPanelBackView = "queue" | "current-track" | "none";

export type RightPanelScope
  = | { type: "global" }
    | { type: "route"; routeKey: string };

export interface RightPanelTrackInfoPayload {
  track: PlayerTrack;
}
export interface RightPanelChaptersPayload {
  track: Track;
}

export interface RightPanelEditTrackPayload {
  track: PlayerTrack;
}

export interface RightPanelPayloadMap {
  "queue": undefined;
  "current-track": undefined;
  "lyrics": undefined;
  "track-info": RightPanelTrackInfoPayload;
  "edit-track": RightPanelEditTrackPayload;
  "add-tracks": RightPanelAddTracksPayload;
  "chapters": RightPanelChaptersPayload;
  "downloads": undefined;
  "entity-select": RightPanelEntitySelectPayload;
  "none": undefined;
}

export interface RightPanelAddTracksPayload {
  entityType: "playlist" | "album" | "artist" | "favorite";
  entityId: string | number;
  onConfirmed?: () => unknown | Promise<unknown>;
}

export interface RightPanelEntitySelectPayload {
  kind: "artists" | "album";
  selectedNames?: string[];
  selectedAlbumId?: string;
  onConfirm: (result: { names?: string[]; albumId?: string; albumTitle?: string }) => void;
}

export interface OpenRightPanelOptions {
  scope?: RightPanelScope;
  depth?: number;
  returnToView?: RightPanelBackView;
}
