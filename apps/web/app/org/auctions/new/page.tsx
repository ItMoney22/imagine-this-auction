import { AuctionForm } from '@/components/org/auction-form'

export default function NewAuctionPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Create New Auction
        </h1>
        <p className="text-gray-600">
          Set up your auction details and timing
        </p>
      </div>

      <AuctionForm />
    </div>
  )
}