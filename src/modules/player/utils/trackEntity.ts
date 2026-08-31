import type { TrackEntity } from "@/db/entities";
import type { Track } from "@/modules/player/types";

export function mapTrackEntityToPlayerTrack(entity: TrackEntity): Track {
  return {
    kind: "library",
    id: entity.id,
    title: entity.title,
    artist: entity.artistName,
    artistIds: entity.artistIds,
    albumId: entity.albumId,
    albumName: entity.albumTitle,
    storagePath: entity.storagePath ?? "",
    source: entity.source,
    state: entity.state,
    pinned: entity.pinned,
    duration: entity.duration,
    isLiked: !!entity.likedAt,
    playCount: entity.playCount,
    addedAt: entity.addedAt,
    trackNo: entity.trackNo,
    diskNo: entity.diskNo,
    lyricsPath: entity.lyricsPath,
    integratedLufs: entity.integratedLufs,
    truePeakDbtp: entity.truePeakDbtp,
    replayGainDb: entity.replayGainDb,
    replayPeak: entity.replayPeak,
  };
}
