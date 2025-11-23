"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { useBalanceHistory } from "@/hooks/use-balance-history"
import { formatCurrency, formatNumber, getPoolName } from "@/lib/balance-history-utils"
import { BalanceHistoryRecord } from "@/types/balance-history"

interface BalanceRawDataTableProps {
  publicKey: string
  assetAddress: string
  days?: number
}

export function BalanceRawDataTable({
  publicKey,
  assetAddress,
  days = 30,
}: BalanceRawDataTableProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { isLoading, error, data } = useBalanceHistory({
    publicKey,
    assetAddress,
    days,
  })

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Raw Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Error loading raw data: {error.message}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Raw Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Loading raw data...
          </p>
        </CardContent>
      </Card>
    )
  }

  const records = data?.history || []

  // Sort by newest first (snapshot_date DESC, ledger_sequence DESC)
  const sortedRecords = [...records].sort((a, b) => {
    const dateComp = b.snapshot_date.localeCompare(a.snapshot_date)
    if (dateComp !== 0) return dateComp
    return b.ledger_sequence - a.ledger_sequence
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Raw Data</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1"
        >
          {isOpen ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Hide
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Show ({records.length} records)
            </>
          )}
        </Button>
      </CardHeader>

      {isOpen && (
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No raw data available
            </p>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3 max-h-[600px] overflow-y-auto">
                {sortedRecords.map((record, index) => (
                  <div
                    key={`${record.snapshot_date}-${record.pool_id}-${record.ledger_sequence}-${index}-mobile`}
                    className="border rounded-lg p-4 space-y-2 bg-card"
                  >
                    <div className="flex justify-between items-start gap-2 pb-2 border-b">
                      <div>
                        <div className="text-xs text-muted-foreground">Pool</div>
                        <div className="font-mono text-sm font-semibold" title={record.pool_id}>
                          {getPoolName(record.pool_id)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Date</div>
                        <div className="text-sm">{record.snapshot_date}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground">Net Balance</div>
                        <div className="font-mono font-semibold text-sm">
                          {formatCurrency(record.net_balance)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Supply Balance</div>
                        <div className="font-mono text-sm">
                          {formatCurrency(record.supply_balance)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Collateral</div>
                        <div className="font-mono text-sm">
                          {formatCurrency(record.collateral_balance)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Debt</div>
                        <div className="font-mono text-sm">
                          {formatCurrency(record.debt_balance)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Ledger Seq</div>
                        <div className="font-mono text-sm">
                          {record.ledger_sequence.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">b_rate</div>
                        <div className="font-mono text-sm">
                          {formatNumber(record.b_rate, 7)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block relative w-full overflow-auto">
                <div className="max-h-[600px] overflow-y-auto">
                  <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="min-w-[120px]">Pool ID</TableHead>
                      <TableHead className="min-w-[120px]">User Address</TableHead>
                      <TableHead className="min-w-[120px]">Asset Address</TableHead>
                      <TableHead className="min-w-[110px]">Snapshot Date</TableHead>
                      <TableHead className="min-w-[180px]">Snapshot Timestamp</TableHead>
                      <TableHead className="text-right min-w-[120px]">Ledger Sequence</TableHead>
                      <TableHead className="text-right min-w-[120px]">Supply (bTokens)</TableHead>
                      <TableHead className="text-right min-w-[140px]">Collateral (bTokens)</TableHead>
                      <TableHead className="text-right min-w-[120px]">Debt (dTokens)</TableHead>
                      <TableHead className="min-w-[120px]">Entry Hash</TableHead>
                      <TableHead className="text-right min-w-[140px]">Ledger Entry Change</TableHead>
                      <TableHead className="text-right min-w-[100px]">b_rate</TableHead>
                      <TableHead className="text-right min-w-[100px]">d_rate</TableHead>
                      <TableHead className="text-right min-w-[130px]">Supply Balance</TableHead>
                      <TableHead className="text-right min-w-[150px]">Collateral Balance</TableHead>
                      <TableHead className="text-right min-w-[120px]">Debt Balance</TableHead>
                      <TableHead className="text-right min-w-[120px]">Net Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRecords.map((record, index) => (
                      <TableRow key={`${record.snapshot_date}-${record.pool_id}-${record.ledger_sequence}-${index}`}>
                        <TableCell>
                          <div className="font-mono text-xs" title={record.pool_id}>
                            {getPoolName(record.pool_id)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs truncate max-w-[120px]" title={record.user_address}>
                            {record.user_address.slice(0, 8)}...
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs truncate max-w-[120px]" title={record.asset_address}>
                            {record.asset_address.slice(0, 8)}...
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {record.snapshot_date}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {record.snapshot_timestamp}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {record.ledger_sequence.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatNumber(record.supply_btokens, 7)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatNumber(record.collateral_btokens, 7)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatNumber(record.liabilities_dtokens, 7)}
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs truncate max-w-[120px]" title={record.entry_hash || undefined}>
                            {record.entry_hash ? `${record.entry_hash.slice(0, 8)}...` : '-'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {record.ledger_entry_change !== null ? record.ledger_entry_change : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatNumber(record.b_rate, 7)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatNumber(record.d_rate, 7)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatCurrency(record.supply_balance)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatCurrency(record.collateral_balance)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatCurrency(record.debt_balance)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">
                          {formatCurrency(record.net_balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
