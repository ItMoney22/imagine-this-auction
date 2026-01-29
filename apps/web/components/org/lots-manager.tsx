'use client'

import { useState } from 'react'
import { Auction, Lot } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LotForm } from './lot-form'
import { CsvUpload } from './csv-upload'
import { formatCurrency } from '@/lib/utils'
import {
  Plus,
  Upload,
  Edit,
  Trash2,
  Eye,
  Package,
  ArrowLeft
} from 'lucide-react'
import Link from 'next/link'

interface LotsManagerProps {
  auction: Auction
  lots: (Lot & { bids?: any[] })[]
}

export function LotsManager({ auction, lots: initialLots }: LotsManagerProps) {
  const [lots, setLots] = useState(initialLots)
  const [showLotForm, setShowLotForm] = useState(false)
  const [showCsvUpload, setShowCsvUpload] = useState(false)
  const [editingLot, setEditingLot] = useState<Lot | null>(null)

  const handleLotUpdate = (updatedLot: Lot) => {
    setLots(prev => prev.map(lot =>
      lot.id === updatedLot.id ? { ...lot, ...updatedLot } : lot
    ))
    setEditingLot(null)
    setShowLotForm(false)
  }

  const handleLotAdd = (newLot: Lot) => {
    setLots(prev => [...prev, newLot])
    setShowLotForm(false)
  }

  const handleCsvImport = (importedLots: Lot[]) => {
    setLots(prev => [...prev, ...importedLots])
    setShowCsvUpload(false)
  }

  const getStatusBadge = (lot: Lot) => {
    const now = new Date()
    const auctionStart = new Date(auction.starts_at)
    const auctionEnd = new Date(auction.ends_at)

    if (auction.status === 'draft' || lot.status === 'draft') {
      return <Badge variant="secondary">Draft</Badge>
    }

    if (now < auctionStart) {
      return <Badge variant="outline">Scheduled</Badge>
    }

    if (now >= auctionStart && now <= auctionEnd) {
      return <Badge variant="default" className="bg-green-600">Live</Badge>
    }

    return <Badge variant="destructive">Ended</Badge>
  }

  const getCurrentHighBid = (lot: Lot & { bids?: any[] }) => {
    if (!lot.bids || lot.bids.length === 0) {
      return lot.start_price_itc
    }

    return Math.max(...lot.bids.map(bid => bid.amount_itc))
  }

  const getBidCount = (lot: Lot & { bids?: any[] }) => {
    return lot.bids?.length || 0
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center space-x-4">
        <Button variant="outline" asChild>
          <Link href={`/org/auctions/${auction.id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Auction
          </Link>
        </Button>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => setShowLotForm(true)}
          disabled={showLotForm || showCsvUpload}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Lot
        </Button>

        <Button
          variant="outline"
          onClick={() => setShowCsvUpload(true)}
          disabled={showLotForm || showCsvUpload}
        >
          <Upload className="h-4 w-4 mr-2" />
          Bulk Upload CSV
        </Button>
      </div>

      {/* Lot form modal */}
      {showLotForm && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingLot ? 'Edit Lot' : 'Add New Lot'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LotForm
              auction={auction}
              lot={editingLot}
              onSubmit={editingLot ? handleLotUpdate : handleLotAdd}
              onCancel={() => {
                setShowLotForm(false)
                setEditingLot(null)
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* CSV upload modal */}
      {showCsvUpload && (
        <Card>
          <CardHeader>
            <CardTitle>Bulk Upload Lots via CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <CsvUpload
              auction={auction}
              onImport={handleCsvImport}
              onCancel={() => setShowCsvUpload(false)}
            />
          </CardContent>
        </Card>
      )}

      {/* Lots list */}
      {lots.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lots.map((lot) => (
            <Card key={lot.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      Lot #{lot.lot_number}: {lot.title}
                    </h3>
                    <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                      {lot.description}
                    </p>
                  </div>
                  {getStatusBadge(lot)}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Images preview */}
                {lot.images && lot.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {lot.images.slice(0, 3).map((image, index) => (
                      <div
                        key={index}
                        className="aspect-square bg-gray-100 rounded-md overflow-hidden"
                      >
                        <img
                          src={image}
                          alt={`Lot ${lot.lot_number} image ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/placeholder-image.jpg'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Pricing info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Start Price:</span>
                    <div className="font-medium">
                      {formatCurrency(lot.start_price_itc)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Increment:</span>
                    <div className="font-medium">
                      {formatCurrency(lot.bid_increment_itc)}
                    </div>
                  </div>
                  {lot.reserve_price_itc && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Reserve:</span>
                      <div className="font-medium text-red-600">
                        {formatCurrency(lot.reserve_price_itc)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bidding stats */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Current High:</span>
                    <div className="font-medium text-green-600">
                      {formatCurrency(getCurrentHighBid(lot))}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Bids:</span>
                    <div className="font-medium">
                      {getBidCount(lot)}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingLot(lot)
                      setShowLotForm(true)
                    }}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>

                  {auction.status !== 'draft' && (
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                    >
                      <Link href={`/lots/${lot.id}`} target="_blank">
                        <Eye className="h-3 w-3 mr-1" />
                        View
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
              No lots added yet
            </h3>
            <p className="text-gray-600 mb-6">
              Add individual lots or use bulk CSV upload to get started
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={() => setShowLotForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Lot
              </Button>
              <Button variant="outline" onClick={() => setShowCsvUpload(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}