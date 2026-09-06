import { queryOptions } from "@tanstack/vue-query";
import { $fetch, FetchError } from "ofetch";
import { ResultAsync } from "neverthrow";

const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO as string;

const GITHUB_HEADERS = {
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

interface GithubRelease {
  tag_name: string;
  body: string | null;
  prerelease: boolean;
  published_at: string;
}

export interface ChangelogError {
  kind: "NETWORK" | "NOT_FOUND" | "PARSE_ERROR";
  message: string;
}

function toChangelogError(e: unknown): ChangelogError {
  if (e instanceof FetchError) {
    return {
      kind: e.status === 404 ? "NOT_FOUND" : "NETWORK",
      message: e.message,
    };
  }
  return { kind: "NETWORK", message: String(e) };
}

export const changelogKeys = {
  all: ["changelog"] as const,
  byTag: (tag: string) => [...changelogKeys.all, "tag", tag] as const,
  latestTag: (channel: "stable") =>
    [...changelogKeys.all, "latestTag", channel] as const,
};

export function releaseNotesQueryOptions(tag: string) {
  return queryOptions({
    queryKey: changelogKeys.byTag(tag),
    queryFn: async () => {
      const release = await $fetch<GithubRelease>(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${tag}`,
        { headers: GITHUB_HEADERS },
      );
      return release.body?.trim() ?? "";
    },
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 2,
    networkMode: "online",
  });
}

export const latestTagQueryOptions = (channel: "stable") => {
  return queryOptions({
    queryKey: changelogKeys.latestTag(channel),
    queryFn: async (): Promise<string> => {
      const release = await $fetch<GithubRelease>(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        { headers: GITHUB_HEADERS },
      );
      return release.tag_name;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
    networkMode: "online",
  });
};

export const fetchReleaseNotes = (
  tag: string,
  signal?: AbortSignal,
): ResultAsync<string, ChangelogError> => {
  return ResultAsync.fromPromise(
    $fetch<GithubRelease>(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${tag}`,
      { headers: GITHUB_HEADERS, signal },
    ).then(r => r.body?.trim() ?? ""),
    toChangelogError,
  );
};
