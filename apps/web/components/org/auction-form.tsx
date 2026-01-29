'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Auction } from '@/lib/types/database'
import { Save, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface AuctionFormProps {
  auction?: Auction | null
}

export function AuctionForm({ auction }: AuctionFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: auction?.title || '',
    description: auction?.description || '',
    starts_at: auction?.starts_at ? new Date(auction.starts_at).toISOString().slice(0, 16) : '',
    ends_at: auction?.ends_at ? new Date(auction.ends_at).toISOString().slice(0, 16) : '',
    anti_sniping_seconds: auction?.anti_sniping_seconds || 60,
    reserve_allowed: auction?.reserve_allowed || false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Get current user and auctioneer
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: auctioneer } = await supabase
        .from('auctioneers')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!auctioneer) throw new Error('Auctioneer not found')

      // Validate dates
      const startsAt = new Date(formData.starts_at)
      const endsAt = new Date(formData.ends_at)
      const now = new Date()

      if (startsAt <= now) {
        throw new Error('Start time must be in the future')
      }

      if (endsAt <= startsAt) {
        throw new Error('End time must be after start time')
      }

      const auctionData = {
        ...formData,
        auctioneer_id: auctioneer.id,
        status: 'draft' as const,
      }

      let result

      if (auction?.id) {
        // Update existing auction
        result = await supabase
          .from('auctions')
          .update(auctionData)
          .eq('id', auction.id)
          .select()
          .single()
      } else {
        // Create new auction
        result = await supabase
          .from('auctions')
          .insert(auctionData)
          .select()
          .single()
      }

      if (result.error) throw result.error

      router.push(`/org/auctions/${result.data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Auto-set end time to 24 hours after start time if start time changes
  const handleStartTimeChange = (value: string) => {
    setFormData(prev => {
      const newData = { ...prev, starts_at: value }

      if (value && !prev.ends_at) {
        const startDate = new Date(value)
        const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000) // Add 24 hours
        newData.ends_at = endDate.toISOString().slice(0, 16)
      }

      return newData
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Back button */}
      <div className="flex items-center space-x-4">
        <Button type="button" variant="outline" asChild>
          <Link href="/org/auctions">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Auctions
          </Link>
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Auction Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Estate Sale Auction - Antiques & Collectibles"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe your auction, include terms and conditions..."
              rows={4}
              required
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timing & Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="starts_at">Start Date & Time</Label>
              <Input
                id="starts_at"
                type="datetime-local"
                value={formData.starts_at}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="ends_at">End Date & Time</Label>
              <Input
                id="ends_at"
                type="datetime-local"
                value={formData.ends_at}
                onChange={(e) => setFormData(prev => ({ ...prev, ends_at: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="anti_sniping_seconds">Anti-Sniping Extension (seconds)</Label>
            <Select
              value={formData.anti_sniping_seconds.toString()}
              onValueChange={(value) => setFormData(prev => ({
                ...prev,
                anti_sniping_seconds: parseInt(value)
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">60 seconds</SelectItem>
                <SelectItem value="120">2 minutes</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
                <SelectItem value="600">10 minutes</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-600 mt-1">
              Extend auction end time when bids are placed near the end
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="reserve_allowed"
              checked={formData.reserve_allowed}
              onCheckedChange={(checked) => setFormData(prev => ({
                ...prev,
                reserve_allowed: checked
              }))}
            />
            <Label htmlFor="reserve_allowed">Allow reserve prices on lots</Label>
            <p className="text-sm text-gray-600">
              Let bidders set minimum reserve prices for their lots
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? 'Saving...' : auction?.id ? 'Update Auction' : 'Create Auction'}
        </Button>
      </div>
    </form>
  )
}