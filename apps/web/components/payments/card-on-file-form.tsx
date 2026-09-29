'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Script from 'next/script'
import { AlertTriangle, CreditCard, Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WorkingBar } from '@/components/payments/working-bar'
import type { PaymentMethodPublic } from '@/lib/payments/methods'
import { cn } from '@/lib/utils'

/**
 * Collect.js (NMI's hosted-fields library) as this component uses it.
 * Shapes follow https://docs.nmi.com/docs/collectjs: the inline variant mounts
 * an iframe per field into a selector we own, `startPaymentRequest()` asks it
 * to tokenize, and the configured `callback` receives `{ token, card }`.
 * Only the fields read here are typed.
 */
interface CollectJsCard {
  /** Masked PAN, e.g. "411111******1111". */
  number?: string
  bin?: string
  /** MMYY */
  exp?: string
  hash?: string
  /** Lower-case brand, e.g. "visa". */
  type?: string
}

interface CollectJsResponse {
  token: string
  tokenType?: string
  card?: CollectJsCard
}

interface CollectJsFieldConfig {
  selector: string
  title?: string
  placeholder?: string
}

interface CollectJsConfig {
  variant: 'inline'
  fields: {
    ccnumber: CollectJsFieldConfig
    ccexp: CollectJsFieldConfig
    cvv: CollectJsFieldConfig
  }
  callback: (response: CollectJsResponse) => void
  validationCallback?: (field: string, status: boolean, message: string) => void
  fieldsAvailableCallback?: () => void
  timeoutDuration?: number
  timeoutCallback?: () => void
  styleSniffer?: boolean
  customCss?: Record<string, string>
  focusCss?: Record<string, string>
  invalidCss?: Record<string, string>
  validCss?: Record<string, string>
  placeholderCss?: Record<string, string>
}

interface CollectJsApi {
  configure: (config: CollectJsConfig) => void
  startPaymentRequest: (event?: unknown) => void
}

declare global {
  interface Window {
    CollectJS?: CollectJsApi
  }
}

/**
 * Collect.js has to come from the same gateway instance that issued the
 * tokenization key. PaymentCloud's NMI tenant is paymentcloud.transactiongateway.com,
 * so a token minted by secure.nmi.com would not validate against our merchant.
 */
export const COLLECT_JS_SRC =
  process.env.NEXT_PUBLIC_NMI_COLLECT_JS_URL?.trim() || 'https://secure.nmi.com/token/Collect.js'

/** Container ids the hosted fields mount into. Stable so a re-render never detaches an iframe. */
const FIELD_IDS = { ccnumber: 'cof-ccnumber', ccexp: 'cof-ccexp', cvv: 'cof-cvv' } as const
type FieldKey = keyof typeof FIELD_IDS

const FIELD_LABELS: Record<FieldKey, string> = {
  ccnumber: 'Card number',
  ccexp: 'Expiry',
  cvv: 'Security code',
}

/** Matches components/ui/input so the hosted iframes look like the name inputs beside them. */
const HOSTED_FIELD_CSS: Record<string, string> = {
  'font-family': 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  'font-size': '14px',
  color: '#0f172a',
  'background-color': '#ffffff',
  border: '1px solid #e2e8f0',
  'border-radius': '6px',
  padding: '8px 12px',
  height: '40px',
}

/** If Collect.js neither tokenizes nor reports a field error, give the bidder the button back. */
const TOKENIZE_SAFETY_MS = 25_000

type ScriptState = 'loading' | 'ready' | 'error'
type SubmitState = 'idle' | 'tokenizing' | 'saving'
type FieldStatus = { valid: boolean | null; message: string }

export interface CardOnFileFormProps {
  /** Public Collect.js key. Defaults to NEXT_PUBLIC_NMI_TOKENIZATION_KEY; unset renders a notice instead of the form. */
  tokenizationKey?: string | null
  defaultFirstName?: string | null
  defaultLastName?: string | null
  /** Called with the saved, verified card. */
  onSaved: (method: PaymentMethodPublic) => void
  /** Shown when the bidder is replacing an existing card. */
  onCancel?: () => void
  className?: string
}

/**
 * Card entry with NMI Collect.js hosted fields. The card number, expiry, and
 * CVV live inside NMI iframes; this component only ever sees the one-time
 * token, which it posts to /api/payments/methods together with the
 * cardholder name. Nothing that waits shows a spinner: the themed WorkingBar
 * marks tokenization and verification.
 */
export function CardOnFileForm({
  tokenizationKey = process.env.NEXT_PUBLIC_NMI_TOKENIZATION_KEY ?? null,
  defaultFirstName,
  defaultLastName,
  onSaved,
  onCancel,
  className,
}: CardOnFileFormProps) {
  const key = tokenizationKey?.trim() || null

  const [scriptState, setScriptState] = useState<ScriptState>('loading')
  const [fieldsReady, setFieldsReady] = useState(false)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [firstName, setFirstName] = useState(defaultFirstName ?? '')
  const [lastName, setLastName] = useState(defaultLastName ?? '')
  const [fieldStatus, setFieldStatus] = useState<Record<FieldKey, FieldStatus>>({
    ccnumber: { valid: null, message: '' },
    ccexp: { valid: null, message: '' },
    cvv: { valid: null, message: '' },
  })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const configuredRef = useRef(false)
  const submitStateRef = useRef<SubmitState>('idle')
  const namesRef = useRef({ firstName, lastName })
  // Collect.js holds on to the callback it was configured with, so the
  // callback reads the latest onSaved through a ref instead of a closure.
  const onSavedRef = useRef(onSaved)
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    submitStateRef.current = submitState
  }, [submitState])

  useEffect(() => {
    namesRef.current = { firstName, lastName }
  }, [firstName, lastName])

  useEffect(() => {
    onSavedRef.current = onSaved
  }, [onSaved])

  useEffect(
    () => () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
    },
    []
  )

  const clearSafetyTimer = () => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current)
      safetyTimerRef.current = null
    }
  }

  const saveToken = useCallback(
    async (token: string) => {
      setSubmitState('saving')
      try {
        const res = await fetch('/api/payments/methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentToken: token,
            firstName: namesRef.current.firstName.trim(),
            lastName: namesRef.current.lastName.trim(),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as Partial<PaymentMethodPublic> & { error?: string }

        if (!res.ok || !data.verified) {
          setErrorMessage(data.error ?? 'Your card could not be saved. Try again.')
          return
        }

        onSavedRef.current({
          brand: data.brand ?? null,
          last4: data.last4 ?? null,
          expMonth: data.expMonth ?? null,
          expYear: data.expYear ?? null,
          verified: true,
          verifiedAt: data.verifiedAt ?? null,
        })
      } catch {
        setErrorMessage('Could not reach the server. Check your connection and try again.')
      } finally {
        setSubmitState('idle')
      }
    },
    []
  )

  /**
   * Runs once the script is on the page. `onReady` (not `onLoad`) so a
   * re-mount after Remove -> Replace configures the fields again even though
   * the script itself is already loaded.
   */
  const configureCollect = useCallback(() => {
    if (configuredRef.current) return
    const collect = window.CollectJS
    if (!collect) {
      setScriptState('error')
      return
    }
    configuredRef.current = true
    setScriptState('ready')

    collect.configure({
      variant: 'inline',
      styleSniffer: false,
      customCss: HOSTED_FIELD_CSS,
      focusCss: { border: '1px solid #6366f1', 'box-shadow': '0 0 0 2px rgba(99, 102, 241, 0.2)' },
      invalidCss: { border: '1px solid #ef4444' },
      validCss: { border: '1px solid #e2e8f0' },
      placeholderCss: { color: '#94a3b8' },
      fields: {
        ccnumber: { selector: `#${FIELD_IDS.ccnumber}`, title: FIELD_LABELS.ccnumber, placeholder: '0000 0000 0000 0000' },
        ccexp: { selector: `#${FIELD_IDS.ccexp}`, title: FIELD_LABELS.ccexp, placeholder: 'MM / YY' },
        cvv: { selector: `#${FIELD_IDS.cvv}`, title: FIELD_LABELS.cvv, placeholder: 'CVC' },
      },
      fieldsAvailableCallback: () => setFieldsReady(true),
      validationCallback: (field, status, message) => {
        if (field !== 'ccnumber' && field !== 'ccexp' && field !== 'cvv') return
        setFieldStatus((prev) => ({ ...prev, [field]: { valid: status, message: status ? '' : message } }))
        // A failed validation during tokenization means no token is coming.
        if (!status && submitStateRef.current === 'tokenizing') {
          clearSafetyTimer()
          setSubmitState('idle')
          setErrorMessage(`${FIELD_LABELS[field]}: ${message || 'check this field'}`)
        }
      },
      timeoutDuration: 20_000,
      timeoutCallback: () => {
        clearSafetyTimer()
        setSubmitState('idle')
        setErrorMessage('Card entry timed out. Check the card details and try again.')
      },
      callback: (response) => {
        clearSafetyTimer()
        if (!response?.token) {
          setSubmitState('idle')
          setErrorMessage('No card token was returned. Try again.')
          return
        }
        void saveToken(response.token)
      },
    })
  }, [saveToken])

  const namesFilled = firstName.trim().length > 0 && lastName.trim().length > 0
  const busy = submitState !== 'idle'
  const canSubmit = scriptState === 'ready' && fieldsReady && namesFilled && !busy

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || !window.CollectJS) return
    setErrorMessage(null)
    setSubmitState('tokenizing')
    safetyTimerRef.current = setTimeout(() => {
      if (submitStateRef.current === 'tokenizing') {
        setSubmitState('idle')
        setErrorMessage('Card entry did not respond. Check the card details and try again.')
      }
    }, TOKENIZE_SAFETY_MS)
    window.CollectJS.startPaymentRequest()
  }

  if (!key) {
    return (
      <div
        role="status"
        className={cn('rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950', className)}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <p className="font-medium">Card entry is not configured yet.</p>
            <p className="mt-1 text-amber-900/80">
              The payment processor&apos;s public key has not been added to this site. You can browse and watch lots;
              bidding opens once cards can be saved.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const workingLabel =
    submitState === 'tokenizing' ? 'Securing your card details…' : 'Checking your card with the bank…'

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-5', className)} noValidate>
      <Script
        src={COLLECT_JS_SRC}
        data-tokenization-key={key}
        strategy="afterInteractive"
        onReady={configureCollect}
        onError={() => setScriptState('error')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cof-first-name">First name</Label>
          <Input
            id="cof-first-name"
            name="firstName"
            autoComplete="cc-given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cof-last-name">Last name</Label>
          <Input
            id="cof-last-name"
            name="lastName"
            autoComplete="cc-family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={busy}
            required
          />
        </div>
      </div>

      {/* The inputs live inside NMI iframes, so a <label htmlFor> has nothing
          to point at; each container is a named group instead. */}
      <div className="space-y-2">
        <FieldCaption id={`${FIELD_IDS.ccnumber}-label`}>{FIELD_LABELS.ccnumber}</FieldCaption>
        <HostedField
          id={FIELD_IDS.ccnumber}
          labelId={`${FIELD_IDS.ccnumber}-label`}
          status={fieldStatus.ccnumber}
          ready={fieldsReady}
        />
      </div>

      <div className="grid gap-4 grid-cols-2">
        <div className="space-y-2">
          <FieldCaption id={`${FIELD_IDS.ccexp}-label`}>{FIELD_LABELS.ccexp}</FieldCaption>
          <HostedField id={FIELD_IDS.ccexp} labelId={`${FIELD_IDS.ccexp}-label`} status={fieldStatus.ccexp} ready={fieldsReady} />
        </div>
        <div className="space-y-2">
          <FieldCaption id={`${FIELD_IDS.cvv}-label`}>{FIELD_LABELS.cvv}</FieldCaption>
          <HostedField id={FIELD_IDS.cvv} labelId={`${FIELD_IDS.cvv}-label`} status={fieldStatus.cvv} ready={fieldsReady} />
        </div>
      </div>

      {scriptState === 'loading' && !fieldsReady && <WorkingBar label="Loading secure card entry…" />}
      {scriptState === 'error' && (
        <p role="alert" className="text-sm text-red-700">
          Secure card entry could not be loaded. Reload the page to try again.
        </p>
      )}

      {busy && <WorkingBar label={workingLabel} />}

      {errorMessage && !busy && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Card details go straight to our payment processor. We store only the brand and last four digits.
        </p>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={!canSubmit}>
            <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
            Save card
          </Button>
        </div>
      </div>
    </form>
  )
}

/** Visible caption for a hosted field; the group below is labelled by it. */
function FieldCaption({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} className="block text-sm font-medium leading-none">
      {children}
    </span>
  )
}

function HostedField({
  id,
  labelId,
  status,
  ready,
}: {
  id: string
  labelId: string
  status: FieldStatus
  ready: boolean
}) {
  const invalid = status.valid === false
  const showError = invalid && status.message.length > 0
  const errorId = `${id}-error`
  return (
    <div>
      <div
        id={id}
        role="group"
        aria-labelledby={labelId}
        aria-describedby={showError ? errorId : undefined}
        className={cn(
          'min-h-[42px] rounded-md',
          !ready && 'animate-pulse bg-slate-100',
          invalid && 'ring-1 ring-red-400 ring-offset-1'
        )}
      />
      {showError && (
        <p id={errorId} className="mt-1 text-xs text-red-700">
          {status.message}
        </p>
      )}
    </div>
  )
}
