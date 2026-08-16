# Вкладка «Статистика» в настройках — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страница `/settings/stats` со статистикой прослушивания (сводка, серия+heatmap, топы, дослушивания, часы, рекорды, жанры, очистка истории) в дизайн-языке настроек.

**Architecture:** Данные уже пишутся в Dexie-таблицу `listenEvents`. Добавляем несколько методов в `stats.repository.ts` (Result/neverthrow, как существующие), прокидываем через `stats.queries.ts` (tanstack query) и композаблы `useStatsQueries.ts` (переводим на `MaybeRefOrGetter`, чтобы работал переключатель периода). UI — страница-контейнер + самодостаточные секции-компоненты (каждая сама грузит данные по prop `since`).

**Tech Stack:** Vue 3 `<script setup>` + TS, Dexie, @tanstack/vue-query, neverthrow, reka-ui (Tabs), vue-i18n, Tailwind, vitest + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-08-16-stats-settings-tab-design.md`

## Global Constraints

- Никаких Co-Authored-By/Claude-строк в коммитах.
- Все пользовательские строки — через i18n (en + ru), у ru 4 плюральные формы: `"0 x | 1 | 2-4 | many"`.
- Стиль настроек: `SettingsGroup` / `Item` / `ItemMedia` / `ItemContent` / `ItemTitle` / `ItemSubtitle` / `ItemActions`; иконки `~icons/tabler/*` размером `size-6`; группы разделяются `class="mt-3"`.
- Методы репозитория возвращают `Result<T, Error>` через локальный хелпер `runSafe` (уже есть в `stats.repository.ts`).
- Проверки: `npm run type-check` (vue-tsc), `npx vitest run <file>` для точечных тестов, `npm run lint` в финале.
- ProfilePage (`/profile`) не трогаем; существующие сигнатуры композаблов должны остаться обратносовместимыми (обычные значения по-прежнему принимаются).

---

### Task 1: Репозиторий — `SESSION_GAP_MS`, `summary()`, `deleteAllEvents()`

**Files:**
- Modify: `src/db/repositories/stats.repository.ts`
- Modify: `src/modules/recommendations/service/session-builder.service.ts:5` (импорт константы вместо локальной)
- Create: `src/db/repositories/__tests__/stats.repository.test.ts`

**Interfaces:**
- Consumes: `db.listenEvents` (Dexie), `runSafe` (уже в файле).
- Produces:
  - `export const SESSION_GAP_MS = 30 * 60 * 1000` (из `stats.repository.ts`)
  - `export interface StatsSummary { totalSeconds: number; playsCount: number; uniqueTracks: number; uniqueArtists: number; completedCount: number; skippedCount: number }`
  - `statsRepository.summary(since?: number): Promise<Result<StatsSummary, Error>>`
  - `statsRepository.deleteAllEvents(): Promise<Result<void, Error>>`
  - module-level `function localDayKey(d: Date): string` (используется в Task 2)

- [ ] **Step 1: Написать падающие тесты**

Создать `src/db/repositories/__tests__/stats.repository.test.ts`:

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import type { ListenEventEntity } from "@/db/entities";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { statsRepository } from "../stats.repository";

let seq = 0;
function makeEvent(overrides: Partial<ListenEventEntity> = {}): ListenEventEntity {
  seq += 1;
  return {
    id: `e${seq}`,
    trackId: "t1" as TrackId,
    artistId: "a1" as ArtistId,
    albumId: "al1" as AlbumId,
    startedAt: Date.now(),
    secondsListened: 100,
    trackDuration: 200,
    completed: true,
    skipped: false,
    ...overrides,
  };
}

async function seed(...events: ListenEventEntity[]) {
  await db.listenEvents.bulkAdd(events);
}

beforeEach(async () => {
  await db.open();
  await db.listenEvents.clear();
});

describe("summary", () => {
  it("returns zeros when there are no events", async () => {
    const result = await statsRepository.summary();
    expect(result._unsafeUnwrap()).toEqual({
      totalSeconds: 0,
      playsCount: 0,
      uniqueTracks: 0,
      uniqueArtists: 0,
      completedCount: 0,
      skippedCount: 0,
    });
  });

  it("aggregates seconds, plays, uniques, completed and skipped", async () => {
    await seed(
      makeEvent({ trackId: "t1" as TrackId, artistId: "a1" as ArtistId, secondsListened: 60, completed: true }),
      makeEvent({ trackId: "t1" as TrackId, artistId: "a1" as ArtistId, secondsListened: 40, completed: false }),
      makeEvent({ trackId: "t2" as TrackId, artistId: "a2" as ArtistId, secondsListened: 30, completed: false, skipped: true }),
    );
    const s = (await statsRepository.summary())._unsafeUnwrap();
    // totalSeconds включает и пропущенные события; plays/uniques — только не-skipped.
    expect(s.totalSeconds).toBe(130);
    expect(s.playsCount).toBe(2);
    expect(s.uniqueTracks).toBe(1);
    expect(s.uniqueArtists).toBe(1);
    expect(s.completedCount).toBe(1);
    expect(s.skippedCount).toBe(1);
  });

  it("respects the since filter", async () => {
    const now = Date.now();
    await seed(
      makeEvent({ startedAt: now - 10 * 86_400_000, secondsListened: 500 }),
      makeEvent({ startedAt: now - 1000, secondsListened: 60 }),
    );
    const s = (await statsRepository.summary(now - 86_400_000))._unsafeUnwrap();
    expect(s.totalSeconds).toBe(60);
    expect(s.playsCount).toBe(1);
  });
});

describe("deleteAllEvents", () => {
  it("removes every listen event", async () => {
    await seed(makeEvent(), makeEvent(), makeEvent());
    (await statsRepository.deleteAllEvents())._unsafeUnwrap();
    expect(await db.listenEvents.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run src/db/repositories/__tests__/stats.repository.test.ts`
Expected: FAIL — `summary is not a function` / `deleteAllEvents is not a function`.

- [ ] **Step 3: Реализация в `stats.repository.ts`**

Добавить после существующих интерфейсов (`SonicProfile` и т.д.):

```ts
export const SESSION_GAP_MS = 30 * 60 * 1000;

export interface StatsSummary {
  totalSeconds: number;
  playsCount: number;
  uniqueTracks: number;
  uniqueArtists: number;
  completedCount: number;
  skippedCount: number;
}

/** Ключ локального дня (не UTC): "2026-05-03". */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
```

В класс `StatsRepository` добавить (рядом с `totalListeningSeconds`):

```ts
async summary(since?: number): Promise<Result<StatsSummary, Error>> {
  return runSafe(async () => {
    const events = since
      ? await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray()
      : await db.listenEvents.toArray();

    const tracks = new Set<string>();
    const artists = new Set<string>();
    const result: StatsSummary = {
      totalSeconds: 0,
      playsCount: 0,
      uniqueTracks: 0,
      uniqueArtists: 0,
      completedCount: 0,
      skippedCount: 0,
    };

    for (const e of events) {
      result.totalSeconds += e.secondsListened;
      if (e.skipped) {
        result.skippedCount++;
        continue;
      }
      result.playsCount++;
      if (e.completed) result.completedCount++;
      tracks.add(e.trackId);
      artists.add(e.artistId);
    }

    result.uniqueTracks = tracks.size;
    result.uniqueArtists = artists.size;
    return result;
  });
}

async deleteAllEvents(): Promise<Result<void, Error>> {
  return runSafe(async () => {
    await db.listenEvents.clear();
  });
}
```

В `src/modules/recommendations/service/session-builder.service.ts` удалить строку `const SESSION_GAP_MS = 30 * 60 * 1000;` и добавить импорт:

```ts
import { SESSION_GAP_MS } from "@/db/repositories/stats.repository";
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run src/db/repositories/__tests__/stats.repository.test.ts src/modules/recommendations/service/session-builder.service.test.ts`
Expected: PASS (оба файла; session-builder не должен сломаться от переноса константы).

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/stats.repository.ts src/db/repositories/__tests__/stats.repository.test.ts src/modules/recommendations/service/session-builder.service.ts
git commit -m "feat(stats): summary and deleteAllEvents repository methods, shared SESSION_GAP_MS"
```

---

### Task 2: Репозиторий — `hourlyActivity()`, `records()`

**Files:**
- Modify: `src/db/repositories/stats.repository.ts`
- Modify: `src/db/repositories/__tests__/stats.repository.test.ts`

**Interfaces:**
- Consumes: `SESSION_GAP_MS`, `localDayKey` из Task 1.
- Produces:
  - `statsRepository.hourlyActivity(since?: number): Promise<Result<number[], Error>>` — массив из 24 чисел (секунды по часам локального времени).
  - `export interface StatsRecords { busiestDay: { date: string; seconds: number } | null; mostRepeatedTrackId: TrackId | null; mostRepeatedCount: number; longestSessionSeconds: number }`
  - `statsRepository.records(since?: number): Promise<Result<StatsRecords, Error>>`

- [ ] **Step 1: Дописать падающие тесты** (в тот же файл)

```ts
describe("hourlyActivity", () => {
  it("buckets seconds by local hour", async () => {
    const at = (h: number) => new Date(2026, 4, 3, h, 15, 0).getTime();
    await seed(
      makeEvent({ startedAt: at(9), secondsListened: 100 }),
      makeEvent({ startedAt: at(9), secondsListened: 50 }),
      makeEvent({ startedAt: at(22), secondsListened: 30 }),
    );
    const hours = (await statsRepository.hourlyActivity())._unsafeUnwrap();
    expect(hours).toHaveLength(24);
    expect(hours[9]).toBe(150);
    expect(hours[22]).toBe(30);
    expect(hours[0]).toBe(0);
  });
});

describe("records", () => {
  it("returns empty records for no events", async () => {
    const r = (await statsRepository.records())._unsafeUnwrap();
    expect(r).toEqual({
      busiestDay: null,
      mostRepeatedTrackId: null,
      mostRepeatedCount: 0,
      longestSessionSeconds: 0,
    });
  });

  it("finds busiest local day, most repeated track and longest session", async () => {
    const day1 = new Date(2026, 4, 3, 12, 0, 0).getTime();
    const day2 = new Date(2026, 4, 4, 12, 0, 0).getTime();
    const MIN = 60_000;
    await seed(
      // день 1: одна длинная сессия из трёх событий подряд (gap < 30 мин)
      makeEvent({ trackId: "t1" as TrackId, startedAt: day1, secondsListened: 600 }),
      makeEvent({ trackId: "t2" as TrackId, startedAt: day1 + 10 * MIN, secondsListened: 600 }),
      makeEvent({ trackId: "t1" as TrackId, startedAt: day1 + 20 * MIN, secondsListened: 600 }),
      // день 2: отдельная короткая сессия (gap > 30 мин от предыдущей)
      makeEvent({ trackId: "t3" as TrackId, startedAt: day2, secondsListened: 300 }),
      // пропущенное событие не считается ни в repeat, ни в сессии
      makeEvent({ trackId: "t3" as TrackId, startedAt: day2 + MIN, secondsListened: 300, skipped: true }),
    );
    const r = (await statsRepository.records())._unsafeUnwrap();
    expect(r.busiestDay).toEqual({ date: "2026-05-03", seconds: 1800 });
    expect(r.mostRepeatedTrackId).toBe("t1");
    expect(r.mostRepeatedCount).toBe(2);
    expect(r.longestSessionSeconds).toBe(1800);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run src/db/repositories/__tests__/stats.repository.test.ts`
Expected: FAIL — `hourlyActivity is not a function` / `records is not a function`.

- [ ] **Step 3: Реализация**

Интерфейс рядом с `StatsSummary`:

```ts
export interface StatsRecords {
  busiestDay: { date: string; seconds: number } | null;
  mostRepeatedTrackId: TrackId | null;
  mostRepeatedCount: number;
  longestSessionSeconds: number;
}
```

(`TrackId` уже импортирован в файле.)

Методы в классе:

```ts
async hourlyActivity(since?: number): Promise<Result<number[], Error>> {
  return runSafe(async () => {
    const events = since
      ? await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray()
      : await db.listenEvents.toArray();

    const hours = new Array<number>(24).fill(0);
    for (const e of events) {
      hours[new Date(e.startedAt).getHours()] += e.secondsListened;
    }
    return hours;
  });
}

async records(since?: number): Promise<Result<StatsRecords, Error>> {
  return runSafe(async () => {
    const events = since
      ? await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray()
      : await db.listenEvents.toArray();

    const byDay = new Map<string, number>();
    for (const e of events) {
      const key = localDayKey(new Date(e.startedAt));
      byDay.set(key, (byDay.get(key) ?? 0) + e.secondsListened);
    }
    let busiestDay: StatsRecords["busiestDay"] = null;
    for (const [date, seconds] of byDay) {
      if (!busiestDay || seconds > busiestDay.seconds) busiestDay = { date, seconds };
    }

    const counts = new Map<TrackId, number>();
    for (const e of events) {
      if (e.skipped) continue;
      counts.set(e.trackId, (counts.get(e.trackId) ?? 0) + 1);
    }
    let mostRepeatedTrackId: TrackId | null = null;
    let mostRepeatedCount = 0;
    for (const [id, count] of counts) {
      if (count > mostRepeatedCount) {
        mostRepeatedTrackId = id;
        mostRepeatedCount = count;
      }
    }

    const played = events
      .filter(e => !e.skipped)
      .sort((a, b) => a.startedAt - b.startedAt);
    let longestSessionSeconds = 0;
    let current = 0;
    let prevStartedAt: number | null = null;
    for (const e of played) {
      if (prevStartedAt !== null && e.startedAt - prevStartedAt > SESSION_GAP_MS) {
        current = 0;
      }
      current += e.secondsListened;
      longestSessionSeconds = Math.max(longestSessionSeconds, current);
      prevStartedAt = e.startedAt;
    }

    return { busiestDay, mostRepeatedTrackId, mostRepeatedCount, longestSessionSeconds };
  });
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run src/db/repositories/__tests__/stats.repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/stats.repository.ts src/db/repositories/__tests__/stats.repository.test.ts
git commit -m "feat(stats): hourlyActivity and records repository methods"
```

---

### Task 3: Репозиторий — `streaks()`

**Files:**
- Modify: `src/db/repositories/stats.repository.ts`
- Modify: `src/db/repositories/__tests__/stats.repository.test.ts`

**Interfaces:**
- Produces:
  - `export interface StreakInfo { current: number; best: number }`
  - `statsRepository.streaks(now?: number): Promise<Result<StreakInfo, Error>>` — по локальным дням за последние 365 дней; `now` параметризован для тестов, по умолчанию `Date.now()`. Сегодняшний день без прослушиваний не рвёт текущую серию (день ещё не кончился).

- [ ] **Step 1: Дописать падающие тесты**

```ts
describe("streaks", () => {
  const NOW = new Date(2026, 4, 10, 15, 0, 0).getTime();
  const dayAgo = (n: number, hour = 12) => {
    const d = new Date(2026, 4, 10, hour, 0, 0);
    d.setDate(d.getDate() - n);
    return d.getTime();
  };

  it("returns zeros without events", async () => {
    const s = (await statsRepository.streaks(NOW))._unsafeUnwrap();
    expect(s).toEqual({ current: 0, best: 0 });
  });

  it("counts current streak including today", async () => {
    await seed(
      makeEvent({ startedAt: dayAgo(0) }),
      makeEvent({ startedAt: dayAgo(1) }),
      makeEvent({ startedAt: dayAgo(2) }),
      // разрыв на day 3
      makeEvent({ startedAt: dayAgo(4) }),
    );
    const s = (await statsRepository.streaks(NOW))._unsafeUnwrap();
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
  });

  it("today without listening does not break the streak", async () => {
    await seed(
      makeEvent({ startedAt: dayAgo(1) }),
      makeEvent({ startedAt: dayAgo(2) }),
    );
    const s = (await statsRepository.streaks(NOW))._unsafeUnwrap();
    expect(s.current).toBe(2);
  });

  it("best streak can be longer than current", async () => {
    await seed(
      makeEvent({ startedAt: dayAgo(0) }),
      // разрыв
      makeEvent({ startedAt: dayAgo(3) }),
      makeEvent({ startedAt: dayAgo(4) }),
      makeEvent({ startedAt: dayAgo(5) }),
      makeEvent({ startedAt: dayAgo(6) }),
    );
    const s = (await statsRepository.streaks(NOW))._unsafeUnwrap();
    expect(s.current).toBe(1);
    expect(s.best).toBe(4);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run src/db/repositories/__tests__/stats.repository.test.ts`
Expected: FAIL — `streaks is not a function`.

- [ ] **Step 3: Реализация**

Интерфейс:

```ts
export interface StreakInfo {
  current: number;
  best: number;
}
```

Метод (365 дней достаточно — heatmap и серии считаем за последний год):

```ts
async streaks(now = Date.now()): Promise<Result<StreakInfo, Error>> {
  return runSafe(async () => {
    const DAYS = 365;
    const since = now - DAYS * 86_400_000;
    const events = await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray();

    const activeDays = new Set<string>();
    for (const e of events) {
      if (e.secondsListened <= 0) continue;
      activeDays.add(localDayKey(new Date(e.startedAt)));
    }

    let best = 0;
    let run = 0;
    for (let i = DAYS; i >= 0; i--) {
      if (activeDays.has(localDayKey(new Date(now - i * 86_400_000)))) {
        run++;
        best = Math.max(best, run);
      }
      else {
        run = 0;
      }
    }

    // Текущая серия: сегодня без прослушиваний ещё не разрыв — день не кончился.
    let current = 0;
    const startOffset = activeDays.has(localDayKey(new Date(now))) ? 0 : 1;
    for (let i = startOffset; i <= DAYS; i++) {
      if (!activeDays.has(localDayKey(new Date(now - i * 86_400_000)))) break;
      current++;
    }

    return { current, best };
  });
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run src/db/repositories/__tests__/stats.repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/stats.repository.ts src/db/repositories/__tests__/stats.repository.test.ts
git commit -m "feat(stats): listening streaks repository method"
```

---

### Task 4: Данные — query keys, statsQueries, композаблы, `statsService.clearHistory()`

**Files:**
- Modify: `src/queries/query-keys.ts:100-115` (раздел `stats`)
- Modify: `src/queries/stats.queries.ts`
- Modify: `src/composables/useStatsQueries.ts` (полная замена содержимого — перевод на `MaybeRefOrGetter` + новые композаблы)
- Modify: `src/services/stats.service.ts`

**Interfaces:**
- Consumes: `statsRepository.summary/hourlyActivity/records/streaks/deleteAllEvents` (Tasks 1–3), типы `StatsSummary`, `StatsRecords`, `StreakInfo`.
- Produces (для UI-тасков):
  - `useStatsSummary(since: MaybeRefOrGetter<number | undefined>)` → `{ data: Ref<StatsSummary | undefined>, isLoading }`
  - `useHourlyActivity(since)` → `{ data: Ref<number[] | undefined>, isLoading }`
  - `useStatsRecords(since)` → `{ data: Ref<StatsRecords | undefined>, isLoading }`
  - `useStreaks()` → `{ data: Ref<StreakInfo | undefined>, isLoading }`
  - `useTopTracks(limit?: MaybeRefOrGetter<number>, since?)` / `useTopArtists(...)` / `useTopGenres(...)` / `useTotalListeningTime(...)` — как раньше, но реактивные к ref/getter-аргументам.
  - `statsService.clearHistory(): Promise<void>`
  - `statsQueries.summary(since?)` — также используется напрямую страницей для проверки «есть ли история вообще».

- [ ] **Step 1: query-keys.ts — добавить ключи в раздел `stats`** (после `recentHistory`):

```ts
summary: (since?: number) => ["stats", "summary", since] as const,
hourlyActivity: (since?: number) => ["stats", "hourlyActivity", since] as const,
records: (since?: number) => ["stats", "records", since] as const,
streaks: () => ["stats", "streaks"] as const,
```

- [ ] **Step 2: stats.queries.ts — добавить запросы** (перед `recentHistory`, стиль существующих):

```ts
summary: (since?: number) =>
  queryOptions({
    queryKey: queryKeys.stats.summary(since),
    queryFn: () => unwrapResult(statsRepository.summary(since)),
    staleTime: STATS_STALE_TIME,
  }),
hourlyActivity: (since?: number) =>
  queryOptions({
    queryKey: queryKeys.stats.hourlyActivity(since),
    queryFn: () => unwrapResult(statsRepository.hourlyActivity(since)),
    staleTime: STATS_STALE_TIME,
  }),
records: (since?: number) =>
  queryOptions({
    queryKey: queryKeys.stats.records(since),
    queryFn: () => unwrapResult(statsRepository.records(since)),
    staleTime: STATS_STALE_TIME,
  }),
streaks: () =>
  queryOptions({
    queryKey: queryKeys.stats.streaks(),
    queryFn: () => unwrapResult(statsRepository.streaks()),
    staleTime: STATS_STALE_TIME,
  }),
```

- [ ] **Step 3: useStatsQueries.ts — заменить содержимое целиком:**

```ts
import { useQuery } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { statsQueries } from "@/queries/stats.queries";
import type { ArtistId, TrackId } from "@/types/ids";

type MaybeSince = MaybeRefOrGetter<number | undefined>;

export function useTopTracks(limit: MaybeRefOrGetter<number> = 10, since: MaybeSince = undefined) {
  const { data: topEntries, isLoading: isEntriesLoading } = useQuery(
    computed(() => statsQueries.topTracks(toValue(limit), toValue(since))),
  );

  const trackIds = computed(() =>
    (topEntries.value ?? []).map(entry => entry.id),
  );

  const { data: tracks, isLoading: isTracksLoading } = useQuery(
    computed(() => ({
      ...statsQueries.topTracksMeta(trackIds.value),
      enabled: trackIds.value.length > 0,
    })),
  );

  const topTracks = computed(() => {
    if (!topEntries.value || !tracks.value) {
      return [];
    }

    const trackMap = new Map(tracks.value.map(track => [track.id, track]));

    return topEntries.value
      .map(entry => ({
        ...entry,
        track: trackMap.get(entry.id as TrackId) ?? null,
      }))
      .filter(entry => entry.track !== null);
  });

  return {
    topTracks,
    isLoading: computed(() => isEntriesLoading.value || isTracksLoading.value),
  };
}

export function useTopArtists(limit: MaybeRefOrGetter<number> = 5, since: MaybeSince = undefined) {
  const { data: topEntries, isLoading: isEntriesLoading } = useQuery(
    computed(() => statsQueries.topArtists(toValue(limit), toValue(since))),
  );

  const artistIds = computed(() =>
    (topEntries.value ?? []).map(entry => entry.id),
  );

  const { data: artists, isLoading: isArtistsLoading } = useQuery(
    computed(() => ({
      ...statsQueries.topArtistsMeta(artistIds.value),
      enabled: artistIds.value.length > 0,
    })),
  );

  const topArtists = computed(() => {
    if (!topEntries.value || !artists.value) {
      return [];
    }

    const artistMap = new Map(artists.value.map(artist => [artist.id, artist]));

    return topEntries.value
      .map(entry => ({
        ...entry,
        artist: artistMap.get(entry.id as ArtistId) ?? null,
      }))
      .filter(entry => entry.artist !== null);
  });

  return {
    topArtists,
    isLoading: computed(() => isEntriesLoading.value || isArtistsLoading.value),
  };
}

export function useTotalListeningTime(since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.totalTime(toValue(since))));
}

export function useDailyActivity(days: MaybeRefOrGetter<number> = 30) {
  return useQuery(computed(() => statsQueries.dailyActivity(toValue(days))));
}

export function useTopGenres(limit: MaybeRefOrGetter<number> = 8, since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.topGenres(toValue(limit), toValue(since))));
}

export function useSonicProfile(since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.sonicProfile(toValue(since))));
}

export function useStatsSummary(since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.summary(toValue(since))));
}

export function useHourlyActivity(since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.hourlyActivity(toValue(since))));
}

export function useStatsRecords(since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.records(toValue(since))));
}

export function useStreaks() {
  return useQuery(computed(() => statsQueries.streaks()));
}
```

- [ ] **Step 4: stats.service.ts — добавить метод** (после `removeFromHistory`):

```ts
async clearHistory(): Promise<void> {
  const result = await statsRepository.deleteAllEvents();
  if (result.isErr()) throw result.error;
  await invalidateStatsQueries(queryClient);
}
```

- [ ] **Step 5: Проверить типы**

Run: `npm run type-check`
Expected: PASS (существующие вызовы композаблов с обычными значениями продолжают компилироваться).

- [ ] **Step 6: Commit**

```bash
git add src/queries/query-keys.ts src/queries/stats.queries.ts src/composables/useStatsQueries.ts src/services/stats.service.ts
git commit -m "feat(stats): queries and reactive composables for stats page, clearHistory service"
```

---

### Task 5: Маршрут, i18n, ссылка в настройках, каркас страницы с периодом

**Files:**
- Modify: `src/app/router/route-names.ts` (после `SETTINGS_NOTIFICATIONS`)
- Modify: `src/app/router/route-locations.ts` (после `settingsNotifications`)
- Modify: `src/app/router/routes/settings.ts` (после блока storage)
- Modify: `src/app/i18n/locales/en/settings.json`, `src/app/i18n/locales/ru/settings.json`
- Modify: `src/pages/settings/SettingsPage.vue` (ссылка во второй группе)
- Create: `src/pages/settings/components/stats/period.ts`
- Create: `src/pages/settings/components/stats/StatsPeriodSwitcher.vue`
- Create: `src/pages/settings/StatsSettings.vue`

**Interfaces:**
- Consumes: `statsQueries.summary` (Task 4), `Tabs/TabsList/TabsTrigger` из `@/components/ui/tabs`.
- Produces:
  - `export type StatsPeriod = "week" | "month" | "year" | "all"` и `export function periodSince(period: StatsPeriod): number | undefined` из `period.ts`.
  - Страница `/settings/stats` с `SettingsHeader`, переключателем периода, пустым состоянием; секции добавляются в последующих тасках.
  - i18n-ключи `settings.index.stats` и весь блок `settings.stats.*` (сразу все ключи, чтобы UI-таски не трогали JSON повторно).

- [ ] **Step 1: route-names.ts** — добавить `SETTINGS_STATS: "settings-stats",` после `SETTINGS_NOTIFICATIONS`.

- [ ] **Step 2: route-locations.ts** — добавить:

```ts
settingsStats: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_STATS }),
```

- [ ] **Step 3: routes/settings.ts** — после блока `/settings/storage`:

```ts
{
  path: "/settings/stats",
  name: ROUTE_NAMES.SETTINGS_STATS,
  component: () => import("@/pages/settings/StatsSettings.vue"),
  meta: {
    titleKey: "settings.stats",
    depth: 4,
  },
},
```

- [ ] **Step 4: i18n.** В `en/settings.json`: в `index` после `"storage": "Store",` добавить `"stats": "Statistics",`; после секции `"general"` добавить секцию:

```json
"stats": {
    "title": "Statistics",
    "periodWeek": "Week",
    "periodMonth": "Month",
    "periodYear": "Year",
    "periodAll": "All time",
    "summaryTime": "Listened",
    "summaryPlays": "Plays",
    "summaryArtists": "Artists",
    "streakCurrent": "{count} day in a row | {count} days in a row",
    "streakBest": "Record: {count} day | Record: {count} days",
    "topTracks": "Top tracks",
    "topArtists": "Top artists",
    "showAll": "Show all",
    "showLess": "Show less",
    "emptyPeriod": "No data for this period",
    "completionTitle": "You finish {percent}% of tracks",
    "completionSubtitle": "{completed} finished · {skipped} skipped",
    "hourlyMorning": "You mostly listen in the morning ({range})",
    "hourlyDay": "You mostly listen in the afternoon ({range})",
    "hourlyEvening": "You mostly listen in the evening ({range})",
    "hourlyNight": "You mostly listen at night ({range})",
    "records": "Records",
    "recordBusiestDay": "Busiest day",
    "recordOnRepeat": "On repeat",
    "recordLongestSession": "Longest session",
    "playsCount": "{count} play | {count} plays",
    "topGenres": "Top genres",
    "empty": "No listening history yet — play something!",
    "clear": "Clear listening history",
    "clearDesc": "Removes all listen events. Play counts on tracks stay.",
    "clearDialogTitle": "Clear listening history?",
    "clearDialogDesc": "All statistics will be reset. This cannot be undone.",
    "clearConfirm": "Clear",
    "clearConfirmCountdown": "Clear ({seconds})",
    "cleared": "Listening history cleared"
},
```

В `ru/settings.json`: в `index` после `"storage": "Хранилище",` добавить `"stats": "Статистика",`; секция:

```json
"stats": {
    "title": "Статистика",
    "periodWeek": "Неделя",
    "periodMonth": "Месяц",
    "periodYear": "Год",
    "periodAll": "Всё время",
    "summaryTime": "Прослушано",
    "summaryPlays": "Прослушиваний",
    "summaryArtists": "Артистов",
    "streakCurrent": "0 дней подряд | {count} день подряд | {count} дня подряд | {count} дней подряд",
    "streakBest": "Рекорд: 0 дней | Рекорд: {count} день | Рекорд: {count} дня | Рекорд: {count} дней",
    "topTracks": "Топ треков",
    "topArtists": "Топ артистов",
    "showAll": "Показать все",
    "showLess": "Свернуть",
    "emptyPeriod": "Нет данных за выбранный период",
    "completionTitle": "Дослушиваешь {percent}% треков",
    "completionSubtitle": "{completed} дослушано · {skipped} пропущено",
    "hourlyMorning": "Чаще всего слушаешь утром ({range})",
    "hourlyDay": "Чаще всего слушаешь днём ({range})",
    "hourlyEvening": "Чаще всего слушаешь вечером ({range})",
    "hourlyNight": "Чаще всего слушаешь ночью ({range})",
    "records": "Рекорды",
    "recordBusiestDay": "Самый активный день",
    "recordOnRepeat": "Трек на репите",
    "recordLongestSession": "Самая длинная сессия",
    "playsCount": "0 раз | {count} раз | {count} раза | {count} раз",
    "topGenres": "Топ жанров",
    "empty": "Пока нет истории прослушивания — включи что-нибудь!",
    "clear": "Очистить историю прослушивания",
    "clearDesc": "Удаляет все события прослушивания. Счётчики на треках останутся.",
    "clearDialogTitle": "Очистить историю прослушивания?",
    "clearDialogDesc": "Вся статистика будет сброшена. Это действие нельзя отменить.",
    "clearConfirm": "Очистить",
    "clearConfirmCountdown": "Очистить ({seconds})",
    "cleared": "История прослушивания очищена"
},
```

- [ ] **Step 5: SettingsPage.vue** — во второй `SettingsGroup` после ссылки на Storage добавить:

```vue
<SettingsLink
  :to="routeLocation.settingsStats()"
  :icon="IconChartBar"
  :title="$t('settings.index.stats')"
/>
```

и импорт `import IconChartBar from "~icons/tabler/chart-bar";` к остальным иконкам.

- [ ] **Step 6: period.ts:**

```ts
export type StatsPeriod = "week" | "month" | "year" | "all";

const PERIOD_DAYS: Record<Exclude<StatsPeriod, "all">, number> = {
  week: 7,
  month: 30,
  year: 365,
};

export function periodSince(period: StatsPeriod): number | undefined {
  if (period === "all") return undefined;
  return Date.now() - PERIOD_DAYS[period] * 86_400_000;
}
```

- [ ] **Step 7: StatsPeriodSwitcher.vue:**

```vue
<template>
  <Tabs
    :model-value="model"
    @update:model-value="model = $event as StatsPeriod"
  >
    <TabsList class="flex w-full">
      <TabsTrigger
        v-for="p in PERIODS"
        :key="p"
        :value="p"
        class="flex-1"
      >
        {{ $t(`settings.stats.period${capitalize(p)}`) }}
      </TabsTrigger>
    </TabsList>
  </Tabs>
</template>

<script setup lang="ts">
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StatsPeriod } from "./period";

const model = defineModel<StatsPeriod>({ required: true });

const PERIODS: StatsPeriod[] = ["week", "month", "year", "all"];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>
```

- [ ] **Step 8: StatsSettings.vue (каркас):**

```vue
<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.stats.title')" />

      <template v-if="hasHistory">
        <SettingsGroup>
          <StatsPeriodSwitcher v-model="period" />
        </SettingsGroup>
        <!-- Секции добавляются в следующих тасках -->
      </template>

      <SettingsGroup v-else>
        <p class="px-4 py-8 text-center text-sm text-muted-foreground">
          {{ $t("settings.stats.empty") }}
        </p>
      </SettingsGroup>
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { Scrollable } from "@/components/ui/scrollable";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import StatsPeriodSwitcher from "./components/stats/StatsPeriodSwitcher.vue";
import { periodSince, type StatsPeriod } from "./components/stats/period";
import { statsQueries } from "@/queries/stats.queries";

const period = ref<StatsPeriod>("month");
const since = computed(() => periodSince(period.value));

// Есть ли история вообще (за всё время) — иначе показываем пустое состояние.
const { data: allTime } = useQuery(statsQueries.summary(undefined));
const hasHistory = computed(() =>
  allTime.value === undefined
  || allTime.value.totalSeconds > 0
  || allTime.value.playsCount > 0,
);
</script>
```

Замечание: `since` пока не используется в шаблоне — это нормально, секции подключатся в Tasks 6–11 (eslint не ругается на неиспользуемые setup-переменные, но если ругнётся — временно передать `:key="since"` не нужно, просто добавить `void since;` НЕ надо: в `<script setup>` переменная считается использованной после первого же подключения секции; если линт упадёт на этом промежуточном коммите — подключить Task 6 в тот же коммит).

- [ ] **Step 9: Проверка**

Run: `npm run type-check`
Expected: PASS.
Run (smoke, вручную или пропустить до Task 12): `npm run dev` → открыть `/settings` → ссылка «Статистика» ведёт на страницу с переключателем периода / пустым состоянием.

- [ ] **Step 10: Commit**

```bash
git add src/app/router src/app/i18n/locales src/pages/settings/SettingsPage.vue src/pages/settings/StatsSettings.vue src/pages/settings/components/stats
git commit -m "feat(stats): stats settings route, i18n and page skeleton with period switcher"
```

---

### Task 6: Секция «Сводка»

**Files:**
- Create: `src/pages/settings/components/stats/StatsSummary.vue`
- Modify: `src/pages/settings/StatsSettings.vue`

**Interfaces:**
- Consumes: `useStatsSummary(since)` (Task 4), `formatTotalDuration` из `@/lib/format/time`.
- Produces: `<StatsSummary :since="since" />` — prop `since?: number`.

- [ ] **Step 1: StatsSummary.vue:**

```vue
<template>
  <SettingsGroup class="mt-3">
    <div
      v-if="isLoading"
      class="mx-2 my-3 h-16 animate-pulse rounded-lg bg-background"
    />
    <div
      v-else
      class="grid grid-cols-3 gap-2 px-2 py-4"
    >
      <div class="flex flex-col items-center gap-1">
        <span class="text-lg font-semibold tabular-nums">{{ timeLabel }}</span>
        <span class="text-xs text-muted-foreground">{{ $t("settings.stats.summaryTime") }}</span>
      </div>
      <div class="flex flex-col items-center gap-1">
        <span class="text-lg font-semibold tabular-nums">{{ summary?.playsCount ?? 0 }}</span>
        <span class="text-xs text-muted-foreground">{{ $t("settings.stats.summaryPlays") }}</span>
      </div>
      <div class="flex flex-col items-center gap-1">
        <span class="text-lg font-semibold tabular-nums">{{ summary?.uniqueArtists ?? 0 }}</span>
        <span class="text-xs text-muted-foreground">{{ $t("settings.stats.summaryArtists") }}</span>
      </div>
    </div>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { useStatsSummary } from "@/composables/useStatsQueries";
import { formatTotalDuration } from "@/lib/format/time";

const props = defineProps<{ since?: number }>();

const { t } = useI18n();
const { data: summary, isLoading } = useStatsSummary(() => props.since);

const timeLabel = computed(() => formatTotalDuration(summary.value?.totalSeconds ?? 0, t));
</script>
```

- [ ] **Step 2: Подключить в StatsSettings.vue** — внутри `<template v-if="hasHistory">` после группы с переключателем:

```vue
<StatsSummary :since="since" />
```

и импорт `import StatsSummary from "./components/stats/StatsSummary.vue";`.

- [ ] **Step 3: Проверка** — `npm run type-check` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/settings/components/stats/StatsSummary.vue src/pages/settings/StatsSettings.vue
git commit -m "feat(stats): summary section"
```

---

### Task 7: Секция «Серия + heatmap» и i18n для CalendarHeatmap

**Files:**
- Create: `src/pages/settings/components/stats/StatsStreakSection.vue`
- Modify: `src/components/ui/charts/CalendarHeatmap.vue` (захардкоженный русский → i18n)
- Modify: `src/app/i18n/locales/en/common.json`, `src/app/i18n/locales/ru/common.json`
- Modify: `src/pages/settings/StatsSettings.vue`

**Interfaces:**
- Consumes: `useStreaks()`, `useDailyActivity(365)` (Task 4), `CalendarHeatmap` (`:data="DailyActivityPoint[]"`).
- Produces: `<StatsStreakSection />` — без props (серия и heatmap всегда за последний год).

- [ ] **Step 1: common.json — ключи heatmap.** В `en/common.json` (на верхний уровень, рядом с `hoursShort`):

```json
"heatmapLess": "Less",
"heatmapMore": "More",
"heatmapAria": "Listening activity calendar",
```

В `ru/common.json`:

```json
"heatmapLess": "Меньше",
"heatmapMore": "Больше",
"heatmapAria": "Календарь активности прослушивания",
```

- [ ] **Step 2: CalendarHeatmap.vue** — заменить `aria-label="Календарь активности прослушивания"` на `:aria-label="t('common.heatmapAria')"`, `<span>Меньше</span>` на `<span>{{ t("common.heatmapLess") }}</span>`, `<span>Больше</span>` на `<span>{{ t("common.heatmapMore") }}</span>` (`t` уже есть в компоненте).

- [ ] **Step 3: StatsStreakSection.vue:**

```vue
<template>
  <SettingsGroup class="mt-3">
    <Item>
      <ItemMedia>
        <IconFlame class="size-6 mr-3" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{{ $t("settings.stats.streakCurrent", streaks?.current ?? 0) }}</ItemTitle>
        <ItemSubtitle>{{ $t("settings.stats.streakBest", streaks?.best ?? 0) }}</ItemSubtitle>
      </ItemContent>
    </Item>
    <div class="px-4 pb-3">
      <div
        v-if="isDailyLoading"
        class="h-28 animate-pulse rounded-lg bg-background"
      />
      <CalendarHeatmap
        v-else
        :data="dailyActivity ?? []"
      />
    </div>
  </SettingsGroup>
</template>

<script setup lang="ts">
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { Item, ItemContent, ItemMedia, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import CalendarHeatmap from "@/components/ui/charts/CalendarHeatmap.vue";
import { useDailyActivity, useStreaks } from "@/composables/useStatsQueries";
import IconFlame from "~icons/tabler/flame";

const { data: streaks } = useStreaks();
const { data: dailyActivity, isLoading: isDailyLoading } = useDailyActivity(365);
</script>
```

- [ ] **Step 4: Подключить в StatsSettings.vue** после `<StatsSummary />`: `<StatsStreakSection />` + импорт.

- [ ] **Step 5: Проверка** — `npm run type-check` → PASS. Убедиться, что `/profile` (тоже использует CalendarHeatmap) компилируется.

- [ ] **Step 6: Commit**

```bash
git add src/pages/settings/components/stats/StatsStreakSection.vue src/components/ui/charts/CalendarHeatmap.vue src/app/i18n/locales/en/common.json src/app/i18n/locales/ru/common.json src/pages/settings/StatsSettings.vue
git commit -m "feat(stats): streak and heatmap section, i18n for CalendarHeatmap"
```

---

### Task 8: Секции «Топ треков» и «Топ артистов»

**Files:**
- Create: `src/pages/settings/components/stats/StatsTopTracks.vue`
- Create: `src/pages/settings/components/stats/StatsTopArtists.vue`
- Modify: `src/pages/settings/StatsSettings.vue`

**Interfaces:**
- Consumes: `useTopTracks(limit, since)` / `useTopArtists(limit, since)` (Task 4; `entry` = `{ id, count, secondsListened, track | artist }`), `EntityCoverImage` (`owner-type`, `owner-id`, `alt`, `image-class`), `formatTotalDuration`.
- Produces: `<StatsTopTracks :since="since" />`, `<StatsTopArtists :since="since" />`.

- [ ] **Step 1: StatsTopTracks.vue:**

```vue
<template>
  <SettingsGroup class="mt-3">
    <div class="px-4 py-3 text-primary font-medium">
      {{ $t("settings.stats.topTracks") }}
    </div>

    <div
      v-if="isLoading"
      class="mx-2 mb-2 h-40 animate-pulse rounded-lg bg-background"
    />
    <p
      v-else-if="topTracks.length === 0"
      class="px-4 pb-4 text-sm text-muted-foreground"
    >
      {{ $t("settings.stats.emptyPeriod") }}
    </p>

    <template v-else>
      <Item
        v-for="entry in topTracks"
        :key="entry.id"
      >
        <ItemMedia>
          <EntityCoverImage
            owner-type="album"
            :owner-id="entry.track!.albumId"
            :alt="entry.track!.title"
            image-class="size-10 rounded-md object-cover"
          />
        </ItemMedia>
        <ItemContent class="ml-3 min-w-0">
          <ItemTitle class="truncate">
            {{ entry.track!.title }}
          </ItemTitle>
          <ItemSubtitle class="truncate">
            {{ entry.track!.artist }}
          </ItemSubtitle>
          <div class="mt-1.5 h-1 w-full rounded-full bg-background">
            <div
              class="h-full rounded-full bg-primary"
              :style="{ width: `${barPercent(entry.secondsListened)}%` }"
            />
          </div>
        </ItemContent>
        <ItemActions>
          <span class="ml-3 shrink-0 text-sm text-muted-foreground tabular-nums">
            {{ formatTotalDuration(entry.secondsListened, t) }}
          </span>
        </ItemActions>
      </Item>

      <Button
        v-if="expanded || topTracks.length >= COLLAPSED_LIMIT"
        variant="ghost-primary"
        class="w-full"
        @click="expanded = !expanded"
      >
        {{ expanded ? $t("settings.stats.showLess") : $t("settings.stats.showAll") }}
      </Button>
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { Item, ItemActions, ItemContent, ItemMedia, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import { useTopTracks } from "@/composables/useStatsQueries";
import { formatTotalDuration } from "@/lib/format/time";

const props = defineProps<{ since?: number }>();

const COLLAPSED_LIMIT = 5;
const EXPANDED_LIMIT = 25;

const { t } = useI18n();
const expanded = ref(false);
const limit = computed(() => (expanded.value ? EXPANDED_LIMIT : COLLAPSED_LIMIT));

const { topTracks, isLoading } = useTopTracks(limit, () => props.since);

const maxSeconds = computed(() => topTracks.value[0]?.secondsListened ?? 1);
const barPercent = (seconds: number) => Math.max(2, Math.round((seconds / maxSeconds.value) * 100));
</script>
```

- [ ] **Step 2: StatsTopArtists.vue** (та же структура, артисты):

```vue
<template>
  <SettingsGroup class="mt-3">
    <div class="px-4 py-3 text-primary font-medium">
      {{ $t("settings.stats.topArtists") }}
    </div>

    <div
      v-if="isLoading"
      class="mx-2 mb-2 h-40 animate-pulse rounded-lg bg-background"
    />
    <p
      v-else-if="topArtists.length === 0"
      class="px-4 pb-4 text-sm text-muted-foreground"
    >
      {{ $t("settings.stats.emptyPeriod") }}
    </p>

    <template v-else>
      <Item
        v-for="entry in topArtists"
        :key="entry.id"
      >
        <ItemMedia>
          <EntityCoverImage
            owner-type="artist"
            :owner-id="entry.artist!.id"
            :alt="entry.artist!.name"
            image-class="size-10 rounded-full object-cover"
          />
        </ItemMedia>
        <ItemContent class="ml-3 min-w-0">
          <ItemTitle class="truncate">
            {{ entry.artist!.name }}
          </ItemTitle>
          <div class="mt-1.5 h-1 w-full rounded-full bg-background">
            <div
              class="h-full rounded-full bg-primary"
              :style="{ width: `${barPercent(entry.secondsListened)}%` }"
            />
          </div>
        </ItemContent>
        <ItemActions>
          <span class="ml-3 shrink-0 text-sm text-muted-foreground tabular-nums">
            {{ formatTotalDuration(entry.secondsListened, t) }}
          </span>
        </ItemActions>
      </Item>

      <Button
        v-if="expanded || topArtists.length >= COLLAPSED_LIMIT"
        variant="ghost-primary"
        class="w-full"
        @click="expanded = !expanded"
      >
        {{ expanded ? $t("settings.stats.showLess") : $t("settings.stats.showAll") }}
      </Button>
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import { useTopArtists } from "@/composables/useStatsQueries";
import { formatTotalDuration } from "@/lib/format/time";

const props = defineProps<{ since?: number }>();

const COLLAPSED_LIMIT = 5;
const EXPANDED_LIMIT = 25;

const { t } = useI18n();
const expanded = ref(false);
const limit = computed(() => (expanded.value ? EXPANDED_LIMIT : COLLAPSED_LIMIT));

const { topArtists, isLoading } = useTopArtists(limit, () => props.since);

const maxSeconds = computed(() => topArtists.value[0]?.secondsListened ?? 1);
const barPercent = (seconds: number) => Math.max(2, Math.round((seconds / maxSeconds.value) * 100));
</script>
```

- [ ] **Step 3: Подключить в StatsSettings.vue** после `<StatsStreakSection />`:

```vue
<StatsTopTracks :since="since" />
<StatsTopArtists :since="since" />
```

+ импорты.

- [ ] **Step 4: Проверка** — `npm run type-check` → PASS. Если тип entry.track допускает `null` и `!` не проходит линт — заменить на локальную переменную через `v-for` по `topTracks.filter(...)` не нужно: композабл уже фильтрует `entry.track !== null`, поэтому non-null assertion корректен.

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/components/stats/StatsTopTracks.vue src/pages/settings/components/stats/StatsTopArtists.vue src/pages/settings/StatsSettings.vue
git commit -m "feat(stats): top tracks and top artists sections"
```

---

### Task 9: Ряды «Дослушивания» и «Часы активности»

**Files:**
- Create: `src/pages/settings/components/stats/StatsCompletionRow.vue`
- Create: `src/pages/settings/components/stats/StatsHourlyRow.vue`
- Modify: `src/pages/settings/StatsSettings.vue`

**Interfaces:**
- Consumes: `useStatsSummary(since)` (completed/skipped), `useHourlyActivity(since)` (массив 24 чисел).
- Produces: `<StatsCompletionRow :since="since" />`, `<StatsHourlyRow :since="since" />` — оба рендерят `Item` (страница оборачивает их в одну общую `SettingsGroup`). Каждый рендерит `null`, когда данных нет.

- [ ] **Step 1: StatsCompletionRow.vue** (кольцо — тот же SVG-паттерн, что в StorageSettings):

```vue
<template>
  <Item v-if="total > 0">
    <ItemMedia>
      <div class="relative size-10 shrink-0">
        <svg
          class="size-10 -rotate-90"
          viewBox="0 0 36 36"
        >
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            class="text-background"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            class="text-primary transition-[stroke-dashoffset] duration-300"
            :stroke-dasharray="`${2 * Math.PI * 15}`"
            :stroke-dashoffset="`${2 * Math.PI * 15 * (1 - percent / 100)}`"
          />
        </svg>
        <span class="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
          {{ percent }}%
        </span>
      </div>
    </ItemMedia>
    <ItemContent class="ml-3">
      <ItemTitle>{{ $t("settings.stats.completionTitle", { percent }) }}</ItemTitle>
      <ItemSubtitle>
        {{ $t("settings.stats.completionSubtitle", {
          completed: summary?.completedCount ?? 0,
          skipped: summary?.skippedCount ?? 0,
        }) }}
      </ItemSubtitle>
    </ItemContent>
  </Item>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Item, ItemContent, ItemMedia, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import { useStatsSummary } from "@/composables/useStatsQueries";

const props = defineProps<{ since?: number }>();

const { data: summary } = useStatsSummary(() => props.since);

const total = computed(() =>
  (summary.value?.completedCount ?? 0) + (summary.value?.skippedCount ?? 0),
);
const percent = computed(() =>
  total.value === 0 ? 0 : Math.round(((summary.value?.completedCount ?? 0) / total.value) * 100),
);
</script>
```

- [ ] **Step 2: StatsHourlyRow.vue:**

```vue
<template>
  <Item v-if="peak">
    <ItemContent>
      <ItemTitle>{{ title }}</ItemTitle>
      <ItemSubtitle>
        <svg
          :width="24 * BAR_PITCH"
          :height="CHART_HEIGHT"
          class="mt-1 block"
          role="img"
          :aria-label="title"
        >
          <rect
            v-for="(seconds, hour) in hours"
            :key="hour"
            :x="hour * BAR_PITCH"
            :y="CHART_HEIGHT - barHeight(seconds)"
            :width="BAR_PITCH - 2"
            :height="barHeight(seconds)"
            rx="1"
            :class="seconds > 0 ? 'fill-primary' : 'fill-border'"
          />
        </svg>
      </ItemSubtitle>
    </ItemContent>
  </Item>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Item, ItemContent, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import { useHourlyActivity } from "@/composables/useStatsQueries";

const props = defineProps<{ since?: number }>();

const BAR_PITCH = 8;
const CHART_HEIGHT = 24;
const WINDOW = 4;

const { t } = useI18n();
const { data } = useHourlyActivity(() => props.since);

const hours = computed(() => data.value ?? []);
const maxSeconds = computed(() => Math.max(1, ...hours.value));

function barHeight(seconds: number): number {
  if (seconds <= 0) return 2;
  return Math.max(3, Math.round((seconds / maxSeconds.value) * CHART_HEIGHT));
}

// Лучшее окно из 4 подряд идущих часов (с переходом через полночь).
const peak = computed(() => {
  const h = hours.value;
  if (h.length !== 24 || h.every(s => s === 0)) return null;
  let bestStart = 0;
  let bestSum = -1;
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let i = 0; i < WINDOW; i++) sum += h[(start + i) % 24];
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = start;
    }
  }
  return { start: bestStart, end: (bestStart + WINDOW) % 24 };
});

const title = computed(() => {
  if (!peak.value) return "";
  const { start, end } = peak.value;
  const pad = (n: number) => String(n).padStart(2, "0");
  const range = `${pad(start)}:00–${pad(end)}:00`;
  const key
    = start >= 5 && start < 11 ? "hourlyMorning"
      : start >= 11 && start < 17 ? "hourlyDay"
        : start >= 17 && start < 23 ? "hourlyEvening"
          : "hourlyNight";
  return t(`settings.stats.${key}`, { range });
});
</script>
```

- [ ] **Step 3: Подключить в StatsSettings.vue** после `<StatsTopArtists />`:

```vue
<SettingsGroup class="mt-3">
  <StatsCompletionRow :since="since" />
  <StatsHourlyRow :since="since" />
</SettingsGroup>
```

+ импорты.

- [ ] **Step 4: Проверка** — `npm run type-check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/components/stats/StatsCompletionRow.vue src/pages/settings/components/stats/StatsHourlyRow.vue src/pages/settings/StatsSettings.vue
git commit -m "feat(stats): completion ring and hourly activity rows"
```

---

### Task 10: Секции «Рекорды» и «Топ жанров»

**Files:**
- Create: `src/pages/settings/components/stats/StatsRecords.vue`
- Create: `src/pages/settings/components/stats/StatsTopGenres.vue`
- Modify: `src/pages/settings/StatsSettings.vue`

**Interfaces:**
- Consumes: `useStatsRecords(since)` (`StatsRecords`), `statsQueries.topTracksMeta` (метаданные трека на репите), `useTopGenres(5, since)` (`TopGenreEntry { id, name, count, secondsListened }`), `formatTotalDuration`.
- Produces: `<StatsRecords :since="since" />`, `<StatsTopGenres :since="since" />` (жанры рендерят `null`, если данных нет).

- [ ] **Step 1: StatsRecords.vue:**

```vue
<template>
  <SettingsGroup
    v-if="records && (records.busiestDay || records.mostRepeatedTrackId)"
    class="mt-3"
  >
    <div class="px-4 py-3 text-primary font-medium">
      {{ $t("settings.stats.records") }}
    </div>

    <Item v-if="records.busiestDay">
      <ItemMedia>
        <IconCalendar class="size-6 mr-3" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{{ $t("settings.stats.recordBusiestDay") }}</ItemTitle>
        <ItemSubtitle>
          {{ busiestDayLabel }} · {{ formatTotalDuration(records.busiestDay.seconds, t) }}
        </ItemSubtitle>
      </ItemContent>
    </Item>

    <Item v-if="repeatTrack">
      <ItemMedia>
        <IconRepeat class="size-6 mr-3" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{{ $t("settings.stats.recordOnRepeat") }}</ItemTitle>
        <ItemSubtitle>
          {{ repeatTrack.title }} — {{ repeatTrack.artistName }}
          · {{ $t("settings.stats.playsCount", records.mostRepeatedCount) }}
        </ItemSubtitle>
      </ItemContent>
    </Item>

    <Item v-if="records.longestSessionSeconds > 0">
      <ItemMedia>
        <IconClock class="size-6 mr-3" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{{ $t("settings.stats.recordLongestSession") }}</ItemTitle>
        <ItemSubtitle>{{ formatTotalDuration(records.longestSessionSeconds, t) }}</ItemSubtitle>
      </ItemContent>
    </Item>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useQuery } from "@tanstack/vue-query";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { Item, ItemContent, ItemMedia, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import { useStatsRecords } from "@/composables/useStatsQueries";
import { statsQueries } from "@/queries/stats.queries";
import { formatTotalDuration } from "@/lib/format/time";
import IconCalendar from "~icons/tabler/calendar";
import IconRepeat from "~icons/tabler/repeat";
import IconClock from "~icons/tabler/clock";

const props = defineProps<{ since?: number }>();

const { t, locale } = useI18n();
const { data: records } = useStatsRecords(() => props.since);

const repeatIds = computed(() =>
  records.value?.mostRepeatedTrackId ? [records.value.mostRepeatedTrackId] : [],
);
const { data: repeatTracks } = useQuery(
  computed(() => ({
    ...statsQueries.topTracksMeta(repeatIds.value),
    enabled: repeatIds.value.length > 0,
  })),
);
const repeatTrack = computed(() => repeatTracks.value?.[0] ?? null);

const busiestDayLabel = computed(() => {
  const day = records.value?.busiestDay;
  if (!day) return "";
  // day.date — локальный ключ "YYYY-MM-DD"; T00:00:00 парсится как локальная полночь.
  return new Intl.DateTimeFormat(locale.value, { day: "numeric", month: "long" })
    .format(new Date(`${day.date}T00:00:00`));
});
</script>
```

Замечание: поле имени артиста у трека — проверить его в `TrackEntity` (`artistName`); если оно называется иначе, использовать фактическое.

- [ ] **Step 2: StatsTopGenres.vue:**

```vue
<template>
  <SettingsGroup
    v-if="genres.length > 0"
    class="mt-3"
  >
    <div class="px-4 py-3 text-primary font-medium">
      {{ $t("settings.stats.topGenres") }}
    </div>
    <div class="flex flex-col gap-2 px-4 pb-4">
      <div
        v-for="genre in genres"
        :key="genre.id"
        class="flex items-center gap-3"
      >
        <span class="w-28 shrink-0 truncate text-sm">{{ genre.name }}</span>
        <div class="h-1.5 flex-1 rounded-full bg-background">
          <div
            class="h-full rounded-full bg-primary"
            :style="{ width: `${barPercent(genre.secondsListened)}%` }"
          />
        </div>
        <span class="shrink-0 text-sm text-muted-foreground tabular-nums">
          {{ formatTotalDuration(genre.secondsListened, t) }}
        </span>
      </div>
    </div>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { useTopGenres } from "@/composables/useStatsQueries";
import { formatTotalDuration } from "@/lib/format/time";

const props = defineProps<{ since?: number }>();

const { t } = useI18n();
const { data } = useTopGenres(5, () => props.since);

const genres = computed(() => data.value ?? []);
const maxSeconds = computed(() => genres.value[0]?.secondsListened ?? 1);
const barPercent = (seconds: number) => Math.max(2, Math.round((seconds / maxSeconds.value) * 100));
</script>
```

- [ ] **Step 3: Подключить в StatsSettings.vue** после группы completion/hourly:

```vue
<StatsRecords :since="since" />
<StatsTopGenres :since="since" />
```

+ импорты.

- [ ] **Step 4: Проверка** — `npm run type-check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/components/stats/StatsRecords.vue src/pages/settings/components/stats/StatsTopGenres.vue src/pages/settings/StatsSettings.vue
git commit -m "feat(stats): records and top genres sections"
```

---

### Task 11: Очистка истории

**Files:**
- Create: `src/pages/settings/components/stats/ClearHistoryDialog.vue`
- Modify: `src/pages/settings/StatsSettings.vue`

**Interfaces:**
- Consumes: `statsService.clearHistory()` (Task 4), Dialog-компоненты `@/components/ui/dialog`, `Button`, `toast` из `vue-sonner`.
- Produces: кнопка + диалог с 3-секундным каунтдауном (паттерн `ClearAllDataDialog`).

- [ ] **Step 1: ClearHistoryDialog.vue:**

```vue
<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ $t("settings.stats.clearDialogTitle") }}</DialogTitle>
        <DialogDescription>
          {{ $t("settings.stats.clearDialogDesc") }}
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button
          variant="ghost-primary"
          @click="emit('update:open', false)"
        >
          {{ $t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          :disabled="countdown > 0 || pending"
          @click="emit('confirm')"
        >
          {{ countdown > 0
            ? $t("settings.stats.clearConfirmCountdown", { seconds: countdown })
            : $t("settings.stats.clearConfirm") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  "confirm": [];
}>();

const COUNTDOWN_SECONDS = 3;
const countdown = ref(COUNTDOWN_SECONDS);
let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

watch(() => props.open, (open) => {
  stopTimer();
  if (!open) return;
  countdown.value = COUNTDOWN_SECONDS;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) stopTimer();
  }, 1000);
}, { immediate: true });

onBeforeUnmount(stopTimer);
</script>
```

- [ ] **Step 2: StatsSettings.vue** — в конец `<template v-if="hasHistory">`:

```vue
<SettingsGroup class="mt-3">
  <div class="px-4 py-3">
    <div class="mb-1 text-primary font-medium">
      {{ $t("settings.stats.clear") }}
    </div>
    <div class="text-sm text-muted-foreground">
      {{ $t("settings.stats.clearDesc") }}
    </div>
  </div>
  <Button
    class="w-full h-14 justify-start"
    size="xl"
    variant="ghost-primary"
    :disabled="isClearing"
    @click="isClearOpen = true"
  >
    <IconTrash class="size-6" />
    {{ $t("settings.stats.clear") }}
  </Button>
</SettingsGroup>
```

После `</Scrollable>`-внутреннего контента (рядом, внутри корневого div) добавить:

```vue
<ClearHistoryDialog
  v-model:open="isClearOpen"
  :pending="isClearing"
  @confirm="handleClearConfirm"
/>
```

В `<script setup>` добавить:

```ts
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import IconTrash from "~icons/tabler/trash";
import ClearHistoryDialog from "./components/stats/ClearHistoryDialog.vue";
import { statsService } from "@/services/stats.service";

const { t } = useI18n();
const isClearOpen = ref(false);
const isClearing = ref(false);

async function handleClearConfirm() {
  isClearing.value = true;
  try {
    await statsService.clearHistory();
    isClearOpen.value = false;
    toast.success(t("settings.stats.cleared"));
  }
  finally {
    isClearing.value = false;
  }
}
```

- [ ] **Step 3: Проверка** — `npm run type-check` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/settings/components/stats/ClearHistoryDialog.vue src/pages/settings/StatsSettings.vue
git commit -m "feat(stats): clear listening history with confirm dialog"
```

---

### Task 12: Финальная верификация

**Files:** без новых файлов; фиксы по результатам проверок.

- [ ] **Step 1:** `npm run type-check` → PASS.
- [ ] **Step 2:** `npm run lint` → без новых ошибок (при ошибках — `npm run lint:fix`, остальное руками).
- [ ] **Step 3:** `npx vitest run` → все тесты проекта зелёные.
- [ ] **Step 4: Ручной smoke** (`npm run dev`): открыть `/settings` → «Статистика»; проверить: переключение периодов меняет цифры; топы раскрываются «Показать все»; при пустой БД — пустое состояние; очистка истории с каунтдауном работает и статистика обнуляется; `/profile` не сломан.
- [ ] **Step 5:** Итоговый коммит фиксов, если были:

```bash
git add -A
git commit -m "fix(stats): final polish after verification"
```
