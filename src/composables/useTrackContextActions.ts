import type { ContextActions, TrackContext } from "@/components/track/context-menu/types";
import { PlaylistId } from "@/types/ids";
import { Track } from "@/types/track/track";
import { type Ref } from "vue";
import { useRouter } from "vue-router";
export function useTrackContextActions(
  track: Ref<Track>,
  context: Ref<TrackContext>,
  options: {
    playlistId?: Ref<PlaylistId | undefined>;
    queueIndex?: Ref<number | undefined>;
  } = {},
): ContextActions {
  const router = useRouter();
  const play = () => {
    console.log("Play track:", track.value.id);
  };

  const playNext = () => {
    console.log("Play next:", track.value.id);
  };

  const addToQueue = () => {
    console.log("Add to queue:", track.value.id);
  };

  const toggleLike = async () => {
    console.log("Toggle like:", track.value.id);
  };

  const addToPlaylist = async (playlistId: PlaylistId) => {
    console.log("Add to playlist:", track.value.id, "->", playlistId);
  };

  const removeFromQueue = () => {
    if (options.queueIndex?.value !== undefined) {
      console.log("Remove from queue at index:", options.queueIndex.value);
    }
  };

  const removeFromPlaylist = async () => {
    if (options.playlistId?.value) {
      console.log("Remove from playlist:", options.playlistId.value);
    }
  };

  const removeFromHistory = async () => {
    console.log("Remove from history:", track.value.id);
  };

  const goToArtist = () => {
    router.push(`/artist/${track.value.artistId}`);
  };

  const goToAlbum = () => {
    router.push(`/album/${track.value.albumId}`);
  };

  const download = () => {
    console.log("Download:", track.value.id);
  };

  return {
    play,
    playNext,
    addToQueue,
    toggleLike,
    addToPlaylist,
    removeFromQueue,
    removeFromPlaylist,
    removeFromHistory,
    goToArtist,
    goToAlbum,
    download,
  };
}
