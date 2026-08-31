import type { TagEntity, TrackEntity } from "@/db/entities";
import { tagRepository, trackRepository } from "@/db/repositories";
import { queryKeys } from "@/queries/query-keys";
import type { TrackId, TagId } from "@/types/ids";
import { queryOptions, type QueryClient } from "@tanstack/vue-query";
import { unwrapResult } from "./shared";

export async function getAllTags(): Promise<TagEntity[]> {
  return unwrapResult(tagRepository.findAll());
}

export async function getTagsByTrackId(trackId: TrackId): Promise<TagEntity[]> {
  return unwrapResult(tagRepository.findByTrackId(trackId));
}

export const tagQueries = {
  all: () =>
    queryOptions({
      queryKey: queryKeys.tags.all(),
      queryFn: getAllTags,
    }),
  byTrack: (trackId: TrackId) =>
    queryOptions({
      queryKey: queryKeys.tags.byTrack(trackId),
      queryFn: () => getTagsByTrackId(trackId),
    }),
} as const;

function syncTagByTrackCache(
  queryClient: QueryClient,
  trackId: TrackId,
  tags: TagEntity[],
) {
  queryClient.setQueryData(queryKeys.tags.byTrack(trackId), tags);
}

function syncTrackDetailCache(
  queryClient: QueryClient,
  track: TrackEntity,
) {
  queryClient.setQueryData(queryKeys.tracks.detail(track.id), track);
}

export async function addTagToTrackAndSync(
  queryClient: QueryClient,
  track: TrackEntity,
  tagName: string,
): Promise<TagEntity> {
  const tag = await unwrapResult(tagRepository.findOrCreate(tagName));

  const currentTagIds = track.tagIds;
  if (!currentTagIds.includes(tag.id)) {
    await unwrapResult(trackRepository.addTagToTrack(track.id, tag.id));

    const nextTrack: TrackEntity = {
      ...track,
      tagIds: [...currentTagIds, tag.id],
    };

    syncTrackDetailCache(queryClient, nextTrack);

    const currentTags = queryClient.getQueryData<TagEntity[]>(queryKeys.tags.byTrack(track.id)) ?? [];
    const nextTags = [...currentTags, tag];
    syncTagByTrackCache(queryClient, track.id, nextTags);
  }

  return tag;
}

export async function removeTagFromTrackAndSync(
  queryClient: QueryClient,
  track: TrackEntity,
  tagId: TagId,
): Promise<void> {
  await unwrapResult(trackRepository.removeTagFromTrack(track.id, tagId));

  const currentTagIds = track.tagIds;
  const nextTagIds = currentTagIds.filter(id => id !== tagId);

  const nextTrack: TrackEntity = {
    ...track,
    tagIds: nextTagIds,
  };

  syncTrackDetailCache(queryClient, nextTrack);

  const tags = queryClient.getQueryData<TagEntity[]>(queryKeys.tags.byTrack(track.id)) ?? [];
  const nextTags = tags.filter(t => t.id !== tagId);
  syncTagByTrackCache(queryClient, track.id, nextTags);
}
