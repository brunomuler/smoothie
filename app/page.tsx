import { Suspense } from "react"
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query"
import { prefetchMetadata } from "@/lib/prefetch-metadata"
import { HomeContent } from "./home-content"
import { DashboardSkeleton } from "@/components/dashboard-skeleton"

export default async function Home() {
  // Create a new QueryClient for this request (server-side)
  const queryClient = new QueryClient()

  // Prefetch metadata on the server - this populates the cache
  // so the client doesn't need to wait for this API call
  await prefetchMetadata(queryClient)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<DashboardSkeleton />}>
        <HomeContent />
      </Suspense>
    </HydrationBoundary>
  )
}
