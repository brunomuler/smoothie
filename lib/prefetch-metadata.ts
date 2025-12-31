import { QueryClient } from "@tanstack/react-query"
import { eventsRepository } from "@/lib/db/events-repository"

/**
 * Prefetch metadata on the server for faster client hydration.
 * This runs during SSR and populates the React Query cache.
 */
export async function prefetchMetadata(queryClient: QueryClient): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: ["metadata"],
    queryFn: async () => {
      const [pools, tokens] = await Promise.all([
        eventsRepository.getPools(),
        eventsRepository.getTokens(),
      ])
      return { pools, tokens }
    },
    staleTime: 60 * 60 * 1000, // 1 hour - matches client-side staleTime
  })
}
