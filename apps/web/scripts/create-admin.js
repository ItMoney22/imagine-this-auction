const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createAdminUser() {
  console.log('👤 Creating admin user admin@imaginethisauction.com...')

  try {
    // Create user in auth.users table with service role key
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: 'admin@imaginethisauction.com',
      password: 'admin123!',
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        first_name: 'Platform',
        last_name: 'Admin'
      }
    })

    if (authError) {
      console.log('Auth user might already exist:', authError.message)
    } else {
      console.log('✅ Auth user created successfully with ID:', authUser.user.id)
    }

    // Get the user ID (either from creation or existing)
    let userId
    if (authUser?.user?.id) {
      userId = authUser.user.id
    } else {
      // Try to get existing user
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const existingUser = existingUsers.users.find(u => u.email === 'admin@imaginethisauction.com')
      if (existingUser) {
        userId = existingUser.id
        console.log('📧 Found existing auth user with ID:', userId)
      }
    }

    if (!userId) {
      console.error('❌ Could not get user ID')
      return
    }

    // Create user in our users table
    const { error: userTableError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: 'admin@imaginethisauction.com',
        role: 'admin',
        first_name: 'Platform',
        last_name: 'Admin',
        is_approved: true
      })

    if (userTableError) {
      console.log('User table entry might already exist:', userTableError.message)
    } else {
      console.log('✅ User table entry created successfully')
    }

    console.log('')
    console.log('🎉 Admin user setup completed!')
    console.log('📧 Email: admin@imaginethisauction.com')
    console.log('🔑 Password: admin123!')
    console.log('🔗 Login at: http://localhost:3002/login')
    console.log('👑 Admin panel: http://localhost:3002/admin')

  } catch (error) {
    console.error('❌ Error creating admin user:', error)
    process.exit(1)
  }
}

createAdminUser()