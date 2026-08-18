import { describe, expect, it } from "vitest";
import {
  HEAT_LEVELS,
  levelFor,
  toCells,
  visibleWeeks,
} from "../calendar-heatmap";
import type { DailyActivityPoint } from "@/db/repositories/stats.repository";

const dayKey = (daysAgo: number, base = new Date(2026, 7, 17)): string => {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

// 2026-08-17 is a Monday; a year of days ending on it.
const yearOfDays = (): DailyActivityPoint[] =>
  Array.from({ length: 365 }, (_, i) => ({
    date: dayKey(364 - i),
    seconds: i,
  }));

describe("visibleWeeks", () => {
  it("keeps only the requested tail and starts the first column on Monday", () => {
    const weeks = visibleWeeks(toCells(yearOfDays()), 10);

    expect(weeks.length).toBeLessThanOrEqual(10);
    expect(weeks[0][0].dayOfWeek).toBe(0);
    for (const week of weeks.slice(0, -1)) {
      expect(week).toHaveLength(7);
    }
  });

  it("leaves the current partial week as the last column", () => {
    const weeks = visibleWeeks(toCells(yearOfDays()), 8);
    const last = weeks[weeks.length - 1];

    // The series ends on a Monday, so the current week has exactly one day.
    expect(last).toHaveLength(1);
    expect(last[0].dayOfWeek).toBe(0);
  });

  it("returns everything when the window exceeds the data", () => {
    const days = yearOfDays().slice(-14);
    const weeks = visibleWeeks(toCells(days), 53);

    expect(weeks.flat().length).toBeGreaterThanOrEqual(8);
    expect(weeks[0][0].dayOfWeek).toBe(0);
  });
});

describe("levelFor", () => {
  it("maps zero to the empty level", () => {
    expect(levelFor(0, 100)).toBe(0);
  });

  it("quantizes onto exactly the legend's steps", () => {
    const seen = new Set(
      [1, 10, 25, 26, 50, 51, 75, 76, 99, 100].map(s => levelFor(s, 100)),
    );
    for (const level of seen) {
      expect(HEAT_LEVELS).toContain(level);
    }
    expect(levelFor(100, 100)).toBe(1);
    expect(levelFor(1, 100)).toBe(HEAT_LEVELS[0]);
  });
});
