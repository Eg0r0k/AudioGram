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
  year?: number;
  /** Track file name without extension: a fallback for files with bare tags. */
  fileName?: string;
  description?: string;
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

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  totalDuration: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
}

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
