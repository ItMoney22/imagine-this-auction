#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// Create Supabase client with service role key for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

async function runMigration() {
  console.log('🔧 Running demo schema migration...')

  try {
    // Read the SQL migration file
    const sqlFile = join(__dirname, 'add-demo-columns.sql')
    const sql = readFileSync(sqlFile, 'utf8')

    console.log('📝 Executing SQL migration...')

    // Execute the SQL directly
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
      console.error('❌ Migration failed:', error)

      // Try alternative method with individual statements
      console.log('🔄 Trying alternative approach with individual statements...')

      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'))

      for (const statement of statements) {
        if (statement.trim()) {
          console.log(`Executing: ${statement.substring(0, 60)}...`)
          const { error: stmtError } = await supabase.rpc('exec_sql', {
            sql_query: statement + ';'
          })
          if (stmtError) {
            console.warn(`Warning for statement: ${stmtError.message}`)
          }
        }
      }
    } else {
      console.log('✅ Migration completed successfully')
    }

    // Verify the new columns exist
    console.log('🔍 Verifying new columns...')

    const tests = [
      { table: 'auctions', column: 'demo_label' },
      { table: 'lots', column: 'status' },
      { table: 'lots', column: 'demo_label' },
      { table: 'users', column: 'metadata' },
      { table: 'bids', column: 'amount_itc' }
    ]

    for (const test of tests) {
      try {
        const { data, error } = await supabase
          .from(test.table)
          .select(test.column)
          .limit(1)

        if (error && error.message.includes('does not exist')) {
          console.log(`❌ Column ${test.table}.${test.column} still missing`)
        } else {
          console.log(`✅ Column ${test.table}.${test.column} exists`)
        }
      } catch (err) {
        console.log(`❓ Could not verify ${test.table}.${test.column}`)
      }
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error)
    process.exit(1)
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🔧 Demo Schema Migration

This script adds the necessary columns to support demo mode:
- demo_label and demo_run_id columns on all tables
- status column on lots table
- metadata column on users table
- amount_itc column on bids table
- Various timing columns for lot management

Usage:
  tsx scripts/run-migration.ts

Environment variables required:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`)
  process.exit(0)
}

runMigration()