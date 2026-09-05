'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export function CommunityNavLink({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/community/status', { signal: controller.signal }).then(r => r.json()).then(data => setEnabled(data.enabled === true)).catch(() => {})
    return () => controller.abort()
  }, [])
  return enabled ? <Link href="/feed" className={className} onClick={onNavigate}>Community</Link> : null
}
