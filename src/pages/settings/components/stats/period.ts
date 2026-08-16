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
