import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { formatDate, formatTimeRemaining } from '@/lib/utils'
import { Plus, Eye, Edit, Package } from 'lucide-react'

export default async function AuctionsPage() {
  const supabase = await createClient()

  // TEMPORARY: Skip auth for development
  // const {
  //   data: { user },
  // } = await supabase.auth.getUser()

  // if (!user) return null

  // Get auctioneer info
  // const { data: auctioneer } = await supabase
  //   .from('auctioneers')
  //   .select('*')
  //   .eq('user_id', user.id)
  //   .single()

  // if (!auctioneer) return null

  // TEMPORARY: Use dummy auctioneer data for development
  const auctioneer = {
    id: 'dummy-auctioneer-id',
    organization_name: 'Test Auction House'
  }

  // TEMPORARY: Skip database query for development - use dummy data
  // const { data: auctions } = await supabase
  //   .from('auctions')
  //   .select(`
  //     *,
  //     lots (count)
  //   `)
  //   .eq('auctioneer_id', auctioneer.id)
  //   .order('created_at', { ascending: false })

  // TEMPORARY: Use dummy auctions data for development
  const auctions = [
    {
      id: 'dummy-auction-1',
      title: 'Sample Auction 1',
      description: 'This is a sample auction for development testing',
      status: 'live',
      starts_at: new Date(Date.now() - 86400000).toISOString(), // Started yesterday
      ends_at: new Date(Date.now() + 86400000).toISOString(), // Ends tomorrow
      anti_sniping_seconds: 300,
      created_at: new Date().toISOString(),
      lots: [{ count: 5 }]
    },
    {
      id: 'dummy-auction-2',
      title: 'Sample Auction 2',
      description: 'Another sample auction for development',
      status: 'draft',
      starts_at: new Date(Date.now() + 172800000).toISOString(), // Starts in 2 days
      ends_at: new Date(Date.now() + 259200000).toISOString(), // Ends in 3 days
      anti_sniping_seconds: 180,
      created_at: new Date().toISOString(),
      lots: [{ count: 12 }]
    }
  ]

  const getStatusBadge = (auction: any) => {
    const now = new Date()
    const startsAt = new Date(auction.starts_at)
    const endsAt = new Date(auction.ends_at)

    if (auction.status === 'draft') {
      return <Badge variant="secondary">Draft</Badge>
    }

    if (now < startsAt) {
      return <Badge variant="outline">Scheduled</Badge>
    }

    if (now >= startsAt && now <= endsAt) {
      return <Badge variant="default" className="bg-green-600">Live</Badge>
    }

    return <Badge variant="destructive">Ended</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            My Auctions
          </h1>
          <p className="text-gray-600">
            Manage your auction listings
          </p>
        </div>
        <Button asChild>
          <Link href="/org/auctions/new" className="flex items-center">
            <Plus className="h-4 w-4 mr-2" />
            Create Auction
          </Link>
        </Button>
      </div>

      {/* Auctions grid */}
      {auctions && auctions.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {auctions.map((auction) => (
            <Card key={auction.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg leading-tight">
                    {auction.title}
                  </CardTitle>
                  {getStatusBadge(auction)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Description */}
                <p className="text-sm text-gray-600 line-clamp-2">
                  {auction.description}
                </p>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Lots:</span>
                    <span className="font-medium ml-1">
                      {auction.lots?.[0]?.count || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Anti-Snipe:</span>
                    <span className="font-medium ml-1">
                      {auction.anti_sniping_seconds}s
                    </span>
                  </div>
                </div>

                {/* Timing */}
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-500">Starts:</span>
                    <span className="ml-1">{formatDate(auction.starts_at)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Ends:</span>
                    <span className="ml-1">{formatDate(auction.ends_at)}</span>
                  </div>
                  {auction.status === 'live' && (
                    <div>
                      <span className="text-gray-500">Time left:</span>
                      <span className="ml-1 font-medium text-green-600">
                        {formatTimeRemaining(auction.ends_at)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/org/auctions/${auction.id}`}>
                      <Edit className="h-4 w-4 mr-1" />
                      Manage
                    </Link>
                  </Button>

                  <Button asChild variant="outline" size="sm">
                    <Link href={`/org/auctions/${auction.id}/lots`}>
                      <Package className="h-4 w-4 mr-1" />
                      Lots
                    </Link>
                  </Button>

                  {auction.status !== 'draft' && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/auctions/${auction.id}`} target="_blank">
                        <Eye className="h-4 w-4 mr-1" />
                        View Public
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Empty state */
        <Card className="text-center py-12">
          <CardContent>
            <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              <Package className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No auctions yet
            </h3>
            <p className="text-gray-600 mb-6">
              Get started by creating your first auction
            </p>
            <Button asChild>
              <Link href="/org/auctions/new">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Auction
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}