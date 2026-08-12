// Local Delivery status machine — the single source of truth for what
// transitions are legal and what each status means on every surface.
// Design: docs/plans/2026-08-12-local-delivery-tracking-design.md

export const DELIVERY_STATUSES = [
  'created',
  'offered',
  'claimed',
  'arrived',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
  'cancelled',
  'failed',
] as const

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const TERMINAL_STATUSES: readonly DeliveryStatus[] = [
  'delivered',
  'returned',
  'cancelled',
  'failed',
]

/** Statuses during which a consenting driver's location pings are accepted. */
export const LOCATION_ACTIVE_STATUSES: readonly DeliveryStatus[] = [
  'claimed',
  'arrived',
  'picked_up',
  'out_for_delivery',
]

const TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  created: ['offered', 'cancelled'],
  offered: ['claimed', 'cancelled'],
  claimed: ['arrived', 'picked_up', 'exception', 'offered', 'cancelled'],
  arrived: ['picked_up', 'exception', 'offered', 'cancelled'],
  picked_up: ['out_for_delivery', 'exception', 'cancelled'],
  out_for_delivery: ['delivered', 'exception', 'failed', 'cancelled'],
  exception: ['offered', 'returned', 'cancelled', 'failed', 'out_for_delivery'],
  delivered: [],
  returned: [],
  cancelled: [],
  failed: ['returned'],
}

export function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to)
}

export function isTerminal(status: DeliveryStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export const EXCEPTION_REASONS = [
  'customer_unavailable',
  'unsafe_location',
  'damaged_item',
  'wrong_address',
  'vehicle_issue',
  'other',
] as const

export type ExceptionReason = (typeof EXCEPTION_REASONS)[number]

export const EXCEPTION_REASON_LABEL: Record<ExceptionReason, string> = {
  customer_unavailable: 'Customer unavailable',
  unsafe_location: 'Unsafe location',
  damaged_item: 'Damaged item',
  wrong_address: 'Wrong address',
  vehicle_issue: 'Vehicle issue',
  other: 'Other',
}

/** Customer-facing labels — deliberately simple, no internal jargon. */
export const CUSTOMER_STATUS_LABEL: Record<DeliveryStatus, string> = {
  created: 'Preparing your package',
  offered: 'Finding your driver',
  claimed: 'Driver assigned',
  arrived: 'Driver at pickup location',
  picked_up: 'Package picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  exception: 'Delivery delayed',
  returned: 'Returned to warehouse',
  cancelled: 'Delivery cancelled',
  failed: 'Delivery attempt failed',
}

export const ADMIN_STATUS_LABEL: Record<DeliveryStatus, string> = {
  created: 'Created (scanned & measured)',
  offered: 'Offered to drivers',
  claimed: 'Claimed by driver',
  arrived: 'Driver at warehouse',
  picked_up: 'Picked up (scan confirmed)',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  exception: 'Exception — needs attention',
  returned: 'Returned to warehouse',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

/** Event types beyond plain status changes, stored in delivery_events. */
export const EVENT_TYPES = [
  ...DELIVERY_STATUSES,
  'exception_reported',
  'reassigned',
  'note',
  'offer_declined',
] as const

export type DeliveryEventType = (typeof EVENT_TYPES)[number]

export const EVENT_LABEL: Record<string, string> = {
  created: 'Package scanned & measured at warehouse',
  offered: 'Delivery offer sent to eligible drivers',
  claimed: 'Driver claimed the delivery',
  arrived: 'Driver arrived at warehouse',
  picked_up: 'Package handed off — pickup scan confirmed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  exception: 'Delivery exception',
  returned: 'Returned to warehouse',
  cancelled: 'Delivery cancelled',
  failed: 'Delivery attempt failed',
  exception_reported: 'Exception reported',
  reassigned: 'Delivery reassigned',
  note: 'Note added',
  offer_declined: 'Driver declined the offer',
}
