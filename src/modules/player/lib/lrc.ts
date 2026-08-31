export interface LyricsLine {
  time: number;
  text: string;
}

const TIMESTAMP_RE = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET_RE = /^\[offset:([+-]?\d+)\]$/i;

function parseFraction(rawFraction: string | undefined): number {
  if (!rawFraction) return 0;

  if (rawFraction.length === 3) {
    return Number.parseInt(rawFraction, 10) / 1000;
  }

  if (rawFraction.length === 2) {
    return Number.parseInt(rawFraction, 10) / 100;
  }

  return Number.parseInt(rawFraction, 10) / 10;
}

export function parseLrc(input: string): LyricsLine[] {
  const lines = input.split(/\r?\n/);
  const parsed: LyricsLine[] = [];
  let offsetSeconds = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const offsetMatch = OFFSET_RE.exec(line);
    if (offsetMatch) {
      offsetSeconds = Number.parseInt(offsetMatch[1], 10) / 1000;
      continue;
    }

    const timestamps = [...line.matchAll(TIMESTAMP_RE)];
    if (timestamps.length === 0) continue;

    const text = line.replace(TIMESTAMP_RE, "").trim();

    for (const timestamp of timestamps) {
      const minutes = Number.parseInt(timestamp[1], 10);
      const seconds = Number.parseInt(timestamp[2], 10);
      const fraction = parseFraction(timestamp[3]);

      parsed.push({
        time: Math.max(0, minutes * 60 + seconds + fraction + offsetSeconds),
        text,
      });
    }
  }

  return parsed.sort((left, right) => left.time - right.time);
}

export function findActiveLyricsIndex(lines: readonly LyricsLine[], currentTime: number): number {
  for (let index = lines.length - 1; index >= 0; index--) {
    if (currentTime >= lines[index].time) {
      return index;
    }
  }

  return -1;
}
