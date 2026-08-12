'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Package, Search, Filter, X } from 'lucide-react'
import { useState } from 'react'

interface AuctionInfoProps {
  auction: any
  lotCount: number
  categories: string[]
}

export function AuctionInfo({ auction, lotCount, categories }: AuctionInfoProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '')

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }

    router.push(`/auctions/${auction.id}?${params.toString()}`)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilter('search', searchQuery.trim() || null)
  }

  const clearFilters = () => {
    setSearchQuery('')
    const params = new URLSearchParams()
    router.push(`/auctions/${auction.id}`)
  }

  const hasActiveFilters = searchParams.has('search') ||
                          searchParams.has('category') ||
                          (searchParams.get('sort') && searchParams.get('sort') !== 'lot_number')

  return (
    <div className="space-y-6">
      {/* Auction Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="h-5 w-5 mr-2" />
            Auction Stats
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Total Lots:</span>
            <Badge variant="secondary">{lotCount}</Badge>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600">Anti-Sniping:</span>
            <Badge variant="outline">
              +{auction.anti_sniping_seconds}s
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Search & Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Filter Lots
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search lots..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" size="sm" className="w-full">
              Search
            </Button>
          </form>

          {/* Category Filter */}
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <Select
                value={searchParams.get('category') || 'all'}
                onValueChange={(value) => updateFilter('category', value === 'all' ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Sort */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sort by
            </label>
            <Select
              value={searchParams.get('sort') || 'lot_number'}
              onValueChange={(value) => updateFilter('sort', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lot_number">Lot number</SelectItem>
                <SelectItem value="title">Title A-Z</SelectItem>
                <SelectItem value="price_low">Price: Low to High</SelectItem>
                <SelectItem value="price_high">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="w-full"
            >
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Auctioneer Info */}
      <Card>
        <CardHeader>
          <CardTitle>About the Auctioneer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <h4 className="font-medium text-gray-900">
              {auction.auctioneers?.company_name}
            </h4>

            <div className="flex items-center">
              <Badge
                variant={auction.auctioneers?.is_approved ? "default" : "secondary"}
                className={auction.auctioneers?.is_approved ? "bg-green-600" : ""}
              >
                {auction.auctioneers?.is_approved ? "Verified" : "Pending"}
              </Badge>
            </div>

          </div>
        </CardContent>
      </Card>
    </div>
  )
}