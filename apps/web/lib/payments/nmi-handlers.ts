import type { NmiWebhookEvent } from './nmi-types'

/**
 * Registry that routes verified NMI webhook events to handlers by
 * `event_type`. This file only provides the plumbing and logging defaults;
 * Task 4c registers the real handlers (invoice payment status, refunds,
 * chargebacks) at module load of the code that owns those tables.
 *
 * Matching is by exact type first, then by the longest dotted prefix, so
 * `register('chargeback', fn)` receives every `chargeback.*` event while
 * `register('transaction.refund.success', fn)` wins over
 * `register('transaction.refund', fn)` for that one type.
 *
 * Registration happens when the registering module is evaluated. Nothing
 * imports a handler module on its own, so the module that calls
 * `registerNmiHandler` must be imported from `app/api/webhooks/nmi/route.ts`
 * (Task 4c), or the registry on that route stays empty and every event is
 * stored with `handled: false`.
 */

export type NmiEventHandler = (event: NmiWebhookEvent) => void | Promise<void>

export type NmiDispatchResult = { handled: true; handlerKey: string } | { handled: false }

/** Event types ITA cares about. Prefix entries catch every sub-type. */
export const NMI_EVENT_TYPES = {
  saleSuccess: 'transaction.sale.success',
  saleFailure: 'transaction.sale.failure',
  refundSuccess: 'transaction.refund.success',
  voidSuccess: 'transaction.void.success',
  settlementBatchComplete: 'settlement.batch.complete',
  chargeback: 'chargeback',
  dispute: 'dispute',
} as const

function logUnhandled(event: NmiWebhookEvent): void {
  console.info('[nmi] no handler registered for webhook event', {
    eventId: event.event_id,
    eventType: event.event_type,
  })
}

export function createNmiHandlerRegistry(defaultHandler: NmiEventHandler = logUnhandled) {
  const handlers = new Map<string, NmiEventHandler>()

  function resolve(eventType: string): string | undefined {
    let best: string | undefined
    for (const key of handlers.keys()) {
      if (eventType === key || eventType.startsWith(`${key}.`)) {
        if (best === undefined || key.length > best.length) best = key
      }
    }
    return best
  }

  return {
    register(eventType: string, handler: NmiEventHandler): void {
      handlers.set(eventType, handler)
    },

    async dispatch(event: NmiWebhookEvent): Promise<NmiDispatchResult> {
      const key = resolve(event.event_type)
      const handler = key === undefined ? undefined : handlers.get(key)
      if (key === undefined || handler === undefined) {
        await defaultHandler(event)
        return { handled: false }
      }
      await handler(event)
      return { handled: true, handlerKey: key }
    },
  }
}

const registry = createNmiHandlerRegistry()

export const registerNmiHandler = registry.register
export const dispatchNmiEvent = registry.dispatch
