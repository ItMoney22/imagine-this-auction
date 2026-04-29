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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return notFound()

  const { data: auctioneer } = await supabase
    .from('auctioneers')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!auctioneer) return notFound()

  const { data: auction } = await supabase
    .from('auctions')
    .select('*')
    .eq('id', params.id)
    .eq('auctioneer_id', auctioneer.id)
    .single()

  if (!auction) return notFound()

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
