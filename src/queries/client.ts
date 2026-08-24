import { QueryClient, MutationCache, QueryCache } from "@tanstack/vue-query";
import { getLogger } from "@/lib/logger";
import type { SourceErrorKind } from "@/types/source-dto";

const MAX_RETRIES = 2;

/**
 * Source errors that repeating the request cannot change: a malformed body, a
 * rejected credential, a missing resource, a deliberate abort. Retrying those
 * only multiplies the log noise — one incident produced 52 identical lines
 * because every failure was retried the full two times.
 */
const TERMINAL_SOURCE_ERRORS = new Set<SourceErrorKind>([
  "PARSE",
  "AUTH",
  "NOT_FOUND",
  "CANCELLED",
]);

const isTerminal = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("kind" in error)) return false;
  return TERMINAL_SOURCE_ERRORS.has((error as { kind: SourceErrorKind }).kind);
};

const shouldRetry = (failureCount: number, error: unknown): boolean =>
  !isTerminal(error) && failureCount < MAX_RETRIES;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError(error, query) {
      getLogger().error(`[Query] ${String(query.queryKey)} — ${error.message}`);
    },
  }),
  mutationCache: new MutationCache({
    onError(error, _vars, _ctx, mutation) {
      const key = mutation.options.mutationKey ?? "unknown";
      getLogger().error(`[Mutation] ${String(key)} — ${error.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
  },
});
