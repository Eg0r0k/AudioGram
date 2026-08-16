import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("dailyActivity", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("buckets events by local calendar day, not UTC day", async () => {
    // "Сейчас" фиксируем на 01:00 по местному времени — независимо от TZ,
    // в которой реально запущен тест, а не только для смещения автора (UTC+3).
    // Ожидаемый ключ считаем отдельной, независимой от продакшн-кода формулой
    // (getFullYear/getMonth/getDate), а не через toISOString()/UTC —
    // так тест доказывает локальное бакетирование честно в любом часовом поясе:
    // если бы dailyActivity() бакетировал по UTC (как до фикса), при ненулевом
    // смещении TZ событие попало бы в соседний UTC-день и точка с expectedKey
    // осталась бы нулевой.
    const now = new Date(2026, 4, 3, 1, 0, 0);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);

    const expectedKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    await seed(makeEvent({ startedAt: now.getTime(), secondsListened: 42 }));

    const points = (await statsRepository.dailyActivity(3))._unsafeUnwrap();
    const point = points.find(p => p.date === expectedKey);
    expect(point).toBeDefined();
    expect(point?.seconds).toBe(42);

    // Непрерывный ряд дат тоже должен быть локальным: последняя точка — "сегодня".
    expect(points[points.length - 1]?.date).toBe(expectedKey);
  });
});

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
