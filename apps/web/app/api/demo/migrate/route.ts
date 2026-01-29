import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Demo Migration API
 *
 * Adds necessary columns to support demo mode functionality.
 * This should be run once to prepare the database for demo mode.
 */

export async function POST() {
  try {
    const supabase = await createClient()

    console.log('Demo migration: Starting schema updates...')

    const results = []

    // Since we can't run DDL through the API, we'll just document what needs to be done
    // and provide instructions for manual execution

    const requiredColumns = [
      {
        table: 'auctions',
        columns: [
          'demo_label TEXT',
          'demo_run_id TEXT',
          'ended_at TIMESTAMPTZ',
          'ended_reason TEXT'
        ]
      },
      {
        table: 'lots',
        columns: [
          'demo_label TEXT',
          'demo_run_id TEXT',
          'status TEXT DEFAULT \'pending\'',
          'lot_starts_at TIMESTAMPTZ',
          'lot_ends_at TIMESTAMPTZ',
          'ended_at TIMESTAMPTZ',
          'ended_reason TEXT',
          'current_bid_itc INTEGER DEFAULT 0'
        ]
      },
      {
        table: 'users',
        columns: [
          'demo_label TEXT',
          'demo_run_id TEXT',
          'metadata JSONB DEFAULT \'{}\'::jsonb'
        ]
      },
      {
        table: 'bids',
        columns: [
          'demo_label TEXT',
          'demo_run_id TEXT',
          'amount_itc INTEGER'
        ]
      }
    ]

    // Check which columns already exist
    for (const tableInfo of requiredColumns) {
      const tableResults = {
        table: tableInfo.table,
        existing_columns: [],
        missing_columns: [],
        errors: []
      }

      for (const columnDef of tableInfo.columns) {
        const columnName = columnDef.split(' ')[0]

        try {
          const { data, error } = await supabase
            .from(tableInfo.table)
            .select(columnName)
            .limit(1)

          if (error && error.message.includes('does not exist')) {
            tableResults.missing_columns.push(columnDef)
          } else if (error) {
            tableResults.errors.push(`${columnName}: ${error.message}`)
          } else {
            tableResults.existing_columns.push(columnName)
          }
        } catch (err) {
          tableResults.errors.push(`${columnName}: ${err}`)
        }
      }

      results.push(tableResults)
    }

    // Generate SQL statements for missing columns
    const sqlStatements = []

    for (const result of results) {
      if (result.missing_columns.length > 0) {
        const alterStatements = result.missing_columns.map(colDef =>
          `ALTER TABLE ${result.table} ADD COLUMN IF NOT EXISTS ${colDef};`
        )
        sqlStatements.push(...alterStatements)
      }
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_auctions_demo_label ON auctions(demo_label);',
      'CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);',
      'CREATE INDEX IF NOT EXISTS idx_lots_demo_label ON lots(demo_label);',
      'CREATE INDEX IF NOT EXISTS idx_lots_status ON lots(status);',
      'CREATE INDEX IF NOT EXISTS idx_lots_auction_id ON lots(auction_id);',
      'CREATE INDEX IF NOT EXISTS idx_users_demo_label ON users(demo_label);',
      'CREATE INDEX IF NOT EXISTS idx_bids_demo_label ON bids(demo_label);'
    ]

    const response = {
      migration_status: 'analyzed',
      tables_checked: results,
      sql_statements_needed: sqlStatements,
      indexes_needed: indexes,
      manual_steps_required: sqlStatements.length > 0,
      instructions: sqlStatements.length > 0 ?
        'Run the provided SQL statements in the Supabase SQL editor to complete the migration.' :
        'All required columns exist. No migration needed.',
      timestamp: new Date().toISOString()
    }

    console.log('Demo migration: Analysis complete', {
      tables_analyzed: results.length,
      statements_needed: sqlStatements.length,
      manual_steps: sqlStatements.length > 0
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('Demo migration: Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json(
      {
        error: 'Migration analysis failed',
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}