import { createClient } from '@/lib/supabase/server'
import { AuctionFilters } from '@/components/marketplace/auction-filters'
import { AuctionCard } from '@/components/marketplace/auction-card'
import { SearchBar } from '@/components/marketplace/search-bar'

interface Props {
  searchParams: Promise<{
    search?: string
    status?: string
    category?: string
    sort?: string
  }>
}

export default async function AuctionsPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()

  // Build query
  let query = supabase
    .from('auctions')
    .select(`
      *,
      auctioneers (
        company_name,
        id
      ),
      lots (count)
    `)
    .eq('status', 'live')
    .eq('auctioneers.is_approved', true)

  // Apply search filter
  if (params.search) {
    query = query.or(`title.ilike.%${params.search}%,description.ilike.%${params.search}%`)
  }

  // Apply status filter
  const now = new Date().toISOString()
  if (params.status === 'upcoming') {
    query = query.gt('starts_at', now)
  } else if (params.status === 'live') {
    query = query.lte('starts_at', now).gte('ends_at', now)
  } else if (params.status === 'ending_soon') {
    const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    query = query.lte('starts_at', now).gte('ends_at', now).lte('ends_at', in24Hours)
  }

  // Apply sorting
  switch (params.sort) {
    case 'ending_soon':
      query = query.order('ends_at', { ascending: true })
      break
    case 'newest':
      query = query.order('created_at', { ascending: false })
      break
    case 'oldest':
      query = query.order('created_at', { ascending: true })
      break
    default:
      query = query.order('ends_at', { ascending: true })
  }

  const { data: auctions } = await query

  // Get categories for filter
  const { data: categories } = await supabase
    .from('lots')
    .select('category')
    .not('category', 'is', null)
    .order('category')

  const uniqueCategories = Array.from(
    new Set(categories?.map(c => c.category).filter(Boolean))
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Live Auctions
          </h1>
          <p className="text-gray-600">
            Discover unique items from trusted auctioneers
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          <div className="flex-1">
            <SearchBar />
          </div>
          <div className="lg:w-64">
            <AuctionFilters categories={uniqueCategories} />
          </div>
        </div>

        {/* Results */}
        {auctions && auctions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {auctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        ) : (
          /* Empty state */
          <div className="text-center py-12">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="h-8 w-8 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No auctions found
            </h3>
            <p className="text-gray-600">
              {params.search || params.status || params.category
                ? 'Try adjusting your search or filters'
                : 'Check back soon for new auctions'}
            </p>
          </div>
        )}

        {/* Stats */}
        {auctions && auctions.length > 0 && (
          <div className="mt-12 text-center">
            <p className="text-gray-600">
              Showing {auctions.length} auction{auctions.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}