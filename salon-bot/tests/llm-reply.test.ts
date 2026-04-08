import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks must be declared before imports
const mockGenerateContent = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: mockGenerateContent } }
  }),
}))

import {
  generateReply,
  FALLBACK_REPLIES,
  REPLY_TIMEOUT_MS,
  buildReplyPrompt,
  buildReplySystemPrompt,
} from '@/lib/llm/reply'
import type { ReplyContext } from '@/lib/llm/types'
import { FSM_STEPS } from '@/lib/llm/types'

const baseContext: ReplyContext = {
  currentStep: 'greeting',
  nextStep: 'awaiting_service',
  intent: 'book',
  userMessage: 'je veux un rendez-vous',
  salonName: 'Salon Beaute Casablanca',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.SKIP_LLM = 'false'
})

describe('SKIP_LLM mode', () => {
  beforeEach(() => {
    process.env.SKIP_LLM = 'true'
  })

  it('returns FALLBACK_REPLIES["awaiting_service"] for nextStep=awaiting_service', async () => {
    const result = await generateReply({ ...baseContext, nextStep: 'awaiting_service' })
    expect(result).toBe(FALLBACK_REPLIES['awaiting_service'])
  })

  it('returns FALLBACK_REPLIES["confirmed"] for nextStep=confirmed', async () => {
    const result = await generateReply({ ...baseContext, nextStep: 'confirmed' })
    expect(result).toBe(FALLBACK_REPLIES['confirmed'])
  })

  it('does NOT call mockGenerateContent when SKIP_LLM=true', async () => {
    await generateReply(baseContext)
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })
})

describe('Gemini success', () => {
  beforeEach(() => {
    process.env.SKIP_LLM = 'false'
    mockGenerateContent.mockResolvedValue({ text: 'Bienvenue! Quel service vous ferait plaisir?' })
  })

  it('returns Gemini text when Gemini responds successfully', async () => {
    const result = await generateReply(baseContext)
    expect(result).toBe('Bienvenue! Quel service vous ferait plaisir?')
    expect(mockGenerateContent).toHaveBeenCalledOnce()
  })
})

describe('Gemini failure', () => {
  beforeEach(() => {
    process.env.SKIP_LLM = 'false'
  })

  it('returns fallback when Gemini returns undefined text', async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined })
    const result = await generateReply({ ...baseContext, nextStep: 'awaiting_service' })
    expect(result).toBe(FALLBACK_REPLIES['awaiting_service'])
  })

  it('returns fallback and does NOT throw when Gemini rejects', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Network error'))
    await expect(generateReply(baseContext)).resolves.toBe(
      FALLBACK_REPLIES['awaiting_service']
    )
  })

  it('returns fallback on timeout (Gemini takes longer than REPLY_TIMEOUT_MS)', async () => {
    vi.useFakeTimers()
    mockGenerateContent.mockImplementation(() => new Promise(() => {})) // never resolves
    const promise = generateReply({ ...baseContext, nextStep: 'confirmed' })
    await vi.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS + 100)
    const result = await promise
    expect(result).toBe(FALLBACK_REPLIES['confirmed'])
    vi.useRealTimers()
  })
})

describe('conflict path', () => {
  it('uses FALLBACK_REPLIES["conflict"] when conflict=true, not the nextStep key', async () => {
    process.env.SKIP_LLM = 'true'
    const result = await generateReply({
      ...baseContext,
      conflict: true,
      nextStep: 'awaiting_datetime',
    })
    expect(result).toBe(FALLBACK_REPLIES['conflict'])
    expect(result).not.toBe(FALLBACK_REPLIES['awaiting_datetime'])
  })
})

describe('buildReplyPrompt', () => {
  it('includes serviceName, date, and time for confirming step', () => {
    const ctx: ReplyContext = {
      ...baseContext,
      nextStep: 'confirming',
      serviceName: 'Coupe',
      date: '2026-04-10',
      time: '15:00',
    }
    const prompt = buildReplyPrompt(ctx)
    expect(prompt).toContain('Coupe')
    expect(prompt).toContain('2026-04-10')
    expect(prompt).toContain('15:00')
  })

  it('always ends with the user message', () => {
    const prompt = buildReplyPrompt({ ...baseContext, userMessage: 'bonjour salon' })
    expect(prompt).toContain("Le client a ecrit: 'bonjour salon'")
  })
})

describe('buildReplySystemPrompt', () => {
  it('includes the salonName passed as argument', () => {
    const prompt = buildReplySystemPrompt('Salon Lalla Fatima')
    expect(prompt).toContain('Salon Lalla Fatima')
  })

  it('contains french language instruction', () => {
    const prompt = buildReplySystemPrompt('Salon Test')
    expect(prompt).toContain('francais')
  })
})

describe('FALLBACK_REPLIES coverage', () => {
  it('has an entry for every FSM_STEPS entry or falls back to default', () => {
    for (const step of FSM_STEPS) {
      const has = FALLBACK_REPLIES[step] !== undefined || FALLBACK_REPLIES.default !== undefined
      expect(has, `FALLBACK_REPLIES missing coverage for step "${step}"`).toBe(true)
    }
  })

  it('has a default fallback entry', () => {
    expect(FALLBACK_REPLIES['default']).toBeDefined()
    expect(FALLBACK_REPLIES['default'].length).toBeGreaterThan(0)
  })

  it('has a conflict fallback entry', () => {
    expect(FALLBACK_REPLIES['conflict']).toBeDefined()
    expect(FALLBACK_REPLIES['conflict'].length).toBeGreaterThan(0)
  })
})
