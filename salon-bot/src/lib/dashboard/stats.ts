// Africa/Casablanca = UTC+1, no DST (Morocco abolished DST in 2018).
// Add 60 min to UTC to get Casablanca local time; subtract back to ISO string.
const CASABLANCA_OFFSET_MS = 60 * 60 * 1000

export interface DateBounds {
  startIso: string
  endIso: string
}

/** Monday 00:00 Casablanca local time (as UTC ISO string) until now. */
export function getWeekBoundsCasablanca(now: Date): DateBounds {
  const localNow = new Date(now.getTime() + CASABLANCA_OFFSET_MS)
  const dow = localNow.getUTCDay() // 0=Sun..6=Sat in local-shifted time
  const daysSinceMon = (dow + 6) % 7
  const localMonStart = new Date(localNow)
  localMonStart.setUTCDate(localNow.getUTCDate() - daysSinceMon)
  localMonStart.setUTCHours(0, 0, 0, 0)
  const startIso = new Date(localMonStart.getTime() - CASABLANCA_OFFSET_MS).toISOString()
  return { startIso, endIso: now.toISOString() }
}

/** Day 1 00:00 Casablanca local time (as UTC ISO string) until now. */
export function getMonthBoundsCasablanca(now: Date): DateBounds {
  const localNow = new Date(now.getTime() + CASABLANCA_OFFSET_MS)
  const localMonthStart = new Date(localNow)
  localMonthStart.setUTCDate(1)
  localMonthStart.setUTCHours(0, 0, 0, 0)
  const startIso = new Date(localMonthStart.getTime() - CASABLANCA_OFFSET_MS).toISOString()
  return { startIso, endIso: now.toISOString() }
}

/** "2 800 MAD", "0 MAD", "12 500 MAD" — French locale, no decimals. */
export function formatMad(amount: number): string {
  const rounded = Math.round(amount)
  // toLocaleString('fr-FR') uses non-breaking space (U+00A0) as thousands separator
  return `${rounded.toLocaleString('fr-FR')} MAD`
}

/** Sum prices from joined service rows; null prices treated as 0. */
export function sumRevenue(
  rows: Array<{ services: { price_mad: number | null } | { price_mad: number | null }[] | null }>
): number {
  let total = 0
  for (const row of rows) {
    const svc = row.services
    if (!svc) continue
    const price = Array.isArray(svc) ? svc[0]?.price_mad : svc.price_mad
    if (typeof price === 'number') total += price
  }
  return total
}
