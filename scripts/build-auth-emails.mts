/**
 * Generate the branded Supabase Auth email templates.
 *
 * Supabase sends the auth emails itself (confirm signup, magic link, reset
 * password, change email, invite, reauthentication), so their HTML lives in the
 * project's Auth settings rather than in our code. That is a standing drift
 * risk: the day someone restyles our application email, the auth email keeps
 * the old look and a bidder gets two different-looking messages from us.
 *
 * So these are generated from the same `renderEmail` shell the application uses
 * (apps/web/lib/email/layout.ts) rather than hand-written. Change the shell,
 * re-run this, paste the output back into Auth > Email Templates.
 *
 * Supabase's own placeholders are Go template expressions, which cannot survive
 * HTML-escaping or URL parsing. Each one therefore goes through the renderer as
 * an inert sentinel and is swapped for the real expression afterwards.
 *
 *   node --experimental-strip-types scripts/build-auth-emails.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderEmail, BRAND_NAME } from '../apps/web/lib/email/layout.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'apps', 'web', 'supabase', 'auth-emails')

/** Sentinels: parse as ordinary values, contain nothing escaping touches. */
const SENTINEL = {
  confirmationUrl: 'https://link.invalid/confirm',
  siteUrl: 'https://link.invalid/site',
  email: 'SENTINELEMAIL',
  newEmail: 'SENTINELNEWEMAIL',
  token: 'SENTINELTOKEN',
} as const

/** Sentinel -> Supabase template expression. Applied to the HTML and the text part. */
const SUBSTITUTIONS: ReadonlyArray<[string, string]> = [
  [SENTINEL.confirmationUrl, '{{ .ConfirmationURL }}'],
  [SENTINEL.siteUrl, '{{ .SiteURL }}'],
  [SENTINEL.newEmail, '{{ .NewEmail }}'],
  [SENTINEL.email, '{{ .Email }}'],
  [SENTINEL.token, '{{ .Token }}'],
]

function substitute(rendered: string): string {
  let out = rendered
  for (const [sentinel, expression] of SUBSTITUTIONS) {
    out = out.split(sentinel).join(expression)
  }
  return out
}

interface AuthTemplate {
  /** Output file name, and the name of the tab it belongs in. */
  file: string
  /** The Supabase Auth template this replaces. */
  slot: string
  /** Subject line to paste into the same tab. */
  subject: string
  render: () => { html: string; text: string }
}

const TEMPLATES: AuthTemplate[] = [
  {
    file: 'confirm-signup.html',
    slot: 'Confirm signup',
    subject: `Confirm your email · ${BRAND_NAME}`,
    render: () =>
      renderEmail({
        preheader: 'One click and your bidding account is ready.',
        heading: 'Confirm your email address',
        body: [
          `Welcome to ${BRAND_NAME}. Confirm ${SENTINEL.email} and your account is ready to use.`,
          'Once you are in, add a card to your account and you can bid on any live lot. Nothing is charged unless you win.',
        ],
        action: { label: 'Confirm my email', url: SENTINEL.confirmationUrl },
        footnote: 'This link expires in 24 hours. If you did not create an account, you can ignore this email and nothing will happen.',
      }),
  },
  {
    file: 'magic-link.html',
    slot: 'Magic Link',
    subject: `Your sign-in link · ${BRAND_NAME}`,
    render: () =>
      renderEmail({
        preheader: 'Your one-time sign-in link, good for one hour.',
        heading: 'Your sign-in link',
        body: [`Use the link below to sign in to ${BRAND_NAME} as ${SENTINEL.email}. No password needed.`],
        action: { label: 'Sign me in', url: SENTINEL.confirmationUrl },
        footnote: 'This link works once and expires in one hour. If you did not ask to sign in, ignore this email and your account stays as it is.',
      }),
  },
  {
    file: 'reset-password.html',
    slot: 'Reset Password',
    subject: `Reset your password · ${BRAND_NAME}`,
    render: () =>
      renderEmail({
        preheader: 'Set a new password for your account.',
        heading: 'Reset your password',
        body: [
          `Someone asked to reset the password for ${SENTINEL.email}. If that was you, set a new one now.`,
        ],
        action: { label: 'Set a new password', url: SENTINEL.confirmationUrl },
        footnote: 'This link expires in one hour. If you did not ask for a reset, ignore this email — your current password keeps working and no one can use this link to see it.',
      }),
  },
  {
    file: 'change-email.html',
    slot: 'Change Email Address',
    subject: `Confirm your new email · ${BRAND_NAME}`,
    render: () =>
      renderEmail({
        preheader: 'Confirm the new address on your account.',
        heading: 'Confirm your new email address',
        body: [
          `You asked to change the email on your ${BRAND_NAME} account from ${SENTINEL.email} to ${SENTINEL.newEmail}.`,
          'Confirm below and the new address takes over. Invoices, outbid alerts, and delivery updates all go there from then on.',
        ],
        action: { label: 'Confirm the change', url: SENTINEL.confirmationUrl },
        footnote: 'If you did not ask for this, ignore this email and contact us — the change will not go through without this confirmation.',
      }),
  },
  {
    file: 'invite.html',
    slot: 'Invite user',
    subject: `You have been invited · ${BRAND_NAME}`,
    render: () =>
      renderEmail({
        preheader: 'Accept your invitation and set a password.',
        heading: `You have been invited to ${BRAND_NAME}`,
        body: [
          `An invitation has been sent to ${SENTINEL.email}. Accept it to set a password and get into your account.`,
        ],
        action: { label: 'Accept the invitation', url: SENTINEL.confirmationUrl },
        footnote: 'If you were not expecting this invitation, you can ignore this email.',
      }),
  },
  {
    file: 'reauthentication.html',
    slot: 'Reauthentication',
    subject: `Your verification code · ${BRAND_NAME}`,
    render: () =>
      renderEmail({
        preheader: 'Your one-time verification code.',
        heading: 'Your verification code',
        body: ['Enter this code to confirm it is you. It is good for a few minutes and can be used once.'],
        code: SENTINEL.token,
        footnote: 'If you did not ask for this code, ignore this email and consider changing your password.',
      }),
  },
]

mkdirSync(OUT_DIR, { recursive: true })

const index: string[] = [
  '# Supabase Auth email templates',
  '',
  'Generated — do not hand-edit. Change `apps/web/lib/email/layout.ts` or',
  '`scripts/build-auth-emails.mts`, then re-run:',
  '',
  '```',
  'node --experimental-strip-types scripts/build-auth-emails.mts',
  '```',
  '',
  'Paste each file into the Supabase dashboard under **Authentication → Emails**,',
  'into the tab named below, with the subject given. Supabase sends these itself,',
  'so they must also be reachable from a sender we own — see SMTP below.',
  '',
  '| File | Template tab | Subject |',
  '| --- | --- | --- |',
]

for (const template of TEMPLATES) {
  const { html } = template.render()
  const output = substitute(html)

  // A placeholder that never got substituted means a sentinel escaped its own
  // renderer, which would ship a dead link. Fail loudly instead.
  if (output.includes('link.invalid') || output.includes('SENTINEL')) {
    throw new Error(`${template.file}: a sentinel survived substitution`)
  }

  writeFileSync(path.join(OUT_DIR, template.file), output, 'utf8')
  index.push(`| \`${template.file}\` | ${template.slot} | ${template.subject} |`)
  console.log(`  wrote ${template.file}  (${template.slot})`)
}

index.push(
  '',
  '## SMTP',
  '',
  'Supabase\'s built-in sender is rate-limited and stamps its own address on the',
  'mail, which is why signup confirmations arrived unbranded. Point the project at',
  'Resend instead, under **Project Settings → Authentication → SMTP Settings**:',
  '',
  '| Field | Value |',
  '| --- | --- |',
  '| Host | `smtp.resend.com` |',
  '| Port | `587` |',
  '| Username | `resend` |',
  '| Password | the `RESEND_API_KEY` already in `apps/web/.env.local` |',
  '| Sender email | `noreply@imaginethisauction.com` |',
  '| Sender name | `Imagine This Auction` |',
  '',
  'The `imaginethisauction.com` domain is already verified in Resend with sending',
  'enabled, so no DNS work is needed.',
  ''
)

writeFileSync(path.join(OUT_DIR, 'README.md'), index.join('\n'), 'utf8')
console.log(`\n  wrote README.md\n  ${TEMPLATES.length} templates in ${path.relative(ROOT, OUT_DIR)}\n`)
