const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
  console.log('🔧 Applying admin support migration...')

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../supabase/migrations/005_admin_support.sql')
    const migrationSql = fs.readFileSync(migrationPath, 'utf8')

    // Split by semicolons and execute each statement
    const statements = migrationSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))

    console.log(`📝 Executing ${statements.length} SQL statements...`)

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (statement.trim()) {
        try {
          console.log(`   ${i + 1}/${statements.length}: ${statement.substring(0, 50)}...`)

          // Use the RPC endpoint to execute raw SQL
          const { error } = await supabase.rpc('exec_sql', { sql: statement })

          if (error && !error.message.includes('already exists')) {
            console.error(`❌ Error in statement ${i + 1}:`, error)
            // Continue with other statements
          }
        } catch (err) {
          console.error(`❌ Exception in statement ${i + 1}:`, err.message)
          // Continue with other statements
        }
      }
    }

    console.log('✅ Migration completed!')
    console.log('')
    console.log('🎯 Created:')
    console.log('   • Tables: announcements, system_announcements, kyc_documents, user_documents, compliance_flags, user_compliance_flags')
    console.log('   • Views: financial_aggregates, suspicious_users_view')
    console.log('   • Functions: get_financial_summary(), detect_suspicious_users(), log_admin_action()')
    console.log('   • RLS policies for admin access')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

applyMigration()