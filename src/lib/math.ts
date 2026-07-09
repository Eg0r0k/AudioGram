export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function formatCountWithCap(value: number, cap = 99): string {
  return value > cap ? `${cap}+` : String(value);
}

export function normalize(value: number, max: number): number {
  return Math.min(value / max, 1);
}

export function deduplicate<T>(items: T[]): T[] {
  const result: T[] = [];
  let prev: T | undefined;

  for (const item of items) {
    if (item !== prev) {
      result.push(item);
      prev = item;
    }
  }

  return result;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
