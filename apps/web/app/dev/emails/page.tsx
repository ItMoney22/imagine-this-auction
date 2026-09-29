import { notFound } from 'next/navigation'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { notificationEmail } from '@/lib/email/templates'

/**
 * Every email the product sends, on one page, so a change to the shell can be
 * eyeballed without sending mail to anyone.
 *
 * Development only. In production this is a 404: the page reads from disk and
 * exists purely as a design surface, and a public route that renders arbitrary
 * template files is not something to leave standing on the live site.
 *
 * Each preview is an iframe with `srcDoc`, so the email's own styles are
 * sandboxed away from the site's and what you see is what the client renders.
 */

export const dynamic = 'force-dynamic'

const AUTH_EMAIL_DIR = path.join(process.cwd(), 'supabase', 'auth-emails')

/** The notification types worth eyeballing; one per shape of call to action. */
const NOTIFICATION_SAMPLES = [
  {
    type: 'outbid',
    title: 'You have been outbid on Lot 4',
    message:
      'Nina O. bid $275.00 on Danish Teak Sideboard, circa 1962. The next bid is $300.00 and bidding closes on Tuesday at 7:00pm.',
  },
  {
    type: 'watchlist_ending',
    title: 'Two lots on your watchlist close within the hour',
    message: 'Omega Seamaster De Ville, 1968 and Heriz Wool Carpet both close at 7:00pm tonight.',
  },
  {
    type: 'delivery_update',
    title: 'Your delivery is on its way',
    message: 'Marcus picked up Lot 7 and is about 20 minutes out. You can follow it on the tracking page.',
  },
]

interface Preview {
  label: string
  note: string
  html: string
}

/**
 * Supabase templates carry Go expressions like `{{ .ConfirmationURL }}`, which
 * render as literal text. Filling them with sample values shows the email the
 * way a recipient sees it.
 */
function fillSupabasePlaceholders(html: string): string {
  return html
    .replace(/\{\{ \.ConfirmationURL \}\}/g, 'https://imaginethisauction.com/auth/callback?token=sample')
    .replace(/\{\{ \.SiteURL \}\}/g, 'https://imaginethisauction.com')
    .replace(/\{\{ \.Email \}\}/g, 'davidltrinidad@gmail.com')
    .replace(/\{\{ \.NewEmail \}\}/g, 'david@imaginethisauction.com')
    .replace(/\{\{ \.Token \}\}/g, '418 720')
}

async function loadAuthPreviews(): Promise<Preview[]> {
  let files: string[]
  try {
    files = (await readdir(AUTH_EMAIL_DIR)).filter((file) => file.endsWith('.html')).sort()
  } catch {
    return []
  }

  return Promise.all(
    files.map(async (file) => ({
      label: file.replace(/\.html$/, '').replace(/-/g, ' '),
      note: 'Sent by Supabase Auth · paste into Authentication → Emails',
      html: fillSupabasePlaceholders(await readFile(path.join(AUTH_EMAIL_DIR, file), 'utf8')),
    }))
  )
}

export default async function EmailPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  const appPreviews: Preview[] = NOTIFICATION_SAMPLES.map((sample) => ({
    label: `notification · ${sample.type}`,
    note: 'Sent by the app through Resend',
    html: notificationEmail(sample).html,
  }))

  const previews = [...appPreviews, ...(await loadAuthPreviews())]

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-3xl font-bold text-slate-900">Email previews</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Every email the product sends, rendered from the same shell. Development only — this route
          is a 404 in production. Regenerate the auth templates with{' '}
          <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">
            node --experimental-strip-types scripts/build-auth-emails.mts
          </code>
          .
        </p>

        <div className="mt-10 space-y-10">
          {previews.map((preview) => (
            <section key={preview.label}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold capitalize text-slate-900">{preview.label}</h2>
                <p className="text-sm text-slate-500">{preview.note}</p>
              </div>
              <iframe
                title={preview.label}
                srcDoc={preview.html}
                className="h-[620px] w-full rounded-2xl border border-slate-300 bg-white"
              />
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
