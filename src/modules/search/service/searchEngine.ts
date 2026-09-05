import MiniSearch, { type SearchOptions as MiniSearchOptions, type SearchResult } from "minisearch";
import type {
  SearchDocument,
  SearchFilter,
  SearchOptions,
  SearchResponse,
  SearchResultItem,
} from "../types";
import { buildSearchAliases, termProcessor, unicodeTokenizer } from "../searchNormalization";

interface IndexedSearchDocument extends SearchDocument {
  searchAliases: string;
}

const FIELDS: (keyof IndexedSearchDocument)[] = [
  "title",
  "artist",
  "album",
  "searchAliases",
  "year",
  "fileName",
  "description",
];
const STORE_FIELDS: (keyof IndexedSearchDocument)[] = [
  "type",
  "title",
  "artist",
  "album",
  "entityId",
  "coverPath",
  "duration",
];

// Only the term still being typed is a prefix; finished words match whole.
const BASE_SEARCH_OPTIONS: MiniSearchOptions = {
  prefix: (_term, index, terms) => index === terms.length - 1,
  fuzzy: 0.2,
  boost: {
    title: 3,
    artist: 2,
    album: 1,
    searchAliases: 0.75,
    year: 0.5,
    fileName: 0.5,
    description: 0.5,
  },
  tokenize: unicodeTokenizer,
  processTerm: termProcessor,
};

const toIndexed = (document: SearchDocument): IndexedSearchDocument => ({
  ...document,
  searchAliases: buildSearchAliases(document.title, document.artist, document.album),
});

const toResultItem = (hit: SearchResult): SearchResultItem => ({
  id: String(hit.id),
  type: hit.type as SearchResultItem["type"],
  title: hit.title as string,
  artist: hit.artist as string | undefined,
  album: hit.album as string | undefined,
  entityId: hit.entityId as string,
  coverPath: hit.coverPath as string | undefined,
  score: hit.score,
  duration: hit.duration as number | undefined,
});

export interface SearchEngine {
  build: (documents: SearchDocument[]) => void;
  search: (query: string, filter: SearchFilter, options?: SearchOptions) => SearchResponse;
  upsert: (documents: SearchDocument[]) => void;
  remove: (ids: string[]) => void;
}

export const createSearchEngine = (): SearchEngine => {
  let index = new MiniSearch<IndexedSearchDocument>({
    fields: FIELDS,
    storeFields: STORE_FIELDS,
    tokenize: unicodeTokenizer,
    processTerm: termProcessor,
    searchOptions: BASE_SEARCH_OPTIONS,
  });

  const rawSearch = (query: string, filter: SearchFilter): SearchResult[] => {
    const options: MiniSearchOptions = { ...BASE_SEARCH_OPTIONS };
    if (filter !== "all") {
      options.filter = result => result.type === filter;
    }

    // Every word must match; only if nothing does, fall back to any word.
    const strict = index.search(query, { ...options, combineWith: "AND" });
    if (strict.length > 0) return strict;
    return index.search(query, { ...options, combineWith: "OR" });
  };

  return {
    build: (documents) => {
      index = new MiniSearch<IndexedSearchDocument>({
        fields: FIELDS,
        storeFields: STORE_FIELDS,
        tokenize: unicodeTokenizer,
        processTerm: termProcessor,
        searchOptions: BASE_SEARCH_OPTIONS,
      });
      index.addAll(documents.map(toIndexed));
    },

    search: (query, filter, options) => {
      const raw = rawSearch(query, filter);
      const offset = options?.offset ?? 0;
      const page = options?.limit == null
        ? raw.slice(offset)
        : raw.slice(offset, offset + options.limit);

      return {
        results: page.map(toResultItem),
        total: raw.length,
        totalDuration: raw.reduce((sum, hit) => sum + ((hit.duration as number | undefined) ?? 0), 0),
      };
    },

    upsert: (documents) => {
      for (const document of documents) {
        const indexed = toIndexed(document);
        if (index.has(document.id)) index.replace(indexed);
        else index.add(indexed);
      }
    },

    remove: (ids) => {
      for (const id of ids) {
        if (index.has(id)) index.discard(id);
      }
    },
  };
};
