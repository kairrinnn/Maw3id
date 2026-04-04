import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractIntent } from '@/lib/llm/intent'
import { tryGemini, tryOpenAI } from '@/lib/llm/models'
import type { ConversationState, Service } from '@/lib/llm/types'

vi.mock('@/lib/llm/models', () => ({
  tryGemini: vi.fn(),
  tryOpenAI: vi.fn(),
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

  it('Gemini returns confidence=high → OpenAI is NOT called', async () => {
    vi.mocked(tryGemini).mockResolvedValue({
      intent: 'greeting', confidence: 'high', service_name: null, date_raw: null, time_raw: null
    })

    const result = await extractIntent('bonjour', mockState, mockServices)

    expect(result.intent).toBe('greeting')
    expect(tryGemini).toHaveBeenCalled()
    expect(tryOpenAI).not.toHaveBeenCalled()
  })

  it('Gemini returns confidence=low → escalates to OpenAI', async () => {
    vi.mocked(tryGemini).mockResolvedValue({
      intent: 'book', confidence: 'low', service_name: 'coupe', date_raw: null, time_raw: null
    })
    vi.mocked(tryOpenAI).mockResolvedValue({
      intent: 'book', confidence: 'high', service_name: 'coupe', date_raw: 'demain', time_raw: '15h'
    })

    const result = await extractIntent('coupe demain 15h', mockState, mockServices)

    expect(result.confidence).toBe('high')
    expect(tryGemini).toHaveBeenCalled()
    expect(tryOpenAI).toHaveBeenCalled()
  })

  it('Gemini returns null (error) → escalates to OpenAI', async () => {
    vi.mocked(tryGemini).mockResolvedValue(null)
    vi.mocked(tryOpenAI).mockResolvedValue({
      intent: 'greeting', confidence: 'high', service_name: null, date_raw: null, time_raw: null
    })

    const result = await extractIntent('bonjour', mockState, mockServices)

    expect(result.intent).toBe('greeting')
    expect(tryOpenAI).toHaveBeenCalled()
  })

  it('Both models return null → returns unknown fallback', async () => {
    vi.mocked(tryGemini).mockResolvedValue(null)
    vi.mocked(tryOpenAI).mockResolvedValue(null)

    const result = await extractIntent('?', mockState, mockServices)

    expect(result.intent).toBe('unknown')
  })

  it('SKIP_LLM=true → no model called, returns unknown', async () => {
    process.env.SKIP_LLM = 'true'
    const result = await extractIntent('bonjour', mockState, mockServices)

    expect(result.intent).toBe('unknown')
    expect(tryGemini).not.toHaveBeenCalled()
  })

  it('Gemini high confidence but missing required field for step → escalates', async () => {
    // Step is awaiting_service, but Gemini doesn't extract service_name
    const state: ConversationState = { ...mockState, step: 'awaiting_service' }
    vi.mocked(tryGemini).mockResolvedValue({
      intent: 'book', confidence: 'high', service_name: null, date_raw: null, time_raw: null
    })
    vi.mocked(tryOpenAI).mockResolvedValue({
      intent: 'book', confidence: 'high', service_name: 'Coupe', date_raw: null, time_raw: null
    })

    const result = await extractIntent('je veux un service', state, mockServices)

    expect(result.service_name).toBe('Coupe')
    expect(tryOpenAI).toHaveBeenCalled()
  })
})
