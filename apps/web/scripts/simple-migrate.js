const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createBasicSchema() {
  console.log('🔧 Creating basic admin schema...')

  const queries = [
    // Create announcements table
    `CREATE TABLE IF NOT EXISTS public.announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT DEFAULT 'all',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )`,

    // Create system_announcements table
    `CREATE TABLE IF NOT EXISTS public.system_announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id UUID REFERENCES public.users(id),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      target_roles TEXT[] DEFAULT ARRAY['bidder', 'auctioneer', 'admin'],
      is_active BOOLEAN DEFAULT true,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )`,

    // Create compliance_flags table
    `CREATE TABLE IF NOT EXISTS public.compliance_flags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES public.users(id),
      reason TEXT NOT NULL,
      severity INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT now()
    )`,

    // Create user_compliance_flags table
    `CREATE TABLE IF NOT EXISTS public.user_compliance_flags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES public.users(id),
      flag_type TEXT NOT NULL,
      severity TEXT DEFAULT 'medium',
      description TEXT,
      is_resolved BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(),
      flagged_by UUID REFERENCES public.users(id)
    )`,

    // Create user_documents table
    `CREATE TABLE IF NOT EXISTS public.user_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES public.users(id),
      document_type TEXT NOT NULL,
      filename TEXT,
      file_url TEXT,
      verification_status TEXT DEFAULT 'pending',
      uploaded_at TIMESTAMPTZ DEFAULT now()
    )`,

    // Create kyc_documents table
    `CREATE TABLE IF NOT EXISTS public.kyc_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES public.users(id),
      doc_type TEXT NOT NULL,
      url TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT now()
    )`
  ]

  for (let i = 0; i < queries.length; i++) {
    try {
      console.log(`   ${i + 1}/${queries.length}: Creating table...`)
      const { error } = await supabase.rpc('exec_sql', { sql: queries[i] })
      if (error && !error.message.includes('already exists')) {
        console.error(`❌ Error:`, error)
      }
    } catch (err) {
      // Try direct query if RPC fails
      try {
        const tableName = queries[i].match(/CREATE TABLE[^(]*(\w+)/i)?.[1]
        const { error } = await supabase.from(tableName).select('id').limit(1)
        if (!error) {
          console.log(`   ✅ Table ${tableName} already exists`)
        }
      } catch (e) {
        console.log(`   ⚠️  Could not verify table, continuing...`)
      }
    }
  }

  console.log('✅ Basic schema creation completed!')
}

createBasicSchema()