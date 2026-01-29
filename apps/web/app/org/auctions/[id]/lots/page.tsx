import { createClient } from '@/lib/supabase/server'
import { LotsManager } from '@/components/org/lots-manager'
import { notFound } from 'next/navigation'

interface Props {
  params: {
    id: string
  }
}

export default async function AuctionLotsPage({ params }: Props) {
  const supabase = await createClient()

  // TEMPORARY: Skip auth for development
  // const {
  //   data: { user },
  // } = await supabase.auth.getUser()

  // if (!user) return notFound()

  // Get auctioneer info
  // const { data: auctioneer } = await supabase
  //   .from('auctioneers')
  //   .select('*')
  //   .eq('user_id', user.id)
  //   .single()

  // if (!auctioneer) return notFound()

  // Get auction
  // const { data: auction } = await supabase
  //   .from('auctions')
  //   .select('*')
  //   .eq('id', params.id)
  //   .eq('auctioneer_id', auctioneer.id)
  //   .single()

  // if (!auction) return notFound()

  // Get lots for this auction
  // const { data: lots } = await supabase
  //   .from('lots')
  //   .select(`
  //     *,
  //     bids (
  //       id,
  //       amount_itc,
  //       created_at,
  //       users (
  //         first_name,
  //         last_name,
  //         email
  //       )
  //     )
  //   `)
  //   .eq('auction_id', auction.id)
  //   .order('lot_number', { ascending: true })

  // TEMPORARY: Use dummy data for development
  const auction = {
    id: params.id,
    title: 'Sample Auction with Lots',
    description: 'Managing lots for this auction'
  }

  const lots = [
    {
      id: 'dummy-lot-1',
      lot_number: 1,
      title: 'Sample Lot 1',
      description: 'Description for lot 1',
      starting_bid_itc: 100,
      current_bid_itc: 150,
      bids: [
        {
          id: 'bid-1',
          amount_itc: 150,
          created_at: new Date().toISOString(),
          users: { first_name: 'John', last_name: 'Doe', email: 'john@example.com' }
        }
      ]
    },
    {
      id: 'dummy-lot-2',
      lot_number: 2,
      title: 'Sample Lot 2',
      description: 'Description for lot 2',
      starting_bid_itc: 200,
      current_bid_itc: 200,
      bids: []
    }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Manage Lots
          </h1>
          <p className="text-gray-600">
            {auction.title}
          </p>
        </div>
      </div>

      <LotsManager auction={auction} lots={lots || []} />
    </div>
  )
}