import { QueryClient, MutationCache, QueryCache } from "@tanstack/vue-query";
import { getLogger } from "@/lib/logger";

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
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
