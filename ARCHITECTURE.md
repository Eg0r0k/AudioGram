# Architecture — Data Layer & Composables

This document describes the rules the codebase actually follows. When you add code, follow these; when you find code that doesn't, it is listed under [Known deviations](#known-deviations) — don't copy it.

## Layer map

```
pages/*.vue ──► modules/*/composables ──► src/queries ──► src/db/repositories ──► Dexie (db)
     │                                        ▲                    ▲
     └── (fetch fns / inline useQuery) ───────┘                    │
                                          src/services ────────────┤
                                                                   └── src/db/unit-of-work (transactions)
```

- **`src/db`** — Dexie schema (`index.ts`), entities, repositories (one per table, extending `BaseRepository`), `unit-of-work.ts` for multi-table transactions, `storage/` for file blobs (Tauri FS / OPFS).
- **`src/queries`** — TanStack Query integration: `queryKeys`, `queryOptions` factories, fetch functions, `*AndSync` mutation functions, surgical cache patchers (`cache.ts`).
- **`src/services`** — multi-entity/transactional workflows (import pipeline, stats, storage info). May use `db` directly and open transactions via `unitOfWork`.
- **`src/modules/*/composables`** — domain data assembly and domain actions for pages.
- **`src/composables`** — cross-cutting UI/platform concerns (device layout, drag-drop, Tauri, selection) and orchestration glue (`useImport`).

## Rules

### R1. Dexie tables are touched only by repositories and services

Components and composables never import `db`. Reads go through `src/queries`; writes go through `*AndSync` functions or a service. Type-only imports (`import type { ... } from "@/db/entities"`) are always fine and don't count as layer crossings.

### R2. `Result` at the repository boundary, exceptions above it

Repositories return `neverthrow` `Result<T, Error>`. The query layer converts via `unwrapResult` (logs + throws), so TanStack Query, composables, and components deal only in exceptions. Never let a `Result` leak into a component.

### R3. Reads: keys from `queryKeys`, options from `queryOptions` factories

- Every query key comes from `src/queries/query-keys.ts`. No ad-hoc key literals.
- Non-infinite queries: use the exported `xQueries = { ... } as const` factories.
- Infinite queries: configured in composables via `useInfiniteQuery` with fetch functions from `src/queries` (deliberate split, see `track.queries.ts`).
- Page-level data goes through a module composable (`useAlbumPage`, `usePlaylistPage`, ...). Inline `useQuery`/`useMutation` in a `.vue` file is acceptable only for component-local, ephemeral state (e.g. right-panel search-as-you-type) — keys and fetchers still come from `src/queries`.

### R4. Mutations: `*AndSync(queryClient, ...)` functions in `src/queries`

A library mutation does: repository write → surgical cache patch via `cache.ts` (`setQueryData` write-through, not blanket invalidation). Blanket invalidation is reserved for bulk operations (`invalidateLibraryData` after import/folder scans, `invalidateStatsQueries` after listen events).

Search-index maintenance is NOT the mutation's job — see [Search index projection](#search-index-projection). **Note:** this rule was written against the cancelled DBCore-middleware projection and awaits a rewrite for the minimal variant.

### R5. `queryClient` access

- Vue setup scope → `useQueryClient()`.
- Non-Vue code → prefer accepting a `QueryClient` parameter and letting the caller invalidate (the import pipeline does this). Importing the singleton from `@/queries/client` is a last resort for fully detached services (`stats.service`).

### R6. Pinia stores hold runtime state, never cached library data

Player/queue stores do not use TanStack Query. Stores MAY read repositories directly for runtime state that is not a cache of library queries (e.g. `queue.store` materializing queue items via `trackRepository.findByIds`). Stores never WRITE library data — writes belong to `*AndSync` functions or services.

### R7. Composable placement

Domain composables live in `src/modules/<feature>/composables`; only cross-cutting UI/platform composables live in `src/composables`.

### R8. Module-local pipelines may bypass the cache — knowingly

The recommendations module talks to `audioFeaturesRepository`/`trackRepository` directly from its worker pipeline and busts its query cache by baking a `cacheVersion` into the key. This is a module-local convention for data that is not part of the shared library cache. Don't copy the version-busting idiom into library queries — use invalidation there.

## Search index projection

> **STATUS (2026-07-18): superseded.** The DBCore-middleware decision below is cancelled; the minimal variant was chosen instead. The ADR is kept as history and will be rewritten once the work is complete. The mechanism text is intentionally left in place so it stays visible what was cancelled and why.

The search index is a MiniSearch instance in a Web Worker, **in-memory per session**: it is lazily built from a full DB scan on first search (`initSearchIndex` → `buildAllSearchDocuments`) and discarded on reload. Consequently the incremental delta stream only needs to be correct for the lifetime of the current session.

### Contract (actual)

> Matching fields of a search document (`title`/`artist`/`album`) are fresh. The document's embedded payload MAY be stale and is NOT a data source for playback or any file operations — consumers re-read the entity by id. Confirmed by tracing SearchPanel → `queueStore` → `getAudioUrl`: the queue store materializes tracks from the repository by id, never from the search document.

### Mechanism (ADR)

**Decision: Dexie DBCore middleware + post-commit projector.** A middleware registered on the single shared `db` instance intercepts `mutate` on the searched tables, buffers affected keys per transaction, and flushes them on transaction completion into a serialized projector queue. The projector:

1. Skips entirely while the index is uninitialized (`initPromise === null`) — the lazy full scan covers everything up to init.
2. Re-reads affected rows and rebuilds documents via `buildDocuments.ts`, fanning out relation changes (artist/album rename → dependent track docs).
3. Skips worker traffic when searchable fields are unchanged (hash compare), so `playCount`/`likedAt` churn does not hit the worker.
4. Degrades to `rebuildSearchIndex()` on key-less mutations (`deleteRange`/`clear`).

The projector is the **single writer** of the index. `upsertSearchDocuments`/`removeSearchDocuments` are internal to the projection; `*AndSync` functions do not call them.

**Options rejected:**

| Option | Why rejected |
|---|---|
| Unit-of-Work hook | Almost no writes flow through `unitOfWork`; raw `db` access bypasses it; UoW cannot see what changed inside its opaque callback. |
| Domain events | Emission is voluntary — same forget-to-call bug class as today. Repo-level emission fires before commit (phantom docs on rollback) and raw `db` access still bypasses it. Revisit only if a second subscriber appears. |
| "Writes return an index delta" contract | TypeScript cannot force consumption of a return value; delta fan-out logic (artist rename → N track docs) spreads to every writer; deltas from rolled-back transactions must not apply. Its honest form is a single write-funnel module — kept as the lint rule below, not as the sync mechanism. |

**Defense in depth:** ESLint `no-restricted-imports` bans `@/db` (the `db` instance) outside `src/db`, `src/services`, and `src/queries`. This enforces R1 in CI; the middleware makes the index correct even when R1 is broken.

**Accepted limits:** the index lags a commit by the projector's queue latency (async worker anyway); a second Dexie connection to `AudiogramDB` would bypass the middleware (nothing in the repo opens one — workers import types only).

## Known deviations

Existing code that violates the rules above. Fix on touch; do not imitate.

- `src/modules/tracks/components/menu/items/NavigationItems.vue` — raw `db.artists.bulkGet` in a component (R1). Should use the artist query layer.
- `src/modules/watched-folders/composables/useWatchedFolders.ts` — raw Dexie reads and writes (`bulkDelete`, `bulkPut`) in a composable (R1). Caches survive only via blanket `invalidateLibraryData`; the search index is left stale for the session. Needs `trackRepository` methods (`deleteByPathPrefix`, `rewritePathPrefix`).
- Cascade deletes run outside `unitOfWork` — multi-table removal is not transactional.
- Dead `run()` method on the unit-of-work — no callers.
- `unwrapResult` lives in `src/queries/shared.ts` but is imported by services and stores — an upward dependency. The helper belongs in `src/db` or `src/lib`.
- `useStatsQueries` sits in `src/composables` despite being domain-specific (R7).
