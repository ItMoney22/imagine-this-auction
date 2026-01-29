'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Auction, Lot } from '@/lib/types/database'
import { X, Save } from 'lucide-react'

interface LotFormProps {
  auction: Auction
  lot?: Lot | null
  onSubmit: (lot: Lot) => void
  onCancel: () => void
}

export function LotForm({ auction, lot, onSubmit, onCancel }: LotFormProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: lot?.title || '',
    description: lot?.description || '',
    images: lot?.images ? lot.images.join('\n') : '',
    start_price_itc: lot?.start_price_itc || 0,
    bid_increment_itc: lot?.bid_increment_itc || 10,
    reserve_price_itc: lot?.reserve_price_itc || '',
    category: lot?.category || '',
  })

  // Get next lot number
  const getNextLotNumber = async () => {
    const { data: existingLots } = await supabase
      .from('lots')
      .select('lot_number')
      .eq('auction_id', auction.id)
      .order('lot_number', { ascending: false })
      .limit(1)

    return existingLots?.[0]?.lot_number ? existingLots[0].lot_number + 1 : 1
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Parse images from textarea
      const imageUrls = formData.images
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0)

      const lotData = {
        title: formData.title,
        description: formData.description,
        images: imageUrls,
        start_price_itc: formData.start_price_itc,
        bid_increment_itc: formData.bid_increment_itc,
        reserve_price_itc: formData.reserve_price_itc ?
          parseFloat(formData.reserve_price_itc as string) : null,
        category: formData.category || null,
        auction_id: auction.id,
        status: 'draft' as const,
      }

      let result

      if (lot?.id) {
        // Update existing lot
        result = await supabase
          .from('lots')
          .update(lotData)
          .eq('id', lot.id)
          .select()
          .single()
      } else {
        // Create new lot
        const lotNumber = await getNextLotNumber()
        result = await supabase
          .from('lots')
          .insert({
            ...lotData,
            lot_number: lotNumber,
          })
          .select()
          .single()
      }

      if (result.error) throw result.error

      onSubmit(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="title">Lot Title</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., Antique Oak Dining Table"
            required
          />
        </div>

        <div>
          <Label htmlFor="category">Category (optional)</Label>
          <Input
            id="category"
            value={formData.category}
            onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
            placeholder="e.g., Furniture, Collectibles, Art"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Detailed description, condition notes, measurements, etc."
          rows={3}
          required
        />
      </div>

      <div>
        <Label htmlFor="images">Image URLs (one per line)</Label>
        <Textarea
          id="images"
          value={formData.images}
          onChange={(e) => setFormData(prev => ({ ...prev, images: e.target.value }))}
          placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
          rows={3}
        />
        <p className="text-sm text-gray-600 mt-1">
          Enter one image URL per line. Images should be publicly accessible.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="start_price_itc">Starting Price (ITC)</Label>
          <Input
            id="start_price_itc"
            type="number"
            min="1"
            value={formData.start_price_itc}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              start_price_itc: parseInt(e.target.value) || 0
            }))}
            required
          />
        </div>

        <div>
          <Label htmlFor="bid_increment_itc">Bid Increment (ITC)</Label>
          <Input
            id="bid_increment_itc"
            type="number"
            min="1"
            value={formData.bid_increment_itc}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              bid_increment_itc: parseInt(e.target.value) || 10
            }))}
            required
          />
        </div>

        <div>
          <Label htmlFor="reserve_price_itc">Reserve Price (ITC, optional)</Label>
          <Input
            id="reserve_price_itc"
            type="number"
            min="1"
            value={formData.reserve_price_itc}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              reserve_price_itc: e.target.value
            }))}
            disabled={!auction.reserve_allowed}
            placeholder={auction.reserve_allowed ? "Optional" : "Not allowed"}
          />
          {!auction.reserve_allowed && (
            <p className="text-sm text-gray-600 mt-1">
              Reserve prices are not allowed for this auction
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? 'Saving...' : lot?.id ? 'Update Lot' : 'Add Lot'}
        </Button>
      </div>
    </form>
  )
}