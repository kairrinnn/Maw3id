import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WebhookPayload } from '@/lib/whatsapp/types'

// Shared mocks
const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockUpsert = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()

const mockSupabase = {
  from: mockFrom,
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockSupabase),
}))

vi.mock('@/lib/whatsapp/send', () => ({
  sendTextMessage: vi.fn().mockResolvedValue('wamid.MOCK_REPLY'),
}))

vi.mock('@/lib/booking/service', () => ({
  createBooking: vi.fn().mockResolvedValue({ booking: { id: 'booking-uuid-1' }, conflict: false }),
  cancelBooking: vi.fn().mockResolvedValue(undefined),
  modifyBooking: vi.fn().mockResolvedValue({ booking: { id: 'booking-uuid-1' }, conflict: false }),
  getUpcomingBookings: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/llm/intent', () => ({
  extractIntent: vi.fn().mockResolvedValue({
    intent: 'greeting',
    confidence: 'high',
    service_name: null,
    date_raw: null,
    time_raw: null,
  }),
}))

vi.mock('@/lib/fsm/machine', () => ({
  processIntent: vi.fn().mockReturnValue({
    nextState: { step: 'greeting', status: 'idle' },
    replyText: 'Bonjour! Comment puis-je vous aider?',
  }),
  MODIFY_KEYWORDS: /\b(modifier|changer|reporter|deplacer)\b/i,
}))

vi.mock('@/lib/fsm/state', () => ({
  loadConversationState: vi.fn().mockResolvedValue({ step: 'greeting', status: 'idle' }),
  saveConversationState: vi.fn().mockResolvedValue(undefined),
}))

// Helper: build minimal valid webhook payload
function makePayload(overrides?: {
  phoneNumberId?: string
  from?: string
  wamid?: string
  messageType?: string
  messages?: any[]
  noMessages?: boolean
}): WebhookPayload {
  const msgs = overrides?.noMessages
    ? undefined
    : overrides?.messages ?? [
        {
          from: overrides?.from ?? '212600000001',
          id: overrides?.wamid ?? 'wamid.test.001',
          timestamp: '1711900000',
          type: overrides?.messageType ?? 'text',
          ...(overrides?.messageType && overrides.messageType !== 'text'
            ? {}
            : { text: { body: 'Bonjour' } }),
        },
      ]

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-id-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+212600000000',
                phone_number_id: overrides?.phoneNumberId ?? 'phone-id-123',
              },
              contacts: [{ profile: { name: 'Test Client' }, wa_id: overrides?.from ?? '212600000001' }],
              ...(msgs !== undefined ? { messages: msgs } : {}),
            },
          },
        ],
      },
    ],
  } as any
}

// Helper: build a Request object
function makeRequest(method: 'GET' | 'POST', url: string, body?: unknown): Request {
  if (method === 'GET') {
    return new Request(url, { method: 'GET' })
  }
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Import handlers AFTER mocks
import { GET, POST } from '@/app/api/webhook/route'
import { sendTextMessage } from '@/lib/whatsapp/send'
import { createBooking, cancelBooking, modifyBooking, getUpcomingBookings } from '@/lib/booking/service'

describe('Webhook API', () => {
  beforeEach(() => {
    process.env.WEBHOOK_VERIFY_TOKEN = 'test-verify-token-secret'
    process.env.SKIP_WEBHOOK_SIGNATURE = 'true'
    vi.clearAllMocks()

    const createChain = (data: any, count: number = 0) => {
      const chain: any = {
        select: vi.fn(() => chain),
        upsert: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(() => Promise.resolve({ data, error: null })),
        then: (resolve: any) => resolve({ data, error: null, count }),
      }
      return chain
    }

    mockFrom.mockImplementation((table) => {
      if (table === 'phone_numbers') return createChain({ tenant_id: 'tenant-uuid-1' })
      if (table === 'bot_configs') return createChain({ active: true, owner_notification_wa_id: '212600000099' })
      if (table === 'processed_messages') return createChain(null, 1) // count = 1
      if (table === 'conversations') return createChain({ id: 'conv-uuid-1' })
      if (table === 'services') return createChain([{ id: 's1', tenant_id: 'tenant-uuid-1', name: 'Coupe', duration_minutes: 30, price_mad: 100, active: true }])
      return createChain(null)
    })
  })

  describe('GET /api/webhook - Meta verification', () => {
    it('returns hub.challenge when verify_token matches', async () => {
      const url =
        'http://localhost/api/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token-secret&hub.challenge=abc123challenge'
      const req = makeRequest('GET', url)
      const res = await GET(req)
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).toBe('abc123challenge')
    })
  })

  describe('POST /api/webhook - core processing', () => {
    it('returns 200 immediately for status update', async () => {
      const payload = makePayload({ noMessages: true })
      const req = makeRequest('POST', 'http://localhost/api/webhook', payload)
      const res = await POST(req)
      expect(res.status).toBe(200)
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('skips processing duplicate wamid (count === 0)', async () => {
      mockFrom.mockImplementation((table) => {
        if (table === 'phone_numbers') return { select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { tenant_id: 't1' } }) }) }) }) }
        if (table === 'bot_configs') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { active: true } }) }) }) }
        if (table === 'processed_messages') return { upsert: () => ({ then: (res: any) => res({ count: 0 }) }) }
        return { select: () => ({ single: () => Promise.resolve({ data: null }) }) }
      })

      const payload = makePayload({ wamid: 'wamid.duplicate' })
      const req = makeRequest('POST', 'http://localhost/api/webhook', payload)
      const res = await POST(req)
      expect(res.status).toBe(200)
    })
  })

  describe('POST /api/webhook - booking orchestration', () => {
    it('BOOK-01 — booking created on confirming->confirmed', async () => {
      const { loadConversationState, saveConversationState } = await import('@/lib/fsm/state')
      const { processIntent: mockProcessIntent } = await import('@/lib/fsm/machine')

      vi.mocked(loadConversationState).mockResolvedValueOnce({
        step: 'confirming', status: 'idle', service_id: 's1', service_name: 'Coupe',
        date: '2026-04-07', time: '15:00',
      })
      vi.mocked(mockProcessIntent).mockReturnValueOnce({
        nextState: { step: 'confirmed', status: 'done', service_id: 's1', service_name: 'Coupe', date: '2026-04-07', time: '15:00' },
        replyText: 'Parfait! Votre rendez-vous est confirme.',
      })

      const payload = makePayload({ messageType: 'text', wamid: 'wamid.book.001' })
      const req = makeRequest('POST', 'http://localhost/api/webhook', payload)
      const res = await POST(req)

      expect(res.status).toBe(200)
      expect(vi.mocked(createBooking)).toHaveBeenCalled()
      expect(vi.mocked(saveConversationState)).toHaveBeenCalledWith(
        expect.anything(), expect.any(String), expect.any(String),
        expect.objectContaining({ booking_id: 'booking-uuid-1' })
      )
    })

    it('BOOK-03+07 — cancel calls cancelBooking and notifies owner', async () => {
      const { loadConversationState } = await import('@/lib/fsm/state')
      const { processIntent: mockProcessIntent } = await import('@/lib/fsm/machine')

      vi.mocked(loadConversationState).mockResolvedValueOnce({
        step: 'confirmed', status: 'done', service_name: 'Coupe',
        date: '2026-04-07', time: '15:00', booking_id: 'booking-uuid-1',
      })
      vi.mocked(mockProcessIntent).mockReturnValueOnce({
        nextState: { step: 'cancelling', status: 'in_progress', service_name: 'Coupe', date: '2026-04-07', time: '15:00', booking_id: 'booking-uuid-1' },
        replyText: 'Votre rendez-vous va etre annule.',
      })

      const payload = makePayload({ messageType: 'text', wamid: 'wamid.cancel.001' })
      const req = makeRequest('POST', 'http://localhost/api/webhook', payload)
      const res = await POST(req)

      expect(res.status).toBe(200)
      expect(vi.mocked(cancelBooking)).toHaveBeenCalled()
      // Verification of owner notification
      expect(vi.mocked(sendTextMessage)).toHaveBeenCalledWith('212600000099', expect.stringContaining('[Annulation]'), expect.anything())
    })

    it('BOOK-04 — query returns formatted booking list', async () => {
      const { loadConversationState } = await import('@/lib/fsm/state')
      const { processIntent: mockProcessIntent } = await import('@/lib/fsm/machine')

      vi.mocked(loadConversationState).mockResolvedValueOnce({ step: 'greeting', status: 'idle' })
      vi.mocked(mockProcessIntent).mockReturnValueOnce({
        nextState: { step: 'greeting', status: 'idle' },
        replyText: 'UPCOMING_BOOKINGS_PLACEHOLDER',
      })
      vi.mocked(getUpcomingBookings).mockResolvedValueOnce([{
        id: '1',
        tenant_id: 't1',
        service_id: 's1',
        staff_id: null,
        client_wa_id: '212600000001',
        client_name: null,
        conversation_id: null,
        appointment_at: '2026-04-07T14:00:00+01:00',
        status: 'confirmed',
        created_at: '2026-04-04T10:00:00Z',
        services: { name: 'Coupe' },
      }])

      const payload = makePayload({ messageType: 'text', wamid: 'wamid.query.001' })
      const req = makeRequest('POST', 'http://localhost/api/webhook', payload)
      const res = await POST(req)

      expect(res.status).toBe(200)
      expect(vi.mocked(sendTextMessage)).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Vos prochains rendez-vous'), expect.any(String))
    })
  })
})
