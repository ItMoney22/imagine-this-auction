#!/usr/bin/env node

// Create demo admin account for VPS deployment
// Usage: node create-demo-admin.js

const { createClient } = require('@supabase/supabase-js')

async function createDemoAdmin() {
  // Initialize Supabase client with service role key for admin operations
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables')
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  })

  try {
    console.log('🔧 Creating demo admin account...')

    // Get credentials from environment or use defaults
    const adminEmail = process.env.DEMO_ADMIN_EMAIL || 'admin@example.com'
    const adminPassword = process.env.DEMO_ADMIN_PASSWORD || 'TempAdmin!234'

    // 1. Create auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true
    })

    if (authError) {
      console.error('❌ Failed to create auth user:', authError.message)
      process.exit(1)
    }

    console.log('✅ Auth user created:', authUser.user.id)

    // 2. Create profile in users table
    const { error: userError } = await supabase
      .from('users')
      .insert({
        id: authUser.user.id,
        email: adminEmail,
        role: 'admin',
        first_name: 'Demo',
        last_name: 'Administrator',
        is_approved: true
      })

    if (userError) {
      console.error('❌ Failed to create user profile:', userError.message)
      process.exit(1)
    }

    console.log('✅ User profile created')
    console.log('')
    console.log('🎉 Demo admin account ready!')
    console.log('📧 Email:', adminEmail)
    console.log('🔑 Password:', adminPassword)
    console.log('🛡️  Role: admin')
    console.log('')
    console.log('⚠️  Remember to change these credentials in production!')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

// Check if running directly
if (require.main === module) {
  createDemoAdmin()
}

module.exports = { createDemoAdmin }