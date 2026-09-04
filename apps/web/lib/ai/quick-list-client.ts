'use client'

import { createClient } from '@/lib/supabase/client'
import {
  ORIGINAL_IMAGE_BUCKET,
  type ImageVariant,
  type UploadedImage,
} from '@/lib/ai/quick-listing'

/**
 * Browser-side helpers for Quick List.
 *
 * Photos are uploaded straight to Supabase Storage (same path the existing lot
 * form uses) and hashed in the browser, so the checksum recorded against a
 * verified original is taken from the bytes the auctioneer actually captured.
 */

export class QuickListApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'QuickListApiError'
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new QuickListApiError(
      payload?.error ?? `Request failed (${response.status})`,
      response.status,
      payload?.code,
      payload
    )
  }

  return payload as T
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')
}

async function sha256Hex(file: File): Promise<string | null> {
  // crypto.subtle needs a secure context; on plain http dev the checksum is
  // simply omitted rather than blocking the upload.
  if (typeof crypto === 'undefined' || !crypto.subtle) return null

  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
      resolve(null)
      return
    }

    const url = URL.createObjectURL(file)
    const image = new window.Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]

/** Upload verified original photos. These bytes are never modified afterwards. */
export async function uploadOriginalPhotos(
  auctioneerId: string,
  files: File[],
  onProgress?: (completed: number, total: number) => void
): Promise<UploadedImage[]> {
  const supabase = createClient()
  const uploaded: UploadedImage[] = []

  for (const [index, file] of files.entries()) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`"${file.name}" is larger than 15MB.`)
    }
    if (file.type && !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      throw new Error(`"${file.name}" is not a supported image format.`)
    }

    const path = [
      'quick-list',
      auctioneerId,
      `${Date.now()}-${crypto.randomUUID()}-${sanitizeFilename(file.name || 'photo.jpg')}`,
    ].join('/')

    const { error } = await supabase.storage
      .from(ORIGINAL_IMAGE_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })

    if (error) throw new Error(`Upload failed for "${file.name}": ${error.message}`)

    const { data } = supabase.storage.from(ORIGINAL_IMAGE_BUCKET).getPublicUrl(path)
    const [checksum, dimensions] = await Promise.all([
      sha256Hex(file),
      readImageDimensions(file),
    ])

    uploaded.push({
      bucket: ORIGINAL_IMAGE_BUCKET,
      storage_path: path,
      public_url: data.publicUrl,
      checksum_sha256: checksum,
      byte_size: file.size,
      mime_type: file.type || 'image/jpeg',
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    })

    onProgress?.(index + 1, files.length)
  }

  return uploaded
}

// ============================================================
// API calls
// ============================================================

export interface PricingResponse {
  available_credits: number
  image_generation_available: boolean
  prices: Array<{
    action_key: string
    label: string
    description: string | null
    category: 'listing' | 'image'
    credit_cost: number
    is_enabled: boolean
    rate_limit_per_hour: number
    affordable: boolean
  }>
}

export function fetchPricing() {
  return request<PricingResponse>('/api/ai/quick-list/pricing')
}

export function identifyItem(body: {
  idempotency_key: string
  auction_id?: string
  scan_value?: string
  manual_context?: string
  images: UploadedImage[]
}) {
  return request<{
    draft?: Record<string, any>
    draft_id?: string
    candidates: Array<Record<string, any>>
    requires_selection?: boolean
    duplicate?: boolean
    charged: number
    balance_after?: number
    error?: string
    moderation?: { status: string; reasons: string[] }
  }>('/api/ai/quick-list/identify', { method: 'POST', body: JSON.stringify(body) })
}

export function generateDraft(
  draftId: string,
  body: { idempotency_key: string; candidate_index?: number | null; manual_context?: string }
) {
  return request<{
    draft: Record<string, any>
    suggestion: Record<string, any>
    charged: number
    balance_after?: number
    moderation?: { status: string; reasons: string[] }
  }>(`/api/ai/quick-list/drafts/${draftId}/generate`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function fetchDraft(draftId: string) {
  return request<{
    draft: Record<string, any>
    original_images: Array<Record<string, any>>
    generated_images: Array<Record<string, any>>
    image_jobs: Array<Record<string, any>>
    credit_ledger: Array<Record<string, any>>
  }>(`/api/ai/quick-list/drafts/${draftId}`)
}

export function patchDraft(draftId: string, body: Record<string, unknown>) {
  return request<{ draft: Record<string, any> }>(`/api/ai/quick-list/drafts/${draftId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function discardDraft(draftId: string) {
  return request<{ ok: boolean }>(`/api/ai/quick-list/drafts/${draftId}`, { method: 'DELETE' })
}

export function approveDraft(
  draftId: string,
  body: {
    auction_id: string
    reserve_price?: number | null
    increment: number
    include_ai_images: boolean
    confirmed_reviewed: true
  }
) {
  return request<{
    ok: boolean
    lot_id: string
    lot_number: number
    original_image_count: number
    ai_image_count: number
  }>(`/api/ai/quick-list/drafts/${draftId}/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function fetchDrafts(params?: { status?: string; auction_id?: string }) {
  const search = new URLSearchParams()
  if (params?.status) search.set('status', params.status)
  if (params?.auction_id) search.set('auction_id', params.auction_id)

  const query = search.toString()

  return request<{ drafts: Array<Record<string, any>> }>(
    `/api/ai/quick-list/drafts${query ? `?${query}` : ''}`
  )
}

export function generatePresentationImage(body: {
  idempotency_key: string
  variant: ImageVariant
  source_image_id: string
  draft_id?: string
  lot_id?: string
  scene_hint?: string
}) {
  return request<{
    job: Record<string, any>
    image?: Record<string, any>
    disclosure?: string
    charged: number
    balance_after?: number
  }>('/api/ai/images/generate', { method: 'POST', body: JSON.stringify(body) })
}
