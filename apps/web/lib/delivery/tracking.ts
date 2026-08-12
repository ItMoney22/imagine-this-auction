import { randomBytes } from 'crypto'

// Crockford-style alphabet: no 0/O or 1/I/L confusion when read aloud or
// typed from a label.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Human-friendly unique tracking number, e.g. ITA-7KQ2M9XW4T. */
export function generateTrackingNumber(): string {
  const bytes = randomBytes(10)
  let out = ''
  for (let i = 0; i < 10; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return `ITA-${out}`
}

/** Unguessable secret for the customer tracking link. */
export function generateTrackingToken(): string {
  return randomBytes(24).toString('hex')
}

export function isValidTrackingNumber(value: string): boolean {
  return /^ITA-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/.test(value.toUpperCase())
}
