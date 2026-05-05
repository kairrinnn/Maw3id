import { describe, it, expect } from 'vitest'
import { getWeekBoundsCasablanca, getMonthBoundsCasablanca, formatMad, sumRevenue } from '@/lib/dashboard/stats'

describe('DASH-03: Booking stats aggregation', () => {
  it('week bound is Monday 00:00 Casablanca (Thursday test date)', () => {
    // 2026-05-07T10:00:00Z = Thursday 11:00 Casablanca
    // Monday of that week = 2026-05-04 00:00 Casablanca = 2026-05-03 23:00 UTC
    const result = getWeekBoundsCasablanca(new Date('2026-05-07T10:00:00Z'))
    expect(result.startIso).toBe('2026-05-03T23:00:00.000Z')
  })

  it('month bound is day 1 00:00 Casablanca', () => {
    // 2026-05-15T12:00:00Z = May 15, 13:00 Casablanca
    // May 1 00:00 Casablanca = April 30 23:00 UTC
    const result = getMonthBoundsCasablanca(new Date('2026-05-15T12:00:00Z'))
    expect(result.startIso).toBe('2026-04-30T23:00:00.000Z')
  })

  it('Sunday week bound rolls to previous Monday', () => {
    // 2026-05-10T12:00:00Z = Sunday 13:00 Casablanca
    // Previous Monday = 2026-05-04 00:00 Casablanca = 2026-05-03 23:00 UTC
    const result = getWeekBoundsCasablanca(new Date('2026-05-10T12:00:00Z'))
    expect(result.startIso).toBe('2026-05-03T23:00:00.000Z')
  })

  it('formatMad zero state and French locale formatting', () => {
    expect(formatMad(0)).toBe('0 MAD')
    // Non-breaking space (U+00A0) or regular space — locale impl detail across Node versions
    expect(formatMad(2800)).toMatch(/^2\s?800 MAD$/)
    expect(formatMad(150)).toBe('150 MAD')
  })

  it('sumRevenue treats null prices as zero', () => {
    const result = sumRevenue([
      { services: { price_mad: 100 } },
      { services: { price_mad: null } },
      { services: { price_mad: 50 } },
    ])
    expect(result).toBe(150)
  })

  it('sumRevenue handles empty array AND array-shaped relation', () => {
    expect(sumRevenue([])).toBe(0)
    expect(sumRevenue([{ services: [{ price_mad: 200 }] }])).toBe(200)
  })
})
