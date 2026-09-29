import { expect, test } from '@playwright/test'

import { escapeHtml, renderEmail, safeUrl } from '../../lib/email/layout'
import { notificationEmail } from '../../lib/email/templates'

/**
 * Notification titles and messages are written by database functions and by
 * admin announcements, and lot titles reach them verbatim. Email clients render
 * HTML, so anything that reaches a template unescaped is an injection into a
 * message our own domain signed. These cover the escaping, the link checking,
 * and the parts of the shell that clients depend on.
 */

test.describe('escapeHtml', () => {
  test('neutralises every character that can break out of markup', () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    )
    expect(escapeHtml(`it's & so`)).toBe('it&#39;s &amp; so')
  })

  test('escapes the ampersand first, so entities are not double-built', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  test('leaves ordinary copy alone', () => {
    expect(escapeHtml('Danish Teak Sideboard, circa 1962')).toBe('Danish Teak Sideboard, circa 1962')
  })
})

test.describe('safeUrl', () => {
  test('keeps http and https', () => {
    expect(safeUrl('https://imaginethisauction.com/lots/1')).toBe('https://imaginethisauction.com/lots/1')
    expect(safeUrl('http://localhost:3000/dashboard')).toBe('http://localhost:3000/dashboard')
  })

  test('refuses javascript: and data: rather than passing them to a client', () => {
    expect(safeUrl('javascript:alert(1)')).not.toContain('javascript')
    expect(safeUrl('data:text/html;base64,PHNjcmlwdD4=')).not.toContain('data:')
  })

  test('resolves a bare path against the site', () => {
    expect(safeUrl('/invoices')).toMatch(/\/invoices$/)
  })
})

test.describe('renderEmail', () => {
  test('escapes body copy instead of rendering it as markup', () => {
    const { html } = renderEmail({
      preheader: 'p',
      heading: '<img src=x onerror=alert(1)>',
      body: ['Outbid on <b>Lot 4</b>'],
    })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>Lot 4</b>')
    expect(html).toContain('&lt;b&gt;Lot 4&lt;/b&gt;')
  })

  test('carries the pieces email clients need', () => {
    const { html } = renderEmail({
      preheader: 'Your sign-in link',
      heading: 'Sign in',
      body: ['Body'],
      action: { label: 'Go', url: 'https://imaginethisauction.com/x' },
    })
    // A preheader, or the client shows the first words of the body instead.
    expect(html).toContain('Your sign-in link')
    // Tables and inline styles, because Outlook has no flexbox and Gmail drops <style>.
    expect(html).toContain('role="presentation"')
    expect(html).not.toMatch(/<style[\s>]/)
    // The VML fallback, or the button loses its fill in Outlook.
    expect(html).toContain('v:roundrect')
    expect(html).toContain('600')
  })

  test('renders a code block only when a code is given', () => {
    const withCode = renderEmail({ preheader: 'p', heading: 'h', body: ['b'], code: '123456' })
    expect(withCode.html).toContain('123456')
    expect(withCode.text).toContain('123456')

    const without = renderEmail({ preheader: 'p', heading: 'h', body: ['b'] })
    expect(without.html).not.toContain('letter-spacing: 0.18em')
  })

  test('always produces a text alternative that keeps the link', () => {
    const { text } = renderEmail({
      preheader: 'p',
      heading: 'Reset your password',
      body: ['Someone asked to reset it.'],
      action: { label: 'Set a new password', url: 'https://imaginethisauction.com/reset' },
    })
    expect(text).toContain('Reset your password')
    expect(text).toContain('https://imaginethisauction.com/reset')
  })
})

test.describe('notificationEmail', () => {
  test('routes each notification type to its own destination', () => {
    expect(notificationEmail({ title: 't', message: 'm', type: 'outbid' }).html).toContain('/dashboard')
    expect(notificationEmail({ title: 't', message: 'm', type: 'delivery_update' }).html).toContain('/invoices')
    expect(notificationEmail({ title: 't', message: 'm', type: 'delivery_offer' }).html).toContain('/driver')
  })

  test('an unknown type still gets a working call to action', () => {
    const email = notificationEmail({ title: 't', message: 'm', type: 'something_new' })
    expect(email.html).toContain('/dashboard')
    expect(email.subject).toBe('t')
  })

  test('a null type does not throw', () => {
    expect(() => notificationEmail({ title: 't', message: 'm', type: null })).not.toThrow()
  })

  test('carries the unsubscribe route every notification email needs', () => {
    const email = notificationEmail({ title: 't', message: 'm', type: 'outbid' })
    expect(email.html).toContain('/settings/notifications')
    expect(email.text).toContain('/settings/notifications')
  })
})
