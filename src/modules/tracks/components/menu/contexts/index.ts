import type { Component } from "vue";
import type { TrackContext } from "../type";
import DefaultContext from "./DefaultContext.vue";
import CurrentTrackContext from "./CurrentTrackContext.vue";
import LikedContext from "./LikedContext.vue";
import QueueContext from "./QueueContext.vue";
import PlaylistContext from "./PlaylistContext.vue";
import HistoryContext from "./HistoryContext.vue";
import YtContext from "./YtContext.vue";

export const trackContextComponents: Record<TrackContext, Component> = {
  "default": DefaultContext,
  "current-track": CurrentTrackContext,
  "search": DefaultContext,
  "liked": LikedContext,
  "artist": DefaultContext,
  "queue": QueueContext,
  "playlist": PlaylistContext,
  "album": DefaultContext,
  "history": HistoryContext,
  "yt": YtContext,
  "yt-search": YtContext,
};
