import { expect, test } from '@playwright/test'

import {
  classifyScan,
  isValidEan13,
  isValidIsbn10,
  isValidUpcA,
  normalizeScanValue,
  upcAToEan13,
} from '../../lib/ai/quick-listing'

test.describe('barcode normalization', () => {
  test('strips separators and uppercases', () => {
    expect(normalizeScanValue('  978-0-262-03384-8 ')).toBe('9780262033848')
    expect(normalizeScanValue('sku-ab 12')).toBe('SKUAB12')
  })

  test('validates real ISBN-13 / EAN-13 checksums', () => {
    // Introduction to Algorithms, 3rd ed.
    expect(isValidEan13('9780262033848')).toBe(true)
    // Last digit corrupted.
    expect(isValidEan13('9780262033847')).toBe(false)
    expect(isValidEan13('123')).toBe(false)
  })

  test('validates ISBN-10 checksums including the X check digit', () => {
    expect(isValidIsbn10('0262033844')).toBe(true)
    expect(isValidIsbn10('080442957X')).toBe(true)
    expect(isValidIsbn10('0262033845')).toBe(false)
    expect(isValidIsbn10('02620338')).toBe(false)
  })

  test('validates UPC-A via its EAN-13 equivalent', () => {
    expect(isValidUpcA('036000291452')).toBe(true)
    expect(isValidUpcA('036000291453')).toBe(false)
  })

  test('UPC-A converts to EAN-13 by leading zero', () => {
    expect(upcAToEan13('036000291452')).toBe('0036000291452')
    // Already 13 digits — left alone.
    expect(upcAToEan13('9780262033848')).toBe('9780262033848')
  })
})

test.describe('scan classification', () => {
  test('recognises Bookland EAN as ISBN-13', () => {
    const scan = classifyScan('9780262033848')
    expect(scan?.format).toBe('isbn_13')
    expect(scan?.checksumValid).toBe(true)
    expect(scan?.lookupValue).toBe('9780262033848')
  })

  test('non-Bookland 13-digit codes stay EAN-13', () => {
    const scan = classifyScan('4006381333931')
    expect(scan?.format).toBe('ean_13')
  })

  test('UPC-A is classified and given an EAN-13 lookup value', () => {
    const scan = classifyScan('036000291452')
    expect(scan?.format).toBe('upc_a')
    expect(scan?.lookupValue).toBe('0036000291452')
    expect(scan?.checksumValid).toBe(true)
  })

  test('ISBN-10 with X check digit is recognised', () => {
    const scan = classifyScan('080442957X')
    expect(scan?.format).toBe('isbn_10')
    expect(scan?.checksumValid).toBe(true)
  })

  test('a bad checksum is reported, not rejected', () => {
    // A mis-scan must still produce candidates at lower confidence rather than
    // hard-failing the auctioneer's scan.
    const scan = classifyScan('9780262033847')
    expect(scan).not.toBeNull()
    expect(scan?.format).toBe('isbn_13')
    expect(scan?.checksumValid).toBe(false)
  })

  test('free-form codes fall back to SKU', () => {
    const scan = classifyScan('LOT-2026-A/17')
    expect(scan?.format).toBe('sku')
  })

  test('empty input is not a scan', () => {
    expect(classifyScan('   ')).toBeNull()
  })
})
