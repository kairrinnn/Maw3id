import * as chrono from 'chrono-node'

export function resolveDate(raw: string | null, referenceDate: Date = new Date()): string | null {
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw
  // Essayer le parser francais
  const parser = (chrono as any).fr ?? chrono
  const parsed = parser.parseDate(raw, referenceDate)
  if (parsed) return parsed.toISOString().split('T')[0]
  return null
}

export function resolveTime(raw: string | null): string | null {
  if (!raw) return null
  const match = raw.match(/^(\d{1,2})h(\d{2})?$/i)
  if (match) {
    const h = match[1].padStart(2, '0')
    const m = (match[2] ?? '00').padStart(2, '0')
    return `${h}:${m}`
  }
  const lower = raw.toLowerCase().replace('-', '')
  if (lower.includes('matin')) return '09:00'
  if (lower.includes('apresmidi') || lower.includes('apres-midi')) return '14:00'
  if (lower.includes('soir')) return '18:00'
  return null
}
