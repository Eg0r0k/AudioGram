export interface CueTrackEntry {
  index: number;
  title?: string;
  performer?: string;
  time: number;
}

export function parseCueSheet(content: string): CueTrackEntry[] {
  const lines = content.split(/\r?\n/);
  const entries: CueTrackEntry[] = [];
  let current: Partial<CueTrackEntry> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const trackMatch = /^TRACK\s+(\d+)\s+AUDIO/i.exec(line);
    if (trackMatch) {
      if (current && current.time !== undefined) {
        entries.push(current as CueTrackEntry);
      }
      current = { index: Number(trackMatch[1]) };
      continue;
    }

    if (!current) continue;

    const titleMatch = /^TITLE\s+"(.*)"/i.exec(line);
    if (titleMatch) {
      current.title = titleMatch[1];
      continue;
    }

    const performerMatch = /^PERFORMER\s+"(.*)"/i.exec(line);
    if (performerMatch) {
      current.performer = performerMatch[1];
      continue;
    }

    const indexMatch = /^INDEX\s+01\s+(\d{2}):(\d{2}):(\d{2})/i.exec(line);
    if (indexMatch) {
      const [, mm, ss, ff] = indexMatch;
      current.time = Number(mm) * 60 + Number(ss) + Number(ff) / 75;
    }
  }

  if (current && current.time !== undefined) {
    entries.push(current as CueTrackEntry);
  }

  return entries.sort((a, b) => a.time - b.time);
}
