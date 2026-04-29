'use client'

import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface WatchButtonProps {
  lotId: string
  variant?: 'icon' | 'pill'
  showCount?: boolean
}

export function WatchButton({ lotId, variant = 'icon', showCount = false }: WatchButtonProps) {
  const [watching, setWatching] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [authed, setAuthed] = useState(true)

  useEffect(() => {
    fetch(`/api/watchlist/${lotId}/count`)
      .then(r => r.json())
      .then(d => {
        setCount(d.count ?? 0)
        setWatching(!!d.isWatching)
      })
      .catch(() => {})
  }, [lotId])

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (loading) return
    setLoading(true)
    try {
      const res = watching
        ? await fetch(`/api/watchlist?lot_id=${lotId}`, { method: 'DELETE' })
        : await fetch('/api/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lot_id: lotId }),
          })
      if (res.status === 401) {
        setAuthed(false)
        return
      }
      const next = !watching
      setWatching(next)
      setCount(c => (c === null ? null : c + (next ? 1 : -1)))
    } finally {
      setLoading(false)
    }
  }

  if (!authed) {
    return (
      <Button variant="outline" size={variant === 'icon' ? 'icon' : 'sm'} asChild>
        <a href="/login" onClick={e => e.stopPropagation()}>
          <Heart className="h-4 w-4" />
          {variant === 'pill' && <span className="ml-2">Sign in to watch</span>}
        </a>
      </Button>
    )
  }

  if (variant === 'pill') {
    return (
      <Button
        variant={watching ? 'default' : 'outline'}
        size="sm"
        onClick={toggle}
        disabled={loading}
        className={cn(watching && 'bg-pink-600 hover:bg-pink-700 text-white border-pink-600')}
      >
        <Heart className={cn('h-4 w-4 mr-2', watching && 'fill-current')} />
        {watching ? 'Watching' : 'Watch'}
        {showCount && count !== null && count > 0 && (
          <span className="ml-2 text-xs opacity-80">({count})</span>
        )}
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      disabled={loading}
      className={cn('flex-shrink-0', watching && 'bg-pink-50 border-pink-300 text-pink-600 hover:bg-pink-100')}
      aria-label={watching ? 'Unwatch lot' : 'Watch lot'}
    >
      <Heart className={cn('h-4 w-4', watching && 'fill-current')} />
    </Button>
  )
}
