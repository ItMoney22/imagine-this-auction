'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface AuctionFiltersProps {
  categories: string[]
}

export function AuctionFilters({ categories }: AuctionFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }

    router.push(`/auctions?${params.toString()}`)
  }

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('status')
    params.delete('category')
    params.delete('sort')
    router.push(`/auctions?${params.toString()}`)
  }

  const hasActiveFilters = searchParams.has('status') ||
                          searchParams.has('category') ||
                          (searchParams.get('sort') && searchParams.get('sort') !== 'ending_soon')

  return (
    <div className="space-y-4">
      {/* Status Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Status
        </label>
        <Select
          value={searchParams.get('status') || '__all__'}
          onValueChange={(value) => updateFilter('status', value === '__all__' ? null : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="live">Live now</SelectItem>
            <SelectItem value="ending_soon">Ending soon</SelectItem>
            <SelectItem value="upcoming">Starting soon</SelectItem>
          </SelectContent>
        </Select>
      </div>

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

      {/* Sort Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sort by
        </label>
        <Select
          value={searchParams.get('sort') || 'ending_soon'}
          onValueChange={(value) => updateFilter('sort', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ending_soon">Ending soon</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
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