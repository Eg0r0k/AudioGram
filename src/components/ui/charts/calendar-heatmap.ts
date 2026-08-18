import { clamp } from "@/lib/math";
import type { DailyActivityPoint } from "@/db/repositories/stats.repository";

export interface HeatmapCell extends DailyActivityPoint {
  dayOfWeek: number;
}

export const MAX_WEEKS = 53;

export const MIN_WEEK_PITCH = 16;

export const toCells = (points: DailyActivityPoint[]): HeatmapCell[] =>
  points.map(point => ({
    ...point,
    dayOfWeek: (new Date(`${point.date}T00:00:00`).getDay() + 6) % 7,
  }));

export const visibleWeeks = (cells: HeatmapCell[], weekCount: number): HeatmapCell[][] => {
  let sliced = cells.slice(-weekCount * 7);
  const firstMonday = sliced.findIndex(cell => cell.dayOfWeek === 0);
  if (firstMonday > 0) sliced = sliced.slice(firstMonday);

  const result: HeatmapCell[][] = [];
  let current: HeatmapCell[] = [];
  for (const cell of sliced) {
    if (current.length > 0 && cell.dayOfWeek === 0) {
      result.push(current);
      current = [];
    }
    current.push(cell);
  }
  if (current.length > 0) result.push(current);
  return result;
};

export const HEAT_LEVELS = [0.25, 0.5, 0.75, 1] as const;

export const levelFor = (seconds: number, maxSeconds: number): number => {
  if (seconds <= 0) return 0;
  const ratio = seconds / Math.max(1, maxSeconds);
  const step = clamp(Math.ceil(ratio * HEAT_LEVELS.length), 1, HEAT_LEVELS.length);
  return HEAT_LEVELS[step - 1];
};
