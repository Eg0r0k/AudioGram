export const formatDuration = (s: number): string => {
  if (!isFinite(s) || s < 0) return "0:00";
  const totalSeconds = Math.floor(Math.abs(s));

  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const formatTotalDuration = (
  seconds: number,
  t: (key: string, params?: Record<string, unknown>) => string,
): string => {
  if (!isFinite(seconds) || seconds <= 0) {
    return t("common.minutesShort", { count: 0 });
  }

  const totalMinutes = Math.floor(seconds / 60);

  if (totalMinutes < 60) {
    return t("common.minutesShort", { count: totalMinutes });
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return t("common.hoursShort", { count: hours });
  }

  return `${t("common.hoursShort", { count: hours })} ${t("common.minutesShort", { count: minutes })}`;
};

export const formatISODate = (date: Date): string => date.toISOString().slice(0, 10);

export const formatISOTimestamp = (): string => new Date().toISOString();

export const formatRelativeTime = (value?: number, locale?: string): string => {
  if (!value) return "-";
  const diffSeconds = Math.round((value - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(locale || navigator.language, { numeric: "auto" });
  if (absSeconds < 60) return formatter.format(diffSeconds, "second");
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (absSeconds < 86_400) return formatter.format(diffHours, "hour");
  return formatter.format(Math.round(diffHours / 24), "day");
};

export function parseTimeToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(":").map(p => p.trim());
  if (parts.some(p => p === "" || Number.isNaN(Number(p)))) return null;

  const numbers = parts.map(Number);
  if (numbers.length === 1) return numbers[0];
  if (numbers.length === 2) return numbers[0] * 60 + numbers[1];
  if (numbers.length === 3) return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
  return null;
}

export const formatCalendarTooltip = (
  isoDate: string,
  seconds: number,
  locale: string,
  t: (key: string, params?: Record<string, unknown>) => string,
): string => {
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(isoDate));
  const minutes = Math.round(seconds / 60);
  return `${date}: ${t("common.minutesShort", { count: minutes })}`;
};
