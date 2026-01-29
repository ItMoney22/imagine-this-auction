'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface LotFiltersProps {
  categories: string[]
  auctions: Array<{ id: string; title: string }>
}

export function LotFilters({ categories, auctions }: LotFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }

    router.push(`/lots?${params.toString()}`)
  }

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('category')
    params.delete('auction')
    params.delete('sort')
    router.push(`/lots?${params.toString()}`)
  }

  const hasActiveFilters = searchParams.has('category') ||
                          searchParams.has('auction') ||
                          (searchParams.get('sort') && searchParams.get('sort') !== 'lot_number')

  return (
    <div className="space-y-4">
      {/* Category Filter */}
      {categories.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Category
          </label>
          <Select
            value={searchParams.get('category') || '__all__'}
            onValueChange={(value) => updateFilter('category', value === '__all__' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Auction Filter */}
      {auctions.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Auction
          </label>
          <Select
            value={searchParams.get('auction') || '__all__'}
            onValueChange={(value) => updateFilter('auction', value === '__all__' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All auctions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All auctions</SelectItem>
              {auctions.map((auction) => (
                <SelectItem key={auction.id} value={auction.id}>
                  {auction.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Sort Filter */}
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
            <SelectItem value="ending_soon">Ending soon</SelectItem>
            <SelectItem value="highest_bid">Highest bid</SelectItem>
            <SelectItem value="lowest_bid">Lowest bid</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
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
          Clear Filters
        </Button>
      )}
    </div>
  )
}