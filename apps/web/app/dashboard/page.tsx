import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()

  // TEMPORARY: Skip auth for development
  // const {
  //   data: { user },
  // } = await supabase.auth.getUser()

  // if (!user) {
  //   redirect('/login')
  // }

  // const { data: userProfile } = await supabase
  //   .from('users')
  //   .select('*')
  //   .eq('id', user.id)
  //   .single()

  // if (!userProfile) {
  //   redirect('/login')
  // }

  // Redirect based on role
  // if (userProfile.role === 'admin') {
  //   redirect('/admin')
  // }

  // if (userProfile.role === 'auctioneer') {
  //   redirect('/org')
  // }

  // TEMPORARY: Use dummy user profile for development
  const userProfile = {
    id: 'dummy-user-id',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    role: 'bidder'
  }

  // Default bidder dashboard
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {userProfile.first_name || userProfile.email}!
        </h1>
        <p className="text-gray-600 mt-2">
          Your bidder dashboard - manage your bids, wallet, and account
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Wallet Balance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ITC Wallet</h2>
          <div className="text-3xl font-bold text-green-600 mb-2">0 ITC</div>
          <p className="text-sm text-gray-600 mb-4">Available credits</p>
          <button className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors">
            Add Credits
          </button>
        </div>

        {/* Active Bids */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Bids</h2>
          <div className="text-3xl font-bold text-blue-600 mb-2">0</div>
          <p className="text-sm text-gray-600 mb-4">Current auctions</p>
          <button className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 transition-colors">
            View All Bids
          </button>
        </div>

        {/* Won Auctions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Won Items</h2>
          <div className="text-3xl font-bold text-purple-600 mb-2">0</div>
          <p className="text-sm text-gray-600 mb-4">Pending payment</p>
          <button className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 transition-colors">
            View Won Items
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-8 bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        </div>
        <div className="p-6">
          <div className="text-center text-gray-500 py-8">
            <p>No recent activity</p>
            <p className="text-sm mt-2">Start bidding on auctions to see your activity here</p>
          </div>
        </div>
      </div>
    </div>
  )
}