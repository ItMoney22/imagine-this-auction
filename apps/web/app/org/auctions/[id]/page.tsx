import { createClient } from '@/lib/supabase/server'
import { AuctionForm } from '@/components/org/auction-form'
import { notFound } from 'next/navigation'

interface Props {
  params: {
    id: string
  }
}

export default async function EditAuctionPage({ params }: Props) {
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

  // TEMPORARY: Use dummy auction data for development
  const auction = {
    id: params.id,
    title: 'Sample Auction for Editing',
    description: 'This is a sample auction being edited',
    status: 'draft',
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    ends_at: new Date(Date.now() + 172800000).toISOString(),
    anti_sniping_seconds: 300
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Edit Auction
        </h1>
        <p className="text-gray-600">
          Update your auction details and timing
        </p>
      </div>

      <AuctionForm auction={auction} />
    </div>
  )
}