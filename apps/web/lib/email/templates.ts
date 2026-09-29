/**
 * Every email the application itself sends, built on the shared shell in
 * ./layout. Supabase's own auth emails (confirm signup, reset password, magic
 * link, email change) are not sent from here — they come out of the auth
 * service, and their branded HTML lives in supabase/auth-emails/ for the
 * project's Auth settings. The two sets are kept visually identical on purpose;
 * change one and change the other.
 */

import { renderEmail, siteUrl, type RenderedEmail } from './layout'

export interface NotificationEmailInput {
  title: string
  message: string
  /** notifications.type; decides which call to action the email carries. */
  type: string | null
}

interface Cta {
  label: string
  path: string
  /** Sentence under the button, when the notification type warrants one. */
  footnote?: string
}

/**
 * Where each notification type should land the reader. Anything unrecognised
 * goes to the dashboard, which is always a safe destination.
 */
const CTA_BY_TYPE: Record<string, Cta> = {
  outbid: {
    label: 'Place another bid',
    path: '/dashboard',
    footnote: 'Bidding closes at the time shown on the lot. Nothing is charged until you win.',
  },
  watchlist_ending: {
    label: 'View your watchlist',
    path: '/dashboard',
    footnote: 'Nothing is charged until you win.',
  },
  announcement: { label: 'Open Imagine This Auction', path: '/' },
  delivery_offer: { label: 'View delivery offers', path: '/driver' },
  delivery_update: { label: 'Track your package', path: '/invoices' },
}

const DEFAULT_CTA: Cta = { label: 'Open Imagine This Auction', path: '/dashboard' }

/**
 * One notification, as an email. `title` and `message` come from rows written
 * by database functions and by admin announcements, so both are treated as
 * untrusted text and escaped by the layout.
 */
export function notificationEmail(notification: NotificationEmailInput): RenderedEmail & { subject: string } {
  const cta = CTA_BY_TYPE[notification.type ?? ''] ?? DEFAULT_CTA
  const site = siteUrl()

  const rendered = renderEmail({
    preheader: notification.message.slice(0, 140),
    heading: notification.title,
    body: [notification.message],
    action: { label: cta.label, url: `${site}${cta.path}` },
    footnote: cta.footnote,
    footerLinks: [
      { label: 'Notification settings', url: `${site}/settings/notifications` },
      { label: 'Help', url: `${site}/contact` },
      { label: 'Terms', url: `${site}/terms` },
      { label: 'Privacy', url: `${site}/privacy` },
    ],
  })

  return { subject: notification.title, ...rendered }
}
