/**
 * Transaction Export API Route
 * Generates CSV export of user transaction history
 */

import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import { generateTransactionCSV, getExportFilename } from '@/lib/export/csv-generator'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const user = searchParams.get('user')
    const poolId = searchParams.get('pool') || undefined
    const assetAddress = searchParams.get('asset') || undefined
    const actionTypesParam = searchParams.get('actionTypes')
    const actionTypes = actionTypesParam ? actionTypesParam.split(',') : undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    // Validate required parameters
    if (!user) {
      return NextResponse.json(
        {
          error: 'Missing required parameter',
          message: 'user parameter is required',
        },
        { status: 400 },
      )
    }

    // Fetch all actions (use high limit for export, no pagination)
    const actions = await eventsRepository.getUserActions(user, {
      limit: 10000, // High limit for export
      offset: 0,
      actionTypes,
      poolId,
      assetAddress,
      startDate,
      endDate,
    })

    if (actions.length === 0) {
      return NextResponse.json(
        {
          error: 'No data',
          message: 'No transactions found for the specified criteria',
        },
        { status: 404 },
      )
    }

    // Generate CSV
    const csv = generateTransactionCSV(actions)
    const filename = getExportFilename(user, startDate, endDate)

    // Return CSV as file download
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[Export Transactions API] Error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
