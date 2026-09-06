/**
 * Company facts that appear across the legal, pricing, and contact pages.
 * Single source of truth so the support address, governing-law state, and
 * "last updated" date cannot drift between pages, and so a bracketed
 * placeholder can be swapped for the real value in exactly one place.
 *
 * Values still wrapped in square brackets are placeholders David has yet to
 * fill in; `isPlaceholder` lets the pages render them visibly as such.
 */

/** State whose law governs the Terms of Service. Placeholder until confirmed. */
export const GOVERNING_LAW_STATE = '[STATE]'

/** Postal address shown on the contact page. Placeholder until confirmed. */
export const MAILING_ADDRESS = '[MAILING ADDRESS]'

/** Where every support, legal, and privacy request is sent. */
export const SUPPORT_EMAIL = 'support@imaginethisauction.com'

/**
 * ISO date the legal pages were last revised. Also stored on each new account
 * as `terms_version` in the signup metadata so we know which text was accepted.
 */
export const LEGAL_LAST_UPDATED = '2026-09-04'

/** The same date as people read it. */
export const LEGAL_LAST_UPDATED_LABEL = 'September 4, 2026'

/** True while a value is still a bracketed placeholder such as "[STATE]". */
export function isPlaceholder(value: string): boolean {
  return /^\[[^\]]+\]$/.test(value.trim())
}
