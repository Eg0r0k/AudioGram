import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSessions, buildCoOccurrenceMatrix } from "@/modules/recommendations/service/session-builder.service";
import type { TrackId } from "@/types/ids";

const tid = (s: string) => s as TrackId;

const MINUTE = 60_000;
// SESSION_GAP_MS = 30 * 60 * 1000 = 30 мин.
// Условие строгое: gap > SESSION_GAP_MS, поэтому используем 31 мин.
const OVER_GAP = 31 * MINUTE;

vi.mock("@/db", () => ({
  db: {
    listenEvents: {
      where: vi.fn().mockReturnThis(),
      aboveOrEqual: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}));

const { db } = await import("@/db");
const mockToArray = db.listenEvents.toArray as ReturnType<typeof vi.fn>;

function makeEvent(
  trackId: TrackId,
  startedAt: number,
  opts: { skipped?: boolean } = {},
) {
  return {
    id: crypto.randomUUID(),
    trackId,
    artistId: "a" as any,
    albumId: "al" as any,
    startedAt,
    secondsListened: 180,
    trackDuration: 200_000,
    completed: true,
    skipped: opts.skipped ?? false,
  };
}

// ── buildSessions ──────────────────────────────────────────────────────────

describe("buildSessions", () => {
  beforeEach(() => {
    mockToArray.mockResolvedValue([]);
  });

  it("returns empty array when no events", async () => {
    expect(await buildSessions()).toEqual([]);
  });

  it("returns empty array when all events are skipped", async () => {
    const base = Date.now() - 2 * 60 * 60_000;
    mockToArray.mockResolvedValue([
      makeEvent(tid("A"), base, { skipped: true }),
      makeEvent(tid("B"), base + MINUTE, { skipped: true }),
    ]);
    expect(await buildSessions()).toEqual([]);
  });

  it("groups consecutive events within 30 min into one session", async () => {
    const base = Date.now() - 2 * 60 * 60_000;
    mockToArray.mockResolvedValue([
      makeEvent(tid("A"), base),
      makeEvent(tid("B"), base + 3 * MINUTE),
      makeEvent(tid("C"), base + 6 * MINUTE),
    ]);
    const sessions = await buildSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual([tid("A"), tid("B"), tid("C")]);
  });

  it("splits into separate sessions when gap > 30 min", async () => {
    const base = Date.now() - 4 * 60 * 60_000;
    mockToArray.mockResolvedValue([
      makeEvent(tid("A"), base),
      makeEvent(tid("B"), base + MINUTE),
      // Gap = OVER_GAP - MINUTE = 30 мин от B → строго больше 30 мин
      makeEvent(tid("C"), base + MINUTE + OVER_GAP),
      makeEvent(tid("D"), base + MINUTE + OVER_GAP + MINUTE),
    ]);
    const sessions = await buildSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toEqual([tid("A"), tid("B")]);
    expect(sessions[1]).toEqual([tid("C"), tid("D")]);
  });

  it("ignores sessions shorter than 2 tracks", async () => {
    const base = Date.now() - 3 * 60 * 60_000;
    mockToArray.mockResolvedValue([
      makeEvent(tid("A"), base),
      // Gap → новая сессия только из одного трека — должна быть отброшена
      makeEvent(tid("B"), base + OVER_GAP),
      makeEvent(tid("C"), base + OVER_GAP + MINUTE),
    ]);
    const sessions = await buildSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual([tid("B"), tid("C")]);
  });

  it("deduplicates consecutive repeats within session (A, A, B → A, B)", async () => {
    const base = Date.now() - 2 * 60 * 60_000;
    mockToArray.mockResolvedValue([
      makeEvent(tid("A"), base),
      makeEvent(tid("A"), base + MINUTE),
      makeEvent(tid("B"), base + 2 * MINUTE),
    ]);
    const sessions = await buildSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual([tid("A"), tid("B")]);
  });

  it("keeps non-consecutive repeat (A, B, A pattern)", async () => {
    const base = Date.now() - 2 * 60 * 60_000;
    mockToArray.mockResolvedValue([
      makeEvent(tid("A"), base),
      makeEvent(tid("B"), base + MINUTE),
      makeEvent(tid("A"), base + 2 * MINUTE),
    ]);
    const sessions = await buildSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual([tid("A"), tid("B"), tid("A")]);
  });
});

// ── buildCoOccurrenceMatrix ────────────────────────────────────────────────

describe("buildCoOccurrenceMatrix", () => {
  it("returns empty map for empty sessions", () => {
    expect(buildCoOccurrenceMatrix([]).size).toBe(0);
  });

  it("creates symmetric pairs for two tracks in the same session", () => {
    const matrix = buildCoOccurrenceMatrix([[tid("A"), tid("B")]]);
    expect(matrix.get(tid("A"))?.has(tid("B"))).toBe(true);
    expect(matrix.get(tid("B"))?.has(tid("A"))).toBe(true);
    const ab = matrix.get(tid("A"))!.get(tid("B"))!;
    const ba = matrix.get(tid("B"))!.get(tid("A"))!;
    expect(ab).toBeCloseTo(ba, 10);
  });

  it("does not create self-pairs", () => {
    const matrix = buildCoOccurrenceMatrix([[tid("A"), tid("B")]]);
    expect(matrix.get(tid("A"))?.has(tid("A"))).toBeFalsy();
    expect(matrix.get(tid("B"))?.has(tid("B"))).toBeFalsy();
  });

  it("normalizes to 1.0 when two tracks always appear together", () => {
    // A и B в 2 сессиях по 2 раза → raw=2, sqrt(2*2)=2 → score=1.0
    const matrix = buildCoOccurrenceMatrix([
      [tid("A"), tid("B")],
      [tid("A"), tid("B")],
    ]);
    expect(matrix.get(tid("A"))!.get(tid("B"))!).toBeCloseTo(1.0, 5);
  });

  it("popular track gets lower co-occurrence score with rare track", () => {
    // A+B: 1 раз, A+C: 9 раз → score(A,B) < score(A,C)
    const sessions: TrackId[][] = [
      [tid("A"), tid("B")],
      ...Array.from({ length: 9 }, () => [tid("A"), tid("C")]),
    ];
    const matrix = buildCoOccurrenceMatrix(sessions);
    const abScore = matrix.get(tid("A"))!.get(tid("B"))!;
    const acScore = matrix.get(tid("A"))!.get(tid("C"))!;
    expect(abScore).toBeLessThan(acScore);
  });

  it("tracks never in the same session have no co-occurrence entry", () => {
    const matrix = buildCoOccurrenceMatrix([
      [tid("A"), tid("B")],
      [tid("C"), tid("D")],
    ]);
    expect(matrix.get(tid("A"))?.has(tid("C"))).toBeFalsy();
    expect(matrix.get(tid("B"))?.has(tid("D"))).toBeFalsy();
  });
});
