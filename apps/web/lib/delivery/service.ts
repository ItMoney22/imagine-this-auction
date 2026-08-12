import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  canTransition,
  CUSTOMER_STATUS_LABEL,
  EVENT_LABEL,
  type DeliveryEventType,
  type DeliveryStatus,
} from '@/lib/delivery/state'

// The hand-written Database types don't know the delivery tables yet, so the
// service works with the untyped client (same pattern as the payment routes).
export function deliveryAdmin(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export interface SessionActor {
  userId: string
  role: 'bidder' | 'auctioneer' | 'admin' | 'driver'
}

export async function getSessionActor(): Promise<SessionActor | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile) return null

  return { userId: user.id, role: profile.role as SessionActor['role'] }
}

export async function getDriverProfile(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from('drivers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

export interface EventInput {
  delivery_id: string
  event_type: DeliveryEventType
  actor_user_id?: string | null
  actor_role?: string | null
  notes?: string | null
  photo_path?: string | null
  lat?: number | null
  lng?: number | null
  metadata?: Record<string, unknown> | null
}

export async function appendEvent(admin: SupabaseClient, event: EventInput) {
  const { error } = await admin.from('delivery_events').insert({
    delivery_id: event.delivery_id,
    event_type: event.event_type,
    actor_user_id: event.actor_user_id ?? null,
    actor_role: event.actor_role ?? null,
    notes: event.notes ?? null,
    photo_path: event.photo_path ?? null,
    lat: event.lat ?? null,
    lng: event.lng ?? null,
    metadata: event.metadata ?? null,
  })
  if (error) {
    console.error('Failed to append delivery event:', error.message)
  }
}

/**
 * Atomically move a delivery to a new status (guarded on the current status so
 * two concurrent writers can't both win) and append the audit event.
 */
export async function transitionDelivery(
  admin: SupabaseClient,
  delivery: { id: string; status: DeliveryStatus },
  to: DeliveryStatus,
  updates: Record<string, unknown>,
  event: Omit<EventInput, 'delivery_id' | 'event_type'>
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  if (!canTransition(delivery.status, to)) {
    return { data: null, error: `Cannot move delivery from '${delivery.status}' to '${to}'` }
  }

  const { data, error } = await admin
    .from('deliveries')
    .update({ status: to, ...updates })
    .eq('id', delivery.id)
    .eq('status', delivery.status)
    .select()
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: 'Delivery was updated by someone else — refresh and retry' }

  await appendEvent(admin, { delivery_id: delivery.id, event_type: to, ...event })
  return { data, error: null }
}

/** Insert a notifications row — the email/push pipeline delivers it. */
export async function notifyUser(
  admin: SupabaseClient,
  userId: string,
  title: string,
  message: string,
  type: string
) {
  const { error } = await admin
    .from('notifications')
    .insert({ user_id: userId, title, message, type })
  if (error) {
    console.error('Failed to insert delivery notification:', error.message)
  }
}

/** Decode a base64 data-URL and store it in the private delivery-proofs bucket. */
export async function uploadProofImage(
  admin: SupabaseClient,
  deliveryId: string,
  kind: 'proof' | 'signature' | 'exception',
  dataUrl: string
): Promise<{ path: string | null; error: string | null }> {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl)
  if (!match) return { path: null, error: 'Invalid image data' }

  const [, contentType, base64] = match
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length > 8 * 1024 * 1024) return { path: null, error: 'Image too large (max 8MB)' }

  const ext = contentType.split('/')[1]
  const path = `${deliveryId}/${kind}-${Date.now()}.${ext}`
  const { error } = await admin.storage
    .from('delivery-proofs')
    .upload(path, buffer, { contentType })

  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

export async function signedProofUrl(admin: SupabaseClient, path: string | null) {
  if (!path) return null
  const { data } = await admin.storage.from('delivery-proofs').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

/**
 * Customer-facing view: simple statuses and a timeline. Never includes driver
 * identity/contact, live location, or internal notes/photos.
 */
export function sanitizeForCustomer(
  delivery: Record<string, unknown>,
  events: Array<Record<string, unknown>>
) {
  const status = delivery.status as DeliveryStatus
  const timelineTypes = new Set([
    'created', 'offered', 'claimed', 'arrived', 'picked_up',
    'out_for_delivery', 'delivered', 'exception', 'returned', 'cancelled', 'failed',
  ])

  return {
    tracking_number: delivery.tracking_number,
    status,
    status_label: CUSTOMER_STATUS_LABEL[status] ?? status,
    eta_window_start: delivery.eta_window_start ?? null,
    eta_window_end: delivery.eta_window_end ?? null,
    delivered_at: delivery.delivered_at ?? null,
    recipient_name: status === 'delivered' ? (delivery.recipient_name ?? null) : null,
    timeline: events
      .filter((e) => timelineTypes.has(String(e.event_type)))
      .map((e) => ({
        label: EVENT_LABEL[String(e.event_type)] ?? String(e.event_type),
        at: e.created_at,
      })),
  }
}
