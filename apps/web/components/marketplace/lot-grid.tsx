'use client'

import { useState } from 'react'
import { LotCard } from './lot-card'
import { Package } from 'lucide-react'

interface LotGridProps {
  lots: any[]
  auction: any
}

export function LotGrid({ lots, auction }: LotGridProps) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())

  const handleImageError = (lotId: string) => {
    setImageErrors(prev => new Set([...prev, lotId]))
  }

  if (!lots || lots.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
          <Package className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No lots found
        </h3>
        <p className="text-gray-600">
          Try adjusting your search or filters
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Results header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">
          Lots ({lots.length})
        </h2>
      </div>

      {/* Lots grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {lots.map((lot) => (
          <LotCard
            key={lot.id}
            lot={lot}
            auction={auction}
            onImageError={() => handleImageError(lot.id)}
            hasImageError={imageErrors.has(lot.id)}
          />
        ))}
      </div>
    </div>
  )
}