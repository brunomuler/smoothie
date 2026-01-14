"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function WalletTokensSkeleton() {
  return (
    <div className="flex flex-col gap-4 pb-4 @container/card">
      {/* Total Balance and Period Selector skeleton */}
      <div className="flex items-end justify-between gap-4 mb-2">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Total Balance</p>
          <Skeleton className="h-10 w-40" />
        </div>
        {/* Period selector skeleton */}
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      <Card className="py-2 gap-0">
        <CardContent className="px-4 py-2">
          <div className="space-y-3">
            {[...Array(5)].map((_, j) => (
              <div key={j} className="flex items-center py-2 gap-3">
                <div className="flex items-center gap-3 w-32 shrink-0">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <div className="flex-1 flex justify-center">
                  <Skeleton className="h-8 w-full max-w-48" />
                </div>
                <div className="flex flex-col items-end shrink-0 w-24 space-y-1.5">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
