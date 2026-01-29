import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WalletDashboard } from '@/components/wallet/wallet-dashboard'

export default async function WalletPage() {
  const supabase = await createClient()

  // TEMPORARY: Skip auth for development
  // const {
  //   data: { user },
  // } = await supabase.auth.getUser()

  // if (!user) {
  //   redirect('/login?redirect=/wallet')
  // }

  // Get user profile
  // const { data: userProfile } = await supabase
  //   .from('users')
  //   .select('*')
  //   .eq('id', user.id)
  //   .single()

  // if (!userProfile) {
  //   redirect('/login')
  // }

  // TEMPORARY: Use dummy user profile for development
  const userProfile = {
    id: 'dummy-user-id',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    role: 'bidder'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Your Wallet
          </h1>
          <p className="text-gray-600">
            Manage your ITC credits and view transaction history
          </p>
        </div>

        <WalletDashboard user={userProfile} />
      </div>
    </div>
  )
}