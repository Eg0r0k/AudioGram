export const SEARCH_ENTITY_TYPES = ["track", "artist", "album", "playlist"] as const;
export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];
export type SearchFilter = "all" | SearchEntityType;

export interface SearchDocument {
  id: string;
  type: SearchEntityType;
  title: string;
  artist?: string;
  album?: string;
  entityId: string;
  coverPath?: string;
  duration?: number;
}

export interface SearchResultItem {
  id: string;
  type: SearchEntityType;
  title: string;
  artist?: string;
  album?: string;
  entityId: string;
  score: number;
  coverPath?: string;
  duration?: number;
}

export interface GroupedResults {
  topResults: SearchResultItem[];
  groups: Record<SearchEntityType, SearchResultItem[]>;
}

export type WorkerRequest
  = | { action: "build"; documents: SearchDocument[] }
    | { action: "search"; query: string; id: number; limit?: number; offset?: number; filter?: SearchFilter }
    | { action: "add"; documents: SearchDocument[] }
    | { action: "remove"; ids: string[] };

export type WorkerResponse
  = | { action: "ready"; count: number }
    | { action: "results"; results: SearchResultItem[]; id: number; total: number; totalDuration: number }
    | { action: "error"; message: string; id?: number };

export function createEmptyGroups(): Record<SearchEntityType, SearchResultItem[]> {
  return {
    track: [],
    artist: [],
    album: [],
    playlist: [],
  };
}

export function createEmptyResults(): GroupedResults {
  return { topResults: [], groups: createEmptyGroups() };
}
