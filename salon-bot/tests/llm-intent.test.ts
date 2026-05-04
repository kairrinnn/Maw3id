import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractIntent } from '@/lib/llm/intent'
import { tryAnthropic } from '@/lib/llm/models'
import type { ConversationState, Service } from '@/lib/llm/types'

vi.mock('@/lib/llm/models', () => ({
  tryAnthropic: vi.fn(),
}))

describe('extractIntent', () => {
  const mockState: ConversationState = { step: 'greeting', status: 'idle' }
  const mockServices: Service[] = [
    { id: '1', tenant_id: 't1', name: 'Coupe Homme', duration_minutes: 30, price_mad: 100, active: true },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SKIP_LLM = 'false'
  })

  it('Anthropic returns result → used directly', async () => {
    vi.mocked(tryAnthropic).mockResolvedValue({
      intent: 'greeting', confidence: 'high', service_name: null, date_raw: null, time_raw: null
    })

    const result = await extractIntent('bonjour', mockState, mockServices)

    expect(result.intent).toBe('greeting')
    expect(tryAnthropic).toHaveBeenCalled()
  })

  it('Anthropic returns null → fallback unknown', async () => {
    vi.mocked(tryAnthropic).mockResolvedValue(null)

    const result = await extractIntent('?', mockState, mockServices)

    expect(result.intent).toBe('unknown')
  })

  it('SKIP_LLM=true → no model called, returns unknown', async () => {
    process.env.SKIP_LLM = 'true'
    const result = await extractIntent('bonjour', mockState, mockServices)

    expect(result.intent).toBe('unknown')
    expect(tryAnthropic).not.toHaveBeenCalled()
  })

  it('Anthropic extracts service_name correctly', async () => {
    vi.mocked(tryAnthropic).mockResolvedValue({
      intent: 'book', confidence: 'high', service_name: 'Coupe Homme', date_raw: 'demain', time_raw: '15h'
    })

    const result = await extractIntent('coupe homme demain 15h', mockState, mockServices)

    expect(result.service_name).toBe('Coupe Homme')
    expect(result.date_raw).toBe('demain')
  })
})
