import { createClient } from '@/lib/supabase/server'
import { LotCard } from '@/components/marketplace/lot-card'
import { SearchBar } from '@/components/marketplace/search-bar'
import { LotFilters } from '@/components/marketplace/lot-filters'

interface Props {
  searchParams: Promise<{
    search?: string
    category?: string
    auction?: string
    status?: string
    sort?: string
  }>
}

export default async function BrowseLotsPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()

  // Build query
  let query = supabase
    .from('lots')
    .select(`
      *,
      auctions!inner (
        id,
        title,
        status,
        starts_at,
        ends_at,
        auctioneers (
          company_name,
          slug
        )
      )
    `)

  // Only show lots from live auctions
  query = query.eq('auctions.status', 'live')

  // Apply search filter
  if (params.search) {
    query = query.or(`title.ilike.%${params.search}%,description.ilike.%${params.search}%`)
  }

  // Apply category filter
  if (params.category) {
    query = query.eq('category', params.category)
  }

  // Apply auction filter
  if (params.auction) {
    query = query.eq('auction_id', params.auction)
  }

  // Apply sorting
  switch (params.sort) {
    case 'ending_soon':
      query = query.order('auctions(ends_at)', { ascending: true })
      break
    case 'highest_bid':
      query = query.order('current_high_bid', { ascending: false })
      break
    case 'lowest_bid':
      query = query.order('current_high_bid', { ascending: true })
      break
    case 'newest':
      query = query.order('created_at', { ascending: false })
      break
    default:
      query = query.order('lot_number', { ascending: true })
  }

  const { data: lots } = await query

  // Get categories for filter
  const { data: categories } = await supabase
    .from('lots')
    .select('category')
    .not('category', 'is', null)
    .order('category')

  const uniqueCategories = Array.from(
    new Set(categories?.map(c => c.category).filter(Boolean))
  )

  // Get auctions for filter
  const { data: auctions } = await supabase
    .from('auctions')
    .select('id, title')
    .eq('status', 'live')
    .order('title')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Browse Lots
          </h1>
          <p className="text-gray-600">
            Discover individual items from live auctions
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          <div className="flex-1">
            <SearchBar />
          </div>
          <div className="lg:w-64">
            <LotFilters
              categories={uniqueCategories}
              auctions={auctions || []}
            />
          </div>
        </div>

        {/* Results */}
        {lots && lots.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {lots.map((lot) => (
              <LotCard key={lot.id} lot={lot} />
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
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No lots found
            </h3>
            <p className="text-gray-600">
              {params.search || params.category || params.auction
                ? 'Try adjusting your search or filters'
                : 'Check back soon for new lots from live auctions'}
            </p>
          </div>
        )}

        {/* Stats */}
        {lots && lots.length > 0 && (
          <div className="mt-12 text-center">
            <p className="text-gray-600">
              Showing {lots.length} lot{lots.length !== 1 ? 's' : ''} from live auctions
            </p>
          </div>
        )}
      </div>
    </div>
  )
}