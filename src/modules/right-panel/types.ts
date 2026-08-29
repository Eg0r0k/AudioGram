import type { PlayerTrack, Track } from "@/modules/player/types";

export type RightPanelView = "queue" | "current-track" | "lyrics" | "track-info" | "edit-track" | "add-tracks" | "chapters" | "downloads" | "entity-select" | "folder-add" | "none";
export type RightPanelBackView = "queue" | "current-track" | "none";

export type RightPanelScope
  = | { type: "global" }
    | { type: "route"; routeKey: string }
    | { type: "folder"; folderId: string };

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
  "folder-add": RightPanelFolderAddPayload;
  "none": undefined;
}

export interface RightPanelAddTracksPayload {
  entityType: "playlist" | "album" | "artist" | "favorite";
  entityId: string | number;
  onConfirmed?: () => unknown | Promise<unknown>;
}

/** The sidebar folder the picker adds artists / albums / playlists to. */
export interface RightPanelFolderAddPayload {
  folderId: string;
}

export interface RightPanelEntitySelectPayload {
  kind: "artists" | "album";
  selectedNames?: string[];
  selectedAlbumId?: string;
  /**
   * For `kind: "album"` an existing pick reports both `albumId` and `albumTitle`
   * (the title is only a display label), a created one reports `albumTitle`
   * alone, and "no album" reports neither.
   */
  onConfirm: (result: { names?: string[]; albumId?: string; albumTitle?: string }) => void;
  /**
   * Where to go when the picker is done (confirm, create or back). Defaults to
   * `rightPanel.back()`, which closes the panel — openers that live in another
   * view pass a callback that reopens themselves.
   */
  onDone?: () => void;
}

export interface OpenRightPanelOptions {
  scope?: RightPanelScope;
  depth?: number;
  returnToView?: RightPanelBackView;
}
