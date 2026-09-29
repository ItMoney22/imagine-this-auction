/**
 * The bidder's own IP address, for the `ipaddress` field on every gateway call.
 *
 * PaymentCloud's risk team set the NMI fraud filter "Daily Attempted
 * Transaction Count for IP" to 5 per day, deny. ITA charges cards server-side,
 * so unless each call carries the bidder's IP, every transaction looks like it
 * came from the same handful of Vercel addresses and the sixth of the day is
 * denied for everyone. We send the real client IP instead of raising the
 * filter, which is also what the gateway wants for AVS-style scoring.
 *
 * Behind Vercel the client IP is the FIRST entry of `x-forwarded-for`; the
 * later entries are proxies. `x-real-ip` is the fallback for local runs and
 * other hosts. Anything that is not a plain IPv4/IPv6 literal is dropped
 * rather than forwarded, because the header is attacker-controlled and NMI
 * rejects the whole transaction on a malformed field.
 */

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const IPV6 = /^[0-9a-f:]{2,45}$/i

export function isIpLiteral(value: string): boolean {
  if (IPV4.test(value)) return true
  return value.includes(':') && IPV6.test(value)
}

/** Normalizes `::ffff:203.0.113.7` to `203.0.113.7`; NMI wants the v4 form. */
function unmap(value: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value)
  return mapped ? mapped[1] : value
}

/** Strips a port and IPv6 brackets: `[2001:db8::1]:443` and `203.0.113.7:443`. */
function normalize(raw: string): string {
  const value = raw.trim()
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value)
  if (bracketed) return unmap(bracketed[1])
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) return value.slice(0, value.lastIndexOf(':'))
  return unmap(value)
}

export function clientIpFromHeaders(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for')
  const candidates = forwarded ? forwarded.split(',') : []
  const real = headers.get('x-real-ip')
  if (real) candidates.push(real)

  for (const candidate of candidates) {
    const value = normalize(candidate)
    if (value && isIpLiteral(value)) return value
  }
  return undefined
}
