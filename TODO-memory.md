# TODO: Memory / pagination fixes

## Agreements

Decisions made in chat, not otherwise recorded anywhere:

- `unit-of-work.ts` `run()` must NOT be deleted before the cascading deletes are handled, even though it currently has no callers.
- **Task 11 is blocked:** the `ghostTop` clamp formula is broken, and it's unclear whether `useDragReorder.test.ts` is a deliberate spec or a leftover from an old version. Do not touch it.
- `maxPages` is incompatible with the current virtualization (see Requires discussion). Do NOT re-introduce it.
- Never delete sections from this file — move completed ones to `## Completed`.

---

Context for the implementer: Vue 3 + Dexie (IndexedDB) music player. Track tables can hold 10k–20k+ records; one `TrackEntity` weighs ~1.3 KB in JS heap, one mapped `Track` ~1.1 KB, so every full-library array is ~20–26 MB per 20k tracks. Tasks are ordered by risk-to-benefit: do them top to bottom. Each task is self-contained. Run `pnpm type-check` and `pnpm test:run` after each task unless stated otherwise.

---

## 4. Playlist pagination loads the whole playlist on every page

**File:** `src/queries/playlist.queries.ts` — `getPlaylistTracksPaginated` (lines 88–135).

**Wrong now:** Every page fetch calls `trackRepository.findByIds(playlist.trackIds)` for ALL playlist tracks (a 5k-track playlist paged at 50 loads 5k entities 100 times) just to compute `totalDuration` and slice one page.

**Should be:**
- No `sortKey`: slice ids first — `const pageIds = playlist.trackIds.slice(offset, offset + limit)` — then `findByIds(pageIds)` only. Compute `totalDuration` only when `offset === 0` via the existing `trackRepository.sumDurationByTrackIds(playlist.trackIds)` (it streams with `.each`, no array); return `0` on later pages (consumers read page 0 only).
- With `sortKey`: a global sort genuinely needs all rows; keep the full `findByIds` + `sortTracks` **only when `offset === 0`**, and for later pages reuse the same approach (full load + slice) — but still skip the `totalDuration` reduce for `offset > 0`. (Accepted tradeoff: sorted playlist paging stays O(n) per page; playlists are the smallest collection type.)

**Acceptance:** New/updated unit test in `src/queries/__tests__/` (mock `trackRepository`): for `offset=50, limit=50, sortKey=null`, `findByIds` is called with exactly the 50 ids of that page, not the full id list. `pnpm test:run` passes.

**Dependencies:** none.

---

## 11. Fix queue drag-reorder: mistargeted drops and indicator/result mismatch (REAL BUG, not memory)

**Files:**
- `src/modules/queue/composables/useDragReorder.ts` (whole file, ~175 lines)
- `src/modules/queue/components/QueueList.vue` — `getDropTargetIndex` (lines 164–175), `dropIndicatorPosition` (lines 160–162), `QueueDragOverlay` binding (line 82), `DEBUG_QUEUE_DND` (line 107)
- `src/modules/queue/__tests__/useDragReorder.test.ts` — this file is the SPEC; do not edit it except where noted

**Wrong now (verified against the committed spec tests, 4 of 7 currently fail):**
1. Drop target is computed from the raw pointer (`Math.round((clientY - containerRect.top + scrollTop) / itemHeight)`, useDragReorder.ts:80–86) instead of the dragged row's top edge. Concrete effect: grab row 0 near its bottom edge (clientY 110, row spans 100–164), move the pointer to 196 (row moved down ~1.3 rows) — code reorders to index 2, correct target is 1. The dragged item lands one row lower than where the user dragged it.
2. Indicator and actual drop disagree: `QueueList.getDropTargetIndex` treats `dropIndex` as an insert-slot (`drop > from ? drop - 1 : drop`), but `handlePointerUp` passes raw `dropIndex` to `onReorder` → `moveItem` (queue-order.ts:14–24, remove-then-insert = final-index semantics). Example: rows A,B,C,D, drag A with dropIndex=2 → indicator line under B, but result is [B,C,A,D] (A after C). Additionally, for the adjacent slot (drop === from+1) the indicator is suppressed (`to === from` → -1) yet pointerup still reorders.
3. The drag overlay follows the raw pointer (`ghostY`) with no clamping; the spec requires `ghostTop` = dragged-row top, clamped so the overlay cannot move above the first draggable row (test lines 142–197).
4. Option `getListStartOffset` from the spec is not implemented. Latent today (QueueList's list starts at its scroll container's top), but required by the spec and needed the moment any consumer adds a `before` slot or top padding inside the scroll container.

**Should be (accepted design — implement exactly this):**
1. `startDrag` captures the grab offset: `grabOffset = event.clientY - draggedRowRect.top`, where `draggedRowRect` comes from `(event.target as HTMLElement).closest('[data-drag-row]')?.getBoundingClientRect()` — the spec's start event exposes `target.closest(...)`; fall back to `grabOffset = itemHeight / 2` when no row element is found (spec test "reorders down by one" passes no rowTop and expects this fallback to yield target 1 for rowTop 86: `round(86/64)=1` — with fallback grabOffset 32, rowTop = 196−100−32+0 = 64 → `round(64/64)=1`, consistent).
2. Add optional option `getListStartOffset?: () => number` (default `() => 0`). Target math in `handlePointerMove`:
   `rowTop = event.clientY - grabOffset - containerRect.top + container.scrollTop - getListStartOffset()`;
   `dropIndex = clamp(Math.round(rowTop / itemHeight), 0, itemCount - 1)`.
   `dropIndex` is the FINAL index of the dragged item after the move — pass it unchanged to `onReorder`; `moveItem`'s remove-then-insert semantics already interpret `toIndex` as the final index.
3. Expose `ghostTop` (replacing or alongside `ghostY`): `ghostTop = clamp(pointerY - grabOffset, containerRect.top + getListStartOffset() - scrolledPastTop…, …)` — precisely: overlay top = dragged-row top in viewport coordinates, clamped to not go above the first draggable row's current viewport position (see spec tests at lines 160–197 for exact expected numbers: pointer 180 → ghostTop 156; pointer 96 with list start at 196 → ghostTop 196). Update `QueueDragOverlay` binding in QueueList.vue (line 82) from `ghost-y` to the new `ghost-top` (adjust QueueDragOverlay.vue prop accordingly — it currently positions by pointer).
4. In QueueList.vue: with final-index semantics `getDropTargetIndex` becomes `drop === from ? -1 : drop`, and the indicator must render on the correct edge: moving down (`drop > from`) → line at BOTTOM of display row `drop`; moving up (`drop < from`) → line at TOP of display row `drop`. Implement via `dropIndicatorPosition()` returning `"bottom-0"` / `"top-0"` respectively.
5. Set `DEBUG_QUEUE_DND = false` (QueueList.vue:107) or delete the flag if nothing reads it.

**Acceptance:** `pnpm vitest run src/modules/queue/__tests__/useDragReorder.test.ts` — all 7 green WITHOUT modifying the test file (it is the spec; the only permitted edit is adding `data-drag-row` selector details if you wire `closest` differently — keep the public API exactly as the spec harness uses it: `isDragging`, `dragIndex`, `dropIndex`, `ghostTop`, `startDrag`, options `{ itemCount, itemHeight, getScrollContainer, getListStartOffset?, onReorder }`). Manual: in the queue panel, drag a row down one slot — it lands exactly one slot down and the indicator line matches the landing position in both directions.

**Dependencies:** none. Independent of all memory tasks.

---

## 13. Remove dead `getTracksIndexPageData` + `trackQueries.index` (post task 9)

**Files:** `src/queries/track.queries.ts` (`getTracksIndexPageData`, `trackQueries.index`); `src/queries/__tests__/track-queries.test.ts` (its `getTracksIndexPageData` tests, incl. the line ~107 case just changed from `2000` to `50`); `src/queries/cache.ts` (index non-infinite patchers).

**Wrong now:** After task 9, `getTracksIndexPageData` has no production caller other than the `trackQueries.index` `queryOptions` factory, which a prior audit found has **zero consumers** (nothing does `useQuery(trackQueries.index(...))`). Function, factory, and their tests are therefore dead code — the `track-queries.test.ts:107` expectation now asserts against dead code. The related index cache patchers write to `["tracks","index", …]` (non-infinite) keys that nothing populates.

**Should be:** (1) CONFIRM zero consumers via grep + `lsp references` for `getTracksIndexPageData`, `trackQueries.index`, and `queryKeys.tracks.index`. (2) If confirmed, delete the function, the factory entry, the dead tests, and the orphaned cache patchers that target the unpopulated non-infinite index keys — per the prior audit at `cache.ts` lines 360, 363, 430, 446, 598, 603 (RE-VERIFY: line numbers drift with edits). Do NOT touch `queryKeys.tracks.indexInfinite` / `indexTotalDuration` or any infinite-list/aggregate patchers — those are live.

**Acceptance:** grep/lsp shows zero consumers before deletion; after deletion `pnpm type-check` and `pnpm test:run` stay green with no new failures vs the current baseline (task 11 only). Confirm-before-delete is mandatory — if any consumer exists, STOP and report instead of deleting.

**Dependencies:** task 9 (it removed the last real caller).

---

# Requires discussion (NOT for execution)

- **Stats repository full-event scans** (`src/db/repositories/stats.repository.ts` lines 81–159, 181–213): `topTracks`, `topArtists`, `topGenres`, `totalListeningSeconds`, `sonicProfile` each call `db.listenEvents.toArray()` when `since` is unset, and the stats page mounts several in parallel — N parallel copies of the whole events table. Needs a decision: share one loaded events array per stats-page visit, or make `since` mandatory, or maintain aggregate tables. Volume is small today (events ≈ 200 B each; 10k plays ≈ 2 MB × 5 widgets) — only a large-history problem.
- **Recommender full-library load** (`src/modules/recommendations/service/recommender.service.ts` lines 89–116): every autoplay-recommendation call loads ALL track entities + ALL audio features + ALL listen events (~30+ MB transient at 20k tracks). Capping candidates (e.g., pre-filter by co-occurrence/features index) changes recommendation quality — product decision.
- **Keyset (cursor) pagination migration**: Dexie `offset(n)` advances a cursor without deserializing records, so memory is fine; cost is CPU-linear per page. With tasks 2–4 done, offset pagination is acceptable up to ~20k rows. Migrating to keyset (`where(sortField).above(lastKey)` + pk tiebreak on compound indexes) is only worth it if profiling still shows deep-scroll latency.
- **Queue size on "play all"**: enqueuing the whole library keeps ~20k Track objects (~22 MB) alive for the app lifetime. Making the queue id-based with windowed hydration is an architecture change touching player, persistence, and shuffle.
- **Bounding infinite-query cache growth (reverted `maxPages`)**: the 7 `useInfiniteQuery` lists retain every loaded page for `gcTime`, so scrolling a 20k library keeps ~20k `Track` objects (~22 MB) in cache. TanStack `maxPages` is **not** compatible with the current virtualization and was rolled back. `VirtualScrollable` derives the virtualizer `count` and `getTotalSize()` directly from `items.length` (`src/components/ui/scrollable/VirtualScrollable.vue:174–181, 134–139`), and every list feeds it `data.pages.flatMap(p => p.tracks)`. `maxPages: N` caps that flattened array at `N × PAGE_SIZE` and evicts from the front on forward scroll, so `count` never grows past the window: the container height freezes, the user can't scroll past the window, and `loadMore` merely shifts it (verified — a 500-track import rendered exactly 200 rows). A real fix decouples the virtualizer from the page cache: drive `count` from a stable `pages[0].total` and hydrate rows for visible indices on demand (windowed/keyset data source the virtualizer owns), keeping the cache bounded without starving the list. Until then `maxPages` stays off and full lists stay resident.

---

# Completed

Moved here (not deleted) once done. Format: title, files, what was wrong, what is now. Some final states deviate from the original plan — noted inline.

## 1. Count album/artist track totals via index keys
- **Files:** `src/db/repositories/track.repository.ts` — `countByAlbumIds`, `countByArtistIds`.
- **Was:** `.where(...).anyOf(ids).toArray()` deserialized every matching track just to count rows (≈2×26 MB per sidebar refresh at 20k).
- **Now:** `.keys()` (multi-entry for `artistIds`) counts occurrences without materializing entities; signatures/`Result<Map>` unchanged. Unit test: `src/db/repositories/__tests__/track.repository.test.ts` (asserts counts + `toArray` not called).

## 2. Stop recomputing library-wide aggregates on every page
- **Files:** `src/queries/track.queries.ts`, `album.queries.ts`, `artist.queries.ts`.
- **Was:** every page fetch recomputed `sumDuration*` (full cursor scans) for `totalDuration`.
- **Now (superseded by the aggregate query):** `totalDuration` removed from the paginated fns entirely and moved to dedicated region+search-keyed aggregate queries (`trackQueries.indexTotalDuration`/`likedTotalDuration`, `albumQueries.totalDuration`, `playlistQueries.totalDuration`); cheap per-page `count()` kept for `nextOffset`. Tests in `track-queries.test.ts` + `useIndexTracksPage.test.ts`.

## 3. Full-fetch for "play All Music" (+ maxPages, reverted)
- **Files:** `src/queries/track.queries.ts` (`getAllTracksForQueue`), `src/pages/AllMusicPage.vue` (`handlePlayTrack`), the 7 `useInfiniteQuery` composables, `src/modules/search/search.worker.ts`.
- **Was:** `handlePlayTrack` enqueued only the flattened cached pages, so playback stopped at the loaded window.
- **Now:** `getAllTracksForQueue(sortKey, search)` added; `handlePlayTrack` enqueues the full library/filtered set, and on `findIndex === -1` logs + falls back to the loaded pages (never a wasted click). Search worker: `undefined` limit now means "no limit" (was coerced to 50). **`maxPages: 4` was added then REVERTED** — incompatible with the current virtualization (see Requires discussion → "Bounding infinite-query cache growth").

## 5. Fingerprint dedupe via index keys
- **Files:** `src/db/repositories/track.repository.ts` — `getAllFingerprints`.
- **Was:** `where("fingerprint").above("").toArray()` deserialized every fingerprinted track (~26 MB) to build a small `Set<string>`.
- **Now:** `.uniqueKeys()` → `ok(new Set(keys as string[]))`; signature unchanged. Covered by the importer suite.

## 6. Stream `sumDurationByLiked`
- **Files:** `src/db/repositories/track.repository.ts` — `sumDurationByLiked`.
- **Was:** `.toArray()` + `reduce` allocated the whole liked list per call.
- **Now:** streams with `.where("likedAt").above(0).each(...)` like the `sumDurationByAlbumId` sibling. Manual smoke: Favorites total unchanged.

## 7. Album track pagination global order (disc-aware)
- **Files:** `src/db/repositories/track.repository.ts` — `findByAlbumIdPaginated`.
- **Was:** `.offset().limit().sortBy("trackNo")` sliced in index order before sorting → pages not globally ordered.
- **Now:** `.equals(albumId).toArray()` then in-memory sort by `(diskNo ?? 1, trackNo)` (expanded from trackNo-only to keep multi-disc order), then `.slice(offset, offset+limit)`. Unit tests incl. a two-disc case (disc 1/track 2 before disc 2/track 1). **Adjacent (not fixed):** `findByAlbumId` (same file, non-paginated) still sorts by `trackNo` only — same disc omission.

## 8. Artist album pagination global order
- **Files:** `src/db/repositories/album.repository.ts` — `findByArtistIdPaginated`.
- **Was:** `.offset().limit().sortBy("year")` sliced before sorting, then `.reverse()` compounded it.
- **Now:** `.equals(artistId).sortBy("year")` → `reverse()` → `.slice(offset, offset+limit)`. Unit test in `src/db/repositories/__tests__/album.repository.test.ts` (years, newest-first).

## 9. "Add all media to queue" truncation + stale test
- **Files:** `src/modules/library/composables/useLibraryContextActions.ts`, `src/queries/__tests__/track-queries.test.ts`.
- **Was:** `allMedia` used `getTracksIndexPageData("date_added_desc")` (default `limit=50`) → enqueued only 50; `track-queries.test.ts:107` still expected the old `2000` default and failed.
- **Now:** `allMedia` uses `getAllTracksForQueue("date_added_desc")` (full library); stale test expectation changed `2000` → `50`. Manual: "add all to queue" on a >50-track library enqueues everything. **Adjacent → task 13:** this left `getTracksIndexPageData`/`trackQueries.index` with no real consumer (dead code).

## 10. Search index stores a scalar projection; playable tracks hydrated by id
- **Files:** `src/modules/search/types.ts`, `buildDocuments.ts`, `search.worker.ts`, `searchIndex.ts`; `src/queries/track.queries.ts` (+ `query-keys.ts` `tracks.byIds`); `SearchPanel.vue`, `SearchResults.vue`, `SearchDropdownRow.vue`, `SearchBestResult.vue`.
- **Was:** each track `SearchDocument` embedded a full mapped `Track` (`track:` field, retained by MiniSearch `storeFields`) — a second copy of the library in worker heap. Worse, the dropdown played `item.track` straight from the frozen doc, so after a folder relink (dead path) or a REMOTE_HLS TTL expiry (stale stream URL) playback from search hit a dead path.
- **Now:** docs store scalars only (`duration` replaces `track`; `title`/`artist`/`album`/`coverPath`/`entityId` kept). `searchTracks` hydrates by `entityId` via `trackRepository.findByIds` + `mapTracks` (order = search score). The dropdown hydrates its visible track results by id (`getTracksByIds`) for both rendering and play. **Invariant:** the search document is a matching/rendering source only — no field but `entityId` reaches the file or DB. Red→green unit test in `searchIndex.test.ts` (stale indexed `storagePath` ignored; play resolves the current DB path). **Adjacent (not fixed):** `SearchBestResult.vue` is dead (no importers) — kept compiling via a `track?` prop; candidate for task-13 cleanup. Manual click-through (below) reserved for the reviewer.

## 12. Repair outdated test mocks (test-only)
- **Files:** `recommender.service.test.ts`, `importer.service.test.ts`, `player.store.test.ts`.
- **Was:** 21 failing tests from stale mocks (mocks drifted from production).
- **Now:** (a) `findAllEvents` mocks wrapped in `ok(...)`; (b) dedicated `mockUnitOfWorkRunScoped` (2-arg `runScoped`) added + assertions retargeted (later removed the dead `run` mock); (c) `pushToGraph: vi.fn()` added to the audio-store mock; (d) sleep-timer tests made `async` with `await nextTick()` after `setSleepTimer`; (e) `fetchLrcLibLyrics` stub returns a conforming `Result` (`match: okFn => okFn([])`). No production changes.
