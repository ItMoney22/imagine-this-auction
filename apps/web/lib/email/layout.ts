/**
 * The one branded shell every email we send goes through.
 *
 * Email is not the web. The rules this file follows, and why:
 *   * Tables, not flexbox or grid. Outlook renders through Word's HTML engine
 *     and supports neither.
 *   * Every style inline. Gmail strips <style> blocks in some contexts and
 *     removes classes entirely in others.
 *   * A solid header colour, not the site's purple-to-indigo gradient, because
 *     CSS gradients do not render in Outlook and would fall back to nothing.
 *   * A text wordmark, not the logo file. The only mark in the repo is .webp,
 *     which Outlook 2016-2019 cannot display, and images are blocked by default
 *     in most clients anyway. Text always arrives.
 *   * 600px, the width every client handles without horizontal scroll.
 *
 * Everything interpolated is escaped and every link is checked, because these
 * bodies carry user-controlled strings (lot titles, auction names, a bidder's
 * own display name) straight into HTML.
 */

/** Display name. Deliberately not NEXT_PUBLIC_APP_NAME, which is the squashed "ImagineThisAuction". */
export const BRAND_NAME = 'Imagine This Auction'

/**
 * Brand palette, matched to the shipped site rather than to DESIGN.md, which
 * still describes an unbuilt identity. Solid values only; no gradients.
 */
export const BRAND = {
  ink: '#0f172a',
  body: '#475569',
  muted: '#64748b',
  rule: '#e2e8f0',
  page: '#f1f5f9',
  surface: '#ffffff',
  accent: '#4f46e5',
  accentInk: '#4338ca',
} as const

/**
 * Same resolution order the notification cron already used, including the
 * trim(): the Vercel-stored NEXT_PUBLIC_APP_URL carries a trailing newline, and
 * a newline inside an href breaks the link in several clients.
 */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://imaginethisauction.com'
  )
    .trim()
    .replace(/\/+$/, '')
}

/** The five characters that can break out of HTML text or an attribute value. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Only http and https reach an href. A `javascript:` or `data:` URL in a link
 * we build from stored data would be a live phishing vector in the clients that
 * honour it, so anything else collapses to the site root.
 */
export function safeUrl(url: string): string {
  try {
    const parsed = new URL(url, siteUrl())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return siteUrl()
    return parsed.toString()
  } catch {
    return siteUrl()
  }
}

export interface EmailAction {
  label: string
  url: string
}

export interface EmailFooterLink {
  label: string
  url: string
}

export interface EmailLayoutInput {
  /** The grey line clients show next to the subject. Never repeat the subject here. */
  preheader: string
  heading: string
  /** Body copy as plain-text paragraphs. Escaped here; do not pass HTML. */
  body: string[]
  action?: EmailAction
  /** A short verification code, shown as a block instead of a link. */
  code?: string
  /** Small print under the button, e.g. link expiry or "you can ignore this". */
  footnote?: string
  footerLinks?: EmailFooterLink[]
}

export interface RenderedEmail {
  html: string
  text: string
}

const DEFAULT_FOOTER_LINKS: EmailFooterLink[] = [
  { label: 'Help', url: '/contact' },
  { label: 'Terms', url: '/terms' },
  { label: 'Privacy', url: '/privacy' },
]

/**
 * A button that survives Outlook. The VML fallback draws the filled rectangle
 * that Word's engine will not paint from CSS; every other client ignores the
 * conditional comment and uses the anchor.
 */
function button(action: EmailAction): string {
  const url = safeUrl(action.url)
  const label = escapeHtml(action.label)
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0;">
                <tr>
                  <td align="center" bgcolor="${BRAND.accent}" style="border-radius: 10px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="20%" stroke="f" fillcolor="${BRAND.accent}">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a href="${url}" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 10px;">${label}</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>`
}

/**
 * A one-time code, set large and spaced so it can be read off a phone and typed
 * without transcription errors. Monospace with an explicit fallback stack:
 * `monospace` alone is rendered at a smaller size by several clients.
 */
function codeBlock(code: string, font: string): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center" bgcolor="${BRAND.page}" style="background-color: ${BRAND.page}; border: 1px solid ${BRAND.rule}; border-radius: 12px; padding: 20px 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace; font-size: 30px; font-weight: 700; letter-spacing: 0.18em; color: ${BRAND.ink};">${escapeHtml(code)}</td>
                </tr>
              </table>`
}

/**
 * Render one email. Returns both parts: sending multipart with a real text
 * alternative measurably helps deliverability, and some corporate gateways
 * strip HTML outright.
 */
export function renderEmail(input: EmailLayoutInput): RenderedEmail {
  const site = siteUrl()
  const links = input.footerLinks ?? DEFAULT_FOOTER_LINKS
  const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif`

  const paragraphs = input.body
    .map(
      (text) =>
        `              <p style="margin: 0 0 16px 0; font-family: ${font}; font-size: 16px; line-height: 1.6; color: ${BRAND.body};">${escapeHtml(text)}</p>`
    )
    .join('\n')

  const footerLinkHtml = links
    .map(
      (link) =>
        `<a href="${safeUrl(link.url)}" style="color: ${BRAND.muted}; text-decoration: underline;">${escapeHtml(link.label)}</a>`
    )
    .join('<span style="color: #cbd5e1;"> &nbsp;·&nbsp; </span>')

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.page};">
  <span style="display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; overflow: hidden; mso-hide: all;">${escapeHtml(input.preheader)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${BRAND.page};">
    <tr>
      <td align="center" style="padding: 32px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width: 600px; max-width: 100%; background-color: ${BRAND.surface}; border: 1px solid ${BRAND.rule}; border-radius: 16px; overflow: hidden;">
          <tr>
            <td align="center" bgcolor="${BRAND.accent}" style="background-color: ${BRAND.accent}; padding: 24px 24px;">
              <a href="${site}" style="font-family: ${font}; font-size: 19px; font-weight: 700; letter-spacing: 0.02em; color: #ffffff; text-decoration: none;">${escapeHtml(BRAND_NAME)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 8px 32px;">
              <h1 style="margin: 0 0 18px 0; font-family: ${font}; font-size: 24px; line-height: 1.25; font-weight: 700; color: ${BRAND.ink};">${escapeHtml(input.heading)}</h1>
${paragraphs}${input.code ? codeBlock(input.code, font) : ''}${input.action ? button(input.action) : ''}
${
  input.footnote
    ? `              <p style="margin: 0 0 8px 0; font-family: ${font}; font-size: 13px; line-height: 1.6; color: ${BRAND.muted};">${escapeHtml(input.footnote)}</p>`
    : ''
}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px 28px 32px;">
              <div style="border-top: 1px solid ${BRAND.rule}; padding-top: 18px; font-family: ${font}; font-size: 13px; line-height: 1.6; color: ${BRAND.muted};">
                <p style="margin: 0 0 6px 0;">${footerLinkHtml}</p>
                <p style="margin: 0;">${escapeHtml(BRAND_NAME)} · Online auctions for real auction houses</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const textParts = [
    input.heading,
    '',
    ...input.body,
    ...(input.code ? ['', input.code] : []),
    ...(input.action ? ['', `${input.action.label}: ${safeUrl(input.action.url)}`] : []),
    ...(input.footnote ? ['', input.footnote] : []),
    '',
    '—',
    `${BRAND_NAME}`,
    ...links.map((link) => `${link.label}: ${safeUrl(link.url)}`),
  ]

  return { html, text: textParts.join('\n') }
}
