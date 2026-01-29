'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Package,
  MapPin,
  Calendar,
  DollarSign,
  TrendingUp
} from 'lucide-react'

interface LotDetailProps {
  lot: any
  auction: any
}

export function LotDetail({ lot, auction }: LotDetailProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [imageError, setImageError] = useState<Set<number>>(new Set())

  const images = lot.images || []
  const hasImages = images.length > 0

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length)
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)
  }

  const handleImageError = (index: number) => {
    setImageError(prev => new Set([...prev, index]))
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <Link href="/auctions" className="hover:text-blue-600">
          Auctions
        </Link>
        <span>/</span>
        <Link href={`/auctions/${auction.id}`} className="hover:text-blue-600">
          {auction.title}
        </Link>
        <span>/</span>
        <span className="text-gray-900">Lot #{lot.lot_number}</span>
      </div>

      {/* Back button */}
      <Button variant="outline" asChild>
        <Link href={`/auctions/${auction.id}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Auction
        </Link>
      </Button>

      {/* Lot Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">Lot #{lot.lot_number}</Badge>
                {lot.category && (
                  <Badge variant="secondary">{lot.category}</Badge>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                {lot.title}
              </h1>
            </div>

            {/* Reserve indicator */}
            {lot.reserve_price_itc && (
              <Badge variant="destructive" className="self-start">
                Reserve: {formatCurrency(lot.reserve_price_itc)}
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Images */}
      <Card>
        <CardContent className="p-0">
          {hasImages ? (
            <div className="relative">
              {/* Main image */}
              <div className="aspect-square md:aspect-video bg-gray-100 rounded-t-lg overflow-hidden">
                {!imageError.has(currentImageIndex) ? (
                  <img
                    src={images[currentImageIndex]}
                    alt={`${lot.title} - Image ${currentImageIndex + 1}`}
                    className="w-full h-full object-cover"
                    onError={() => handleImageError(currentImageIndex)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-16 w-16 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Navigation arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}

              {/* Image counter */}
              {images.length > 1 && (
                <div className="absolute bottom-4 right-4 bg-black/60 text-white text-sm px-3 py-1 rounded">
                  {currentImageIndex + 1} / {images.length}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-square md:aspect-video bg-gray-100 rounded-t-lg flex items-center justify-center">
              <Package className="h-16 w-16 text-gray-400" />
            </div>
          )}

          {/* Thumbnail strip */}
          {images.length > 1 && (
            <div className="flex gap-2 p-4 overflow-x-auto">
              {images.map((image, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                    index === currentImageIndex ? 'border-blue-600' : 'border-gray-200'
                  }`}
                >
                  {!imageError.has(index) ? (
                    <img
                      src={image}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                      onError={() => handleImageError(index)}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      <Package className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
            {lot.description}
          </p>
        </CardContent>
      </Card>

      {/* Lot Details */}
      <Card>
        <CardHeader>
          <CardTitle>Lot Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center">
                <DollarSign className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <div className="text-sm text-gray-600">Starting Price</div>
                  <div className="font-medium">{formatCurrency(lot.start_price_itc)}</div>
                </div>
              </div>

              <div className="flex items-center">
                <TrendingUp className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <div className="text-sm text-gray-600">Bid Increment</div>
                  <div className="font-medium">{formatCurrency(lot.bid_increment_itc)}</div>
                </div>
              </div>

              {lot.reserve_price_itc && (
                <div className="flex items-center">
                  <Package className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <div className="text-sm text-gray-600">Reserve Price</div>
                    <div className="font-medium text-red-600">
                      {formatCurrency(lot.reserve_price_itc)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {lot.category && (
                <div className="flex items-center">
                  <Package className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <div className="text-sm text-gray-600">Category</div>
                    <div className="font-medium">{lot.category}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center">
                <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <div className="text-sm text-gray-600">Auction Status</div>
                  <div className="font-medium">
                    {auction.status === 'live' ? 'Live Auction' : 'Draft'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auction Information */}
      <Card>
        <CardHeader>
          <CardTitle>Auction Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center">
              <MapPin className="h-5 w-5 text-gray-400 mr-3" />
              <div>
                <div className="text-sm text-gray-600">Auctioneer</div>
                <div className="font-medium">
                  {auction.auctioneers?.slug ? (
                    <Link
                      href={`/auctioneers/${auction.auctioneers.slug}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {auction.auctioneers.organization_name}
                    </Link>
                  ) : (
                    auction.auctioneers?.organization_name
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <div className="text-sm text-gray-600">Starts</div>
                  <div className="font-medium">{formatDate(auction.starts_at)}</div>
                </div>
              </div>

              <div className="flex items-center">
                <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <div className="text-sm text-gray-600">Ends</div>
                  <div className="font-medium">{formatDate(auction.ends_at)}</div>
                </div>
              </div>
            </div>

            {auction.anti_sniping_seconds > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-800">
                  <strong>Anti-Sniping:</strong> Auction will extend by {auction.anti_sniping_seconds} seconds
                  if a bid is placed near the end time.
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}