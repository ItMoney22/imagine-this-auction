'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, RefreshCw, Eye, Mail, Smartphone } from 'lucide-react'
import { toast } from 'sonner'

interface Lot {
  id: string
  title: string
  description: string
  category: string
  hype_copy: any
  auctions: {
    id: string
    title: string
    status: string
  }
}

interface HypePreviewProps {
  lots: Lot[]
}

export function HypePreview({ lots }: HypePreviewProps) {
  const [selectedLot, setSelectedLot] = useState<Lot | null>(lots[0] || null)
  const [regenerating, setRegenerating] = useState(false)
  const [previewMode, setPreviewMode] = useState<'email' | 'push' | 'web'>('web')

  const regenerateHypeCopy = async (style: 'Hype' | 'Classic' | 'Collector') => {
    if (!selectedLot) return

    setRegenerating(true)
    try {
      const response = await fetch('/api/ai/copywriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lots: [{
            id: selectedLot.id,
            title: selectedLot.title,
            description: selectedLot.description,
            category: selectedLot.category
          }],
          style,
          batch_id: `manual-${selectedLot.id}-${Date.now()}`
        })
      })

      const result = await response.json()

      if (result.success && result.results?.[0]) {
        // Update the local state with new hype copy
        const newHypeCopy = result.results[0].hype_copy
        setSelectedLot({
          ...selectedLot,
          hype_copy: newHypeCopy
        })
        toast.success(`Hype copy regenerated in ${style} style!`)
      } else {
        toast.error(result.error || 'Failed to regenerate hype copy')
      }
    } catch (error) {
      toast.error('Failed to regenerate hype copy')
      console.error(error)
    } finally {
      setRegenerating(false)
    }
  }

  const renderPreview = () => {
    if (!selectedLot?.hype_copy) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Eye className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>No hype copy available for this lot</p>
        </div>
      )
    }

    let hype = selectedLot.hype_copy
    if (typeof hype === 'string') {
      try {
        hype = JSON.parse(hype)
      } catch {
        hype = null
      }
    }

    if (!hype) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Eye className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>Hype copy is not in a previewable format yet</p>
        </div>
      )
    }

    switch (previewMode) {
      case 'email':
        return (
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-4 bg-white">
              <div className="text-sm text-gray-500 mb-2">Subject Line:</div>
              <div className="font-medium">{hype.email_subject}</div>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 bg-white">
              <div className="text-sm text-gray-500 mb-2">Email Preview:</div>
              <h3 className="text-lg font-bold mb-2">{hype.headline}</h3>
              <p className="text-gray-700 mb-4">{hype.teaser}</p>
              <Button size="sm" className="inline-flex">
                {hype.cta}
              </Button>
            </div>
          </div>
        )

      case 'push':
        return (
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-900 text-white max-w-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-indigo-500 rounded flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs font-bold">🔨</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{hype.push_title}</div>
                  <div className="text-gray-300 text-xs mt-1">{hype.push_body}</div>
                  <div className="text-gray-400 text-xs mt-2">now</div>
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Preview of push notification appearance on mobile devices
            </div>
          </div>
        )

      case 'web':
      default:
        return (
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-6 bg-white">
              <h3 className="text-xl font-bold mb-3">{hype.headline}</h3>
              <p className="text-gray-700 mb-4">{hype.teaser}</p>
              <div className="flex items-center justify-between">
                <Badge variant="outline">
                  Style: {hype.style}
                </Badge>
                <Button>
                  {hype.cta}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Generated:</span>
                <span className="ml-2">{new Date(hype.generated_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-500">Toxicity Score:</span>
                <span className="ml-2">
                  <Badge variant={hype.toxicity_score > 0.3 ? 'destructive' : 'secondary'}>
                    {(hype.toxicity_score || 0).toFixed(2)}
                  </Badge>
                </span>
              </div>
            </div>
          </div>
        )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Hype Copy Preview
        </CardTitle>
        <CardDescription>
          Preview AI-generated marketing copy for auction lots
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Lot Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Lot:</label>
          <Select
            value={selectedLot?.id || ''}
            onValueChange={(lotId) => {
              const lot = lots.find(l => l.id === lotId)
              setSelectedLot(lot || null)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a lot to preview" />
            </SelectTrigger>
            <SelectContent>
              {lots.map((lot) => (
                <SelectItem key={lot.id} value={lot.id}>
                  {lot.title} ({lot.category})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Preview Mode Selection */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={previewMode === 'web' ? 'default' : 'outline'}
            onClick={() => setPreviewMode('web')}
            className="flex items-center gap-1"
          >
            <Eye className="h-3 w-3" />
            Web
          </Button>
          <Button
            size="sm"
            variant={previewMode === 'email' ? 'default' : 'outline'}
            onClick={() => setPreviewMode('email')}
            className="flex items-center gap-1"
          >
            <Mail className="h-3 w-3" />
            Email
          </Button>
          <Button
            size="sm"
            variant={previewMode === 'push' ? 'default' : 'outline'}
            onClick={() => setPreviewMode('push')}
            className="flex items-center gap-1"
          >
            <Smartphone className="h-3 w-3" />
            Push
          </Button>
        </div>

        {/* Preview Content */}
        <div className="min-h-[200px]">
          {renderPreview()}
        </div>

        {/* Regeneration Controls */}
        {selectedLot && (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Regenerate with style:</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => regenerateHypeCopy('Hype')}
                  disabled={regenerating}
                  className="flex items-center gap-1"
                >
                  {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Hype
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => regenerateHypeCopy('Classic')}
                  disabled={regenerating}
                  className="flex items-center gap-1"
                >
                  {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Classic
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => regenerateHypeCopy('Collector')}
                  disabled={regenerating}
                  className="flex items-center gap-1"
                >
                  {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Collector
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
