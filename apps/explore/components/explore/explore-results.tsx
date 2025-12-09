"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ExternalLink, ChevronLeft, ChevronRight, Copy, Check } from "lucide-react"
import { useState } from "react"
import { AmountDisplay } from "./amount-display"
import type {
  ExploreResponse,
  AccountDepositResult,
  AccountEventCountResult,
  AccountBalanceResult,
  TopDepositorResult,
  TokenVolumeResult,
  PoolStatisticsResult,
} from "@/types/explore"

interface ExploreResultsProps {
  data?: ExploreResponse
  isLoading?: boolean
  showUsdPrimary?: boolean
  onPageChange?: (offset: number) => void
  limit?: number
  offset?: number
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={`https://stellar.expert/explorer/public/account/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-sm hover:text-foreground text-muted-foreground transition-colors flex items-center gap-1"
      >
        {truncateAddress(address)}
        <ExternalLink className="h-3 w-3" />
      </a>
      <button
        onClick={handleCopy}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Copy address"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  )
}

function DepositsTable({
  results,
  showUsdPrimary,
}: {
  results: AccountDepositResult[]
  showUsdPrimary: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Address</TableHead>
          <TableHead className="text-right">Total Deposited</TableHead>
          <TableHead className="text-right">Deposit Count</TableHead>
          <TableHead>Last Deposit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result) => (
          <TableRow key={result.userAddress}>
            <TableCell>
              <CopyableAddress address={result.userAddress} />
            </TableCell>
            <TableCell className="text-right">
              <AmountDisplay
                amount={result.totalDeposited}
                amountUsd={result.totalDepositedUsd}
                symbol={result.assetSymbol}
                showUsdPrimary={showUsdPrimary}
                size="sm"
              />
            </TableCell>
            <TableCell className="text-right font-mono">
              {result.depositCount}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(result.lastDepositDate)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function EventsTable({ results }: { results: AccountEventCountResult[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Address</TableHead>
          <TableHead className="text-right">Event Count</TableHead>
          <TableHead>Event Types</TableHead>
          <TableHead>First Event</TableHead>
          <TableHead>Last Event</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result) => (
          <TableRow key={result.userAddress}>
            <TableCell>
              <CopyableAddress address={result.userAddress} />
            </TableCell>
            <TableCell className="text-right font-mono font-medium">
              {result.eventCount}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {Object.entries(result.eventsByType).map(([type, count]) => (
                  <Badge key={type} variant="secondary" className="text-xs">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(result.firstEventDate)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(result.lastEventDate)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function BalanceTable({
  results,
  showUsdPrimary,
}: {
  results: AccountBalanceResult[]
  showUsdPrimary: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Address</TableHead>
          <TableHead className="text-right">Net Balance</TableHead>
          <TableHead className="text-right">Supply</TableHead>
          <TableHead className="text-right">Collateral</TableHead>
          <TableHead className="text-right">Debt</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result) => (
          <TableRow key={result.userAddress}>
            <TableCell>
              <CopyableAddress address={result.userAddress} />
            </TableCell>
            <TableCell className="text-right">
              <AmountDisplay
                amount={result.netBalance}
                amountUsd={result.balanceUsd}
                symbol={result.assetSymbol}
                showUsdPrimary={showUsdPrimary}
                size="sm"
              />
            </TableCell>
            <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
              {result.supplyBalance.toFixed(2)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm text-blue-600 dark:text-blue-400">
              {result.collateralBalance.toFixed(2)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
              {result.debtBalance.toFixed(2)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TopDepositorsTable({
  results,
  showUsdPrimary,
}: {
  results: TopDepositorResult[]
  showUsdPrimary: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[60px]">Rank</TableHead>
          <TableHead>Address</TableHead>
          <TableHead>Pool</TableHead>
          <TableHead className="text-right">Total Deposited</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result) => (
          <TableRow key={`${result.userAddress}-${result.poolId}`}>
            <TableCell className="font-mono font-bold text-muted-foreground">
              #{result.rank}
            </TableCell>
            <TableCell>
              <CopyableAddress address={result.userAddress} />
            </TableCell>
            <TableCell>
              <Badge variant="outline">{result.poolName}</Badge>
            </TableCell>
            <TableCell className="text-right">
              <AmountDisplay
                amount={result.totalDeposited}
                amountUsd={result.totalDepositedUsd}
                symbol={result.assetSymbol}
                showUsdPrimary={showUsdPrimary}
                size="sm"
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function VolumeByTokenTable({
  results,
  showUsdPrimary,
}: {
  results: TokenVolumeResult[]
  showUsdPrimary: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Token</TableHead>
          <TableHead className="text-right">Deposit Volume</TableHead>
          <TableHead className="text-right">Withdraw Volume</TableHead>
          <TableHead className="text-right">Net Volume</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result) => (
          <TableRow key={result.assetAddress}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{result.symbol}</span>
                {result.name && (
                  <span className="text-xs text-muted-foreground">{result.name}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <AmountDisplay
                amount={result.depositVolume}
                amountUsd={result.depositVolumeUsd}
                symbol={result.symbol}
                showUsdPrimary={showUsdPrimary}
                size="sm"
              />
            </TableCell>
            <TableCell className="text-right">
              <AmountDisplay
                amount={result.withdrawVolume}
                amountUsd={result.withdrawVolumeUsd}
                symbol={result.symbol}
                showUsdPrimary={showUsdPrimary}
                size="sm"
              />
            </TableCell>
            <TableCell className="text-right">
              <AmountDisplay
                amount={result.netVolume}
                amountUsd={result.netVolumeUsd}
                symbol={result.symbol}
                showUsdPrimary={showUsdPrimary}
                size="sm"
                className={result.netVolume >= 0 ? "text-green-600" : "text-red-600"}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PoolsTable({ results }: { results: PoolStatisticsResult[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pool</TableHead>
          <TableHead className="text-right">Event Count</TableHead>
          <TableHead className="text-right">Unique Event Types</TableHead>
          <TableHead>Event Types</TableHead>
          <TableHead>First Event</TableHead>
          <TableHead>Last Event</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result) => (
          <TableRow key={result.poolId}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{result.poolName}</span>
                {result.poolShortName && (
                  <span className="text-xs text-muted-foreground">{result.poolShortName}</span>
                )}
                <span className="text-xs text-muted-foreground font-mono">
                  {truncateAddress(result.poolId)}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right font-mono font-medium">
              {result.eventCount.toLocaleString()}
            </TableCell>
            <TableCell className="text-right font-mono">
              {result.uniqueEventTypeCount}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {result.uniqueEventTypes.map((type) => (
                  <Badge key={type} variant="secondary" className="text-xs">
                    {type}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {result.firstEventDate ? formatDate(result.firstEventDate) : "-"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {result.lastEventDate ? formatDate(result.lastEventDate) : "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <div className="flex gap-2 sm:gap-4">
            <Skeleton className="h-10 w-24 sm:w-32" />
            <Skeleton className="h-10 flex-1 min-w-[100px]" />
          </div>
          <div className="flex gap-2 sm:gap-4">
            <Skeleton className="h-10 w-20 sm:w-24" />
            <Skeleton className="h-10 w-20 sm:w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ExploreResults({
  data,
  isLoading,
  showUsdPrimary = false,
  onPageChange,
  limit = 50,
  offset = 0,
}: ExploreResultsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSkeleton />
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Apply filters to see results
          </p>
        </CardContent>
      </Card>
    )
  }

  const renderResults = () => {
    switch (data.query) {
      case "deposits":
        if (!("results" in data) || data.results.length === 0) {
          return (
            <p className="text-muted-foreground text-center py-8">
              No accounts found matching the criteria
            </p>
          )
        }
        return (
          <DepositsTable
            results={data.results as AccountDepositResult[]}
            showUsdPrimary={showUsdPrimary}
          />
        )

      case "events":
        if (!("results" in data) || data.results.length === 0) {
          return (
            <p className="text-muted-foreground text-center py-8">
              No accounts found matching the criteria
            </p>
          )
        }
        return <EventsTable results={data.results as AccountEventCountResult[]} />

      case "balance":
        if (!("results" in data) || data.results.length === 0) {
          return (
            <p className="text-muted-foreground text-center py-8">
              No accounts found matching the criteria
            </p>
          )
        }
        return (
          <BalanceTable
            results={data.results as AccountBalanceResult[]}
            showUsdPrimary={showUsdPrimary}
          />
        )

      case "top-depositors":
        if (!("results" in data) || data.results.length === 0) {
          return (
            <p className="text-muted-foreground text-center py-8">
              No depositors found for this pool
            </p>
          )
        }
        return (
          <TopDepositorsTable
            results={data.results as TopDepositorResult[]}
            showUsdPrimary={showUsdPrimary}
          />
        )

      case "aggregates":
        if (!("volumeByToken" in data) || data.volumeByToken.length === 0) {
          return (
            <p className="text-muted-foreground text-center py-8">
              No volume data available
            </p>
          )
        }
        return (
          <VolumeByTokenTable
            results={data.volumeByToken}
            showUsdPrimary={showUsdPrimary}
          />
        )

      case "pools":
        if (!("results" in data) || data.results.length === 0) {
          return (
            <p className="text-muted-foreground text-center py-8">
              No tracked pools found
            </p>
          )
        }
        return <PoolsTable results={data.results as PoolStatisticsResult[]} />

      default:
        return null
    }
  }

  const getTotalCount = (): number => {
    if ("totalCount" in data) {
      return data.totalCount
    }
    if ("count" in data) {
      return data.count
    }
    return 0
  }

  const totalCount = getTotalCount()
  const showPagination = onPageChange && totalCount > limit

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          Results
          {totalCount > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({totalCount.toLocaleString()} total)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative w-full overflow-auto">
          <div className="max-h-[600px] overflow-y-auto">{renderResults()}</div>
        </div>

        {showPagination && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {offset + 1} - {Math.min(offset + limit, totalCount)} of{" "}
              {totalCount.toLocaleString()}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(Math.max(0, offset - limit))}
                disabled={offset === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(offset + limit)}
                disabled={offset + limit >= totalCount}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
