import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WebhookPayload } from '@/lib/whatsapp/types'

// Mock the service client before importing route
const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockUpsert = vi.fn()

const mockSupabase = {
  from: mockFrom,
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockSupabase),
}))

// Helper to build a fluent chain mock that returns a specific value at the end
function buildChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {}
  const chainFn = () => chain
  chain.select = vi.fn(chainFn)
  chain.eq = vi.fn(chainFn)
  chain.single = vi.fn(() => returnValue)
  chain.upsert = vi.fn(() => returnValue)
  return chain
}

// Helper: build minimal valid webhook payload
function makePayload(overrides?: {
  phoneNumberId?: string
  from?: string
  wamid?: string
  messageType?: string
  messages?: unknown[]
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
              ...(msgs !== undefined ? { messages: msgs as WebhookPayload['entry'][0]['changes'][0]['value']['messages'] } : {}),
            },
          },
        ],
      },
    ],
  }
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

// Import handlers after mocks are set up
import { GET, POST } from '@/app/api/webhook/route'

describe('GET /api/webhook - Meta verification', () => {
  beforeEach(() => {
    process.env.WEBHOOK_VERIFY_TOKEN = 'test-verify-token-secret'
    vi.clearAllMocks()
  })

  it('returns hub.challenge when verify_token matches', async () => {
    const url =
      'http://localhost/api/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token-secret&hub.challenge=abc123challenge'
    const req = makeRequest('GET', url)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('abc123challenge')
  })

  it('returns 403 when verify_token does not match', async () => {
    const url =
      'http://localhost/api/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=abc123challenge'
    const req = makeRequest('GET', url)
    const res = await GET(req)
    expect(res.status).toBe(403)
    const text = await res.text()
    expect(text).toBe('Forbidden')
  })
})

describe('POST /api/webhook - message processing', () => {
  beforeEach(() => {
    process.env.WEBHOOK_VERIFY_TOKEN = 'test-verify-token-secret'
    process.env.WHATSAPP_API_TOKEN = '' // disable actual fetch calls in stub
    vi.clearAllMocks()
    // Default from() returns a fluent chain
    mockFrom.mockImplementation(() => ({
      select: mockSelect,
      upsert: mockUpsert,
    }))
    mockSelect.mockImplementation(() => ({
      eq: mockEq,
    }))
    mockEq.mockImplementation(() => ({
      eq: mockEq,
      single: mockSingle,
    }))
  })

  it('returns 200 immediately for status update (no messages array)', async () => {
    const payload = makePayload({ noMessages: true })
    const req = makeRequest('POST', 'http://localhost/api/webhook', payload)
    const res = await POST(req)
    expect(res.status).toBe(200)
    // No DB calls should have been made
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns 200 silently when phone_number_id has no matching tenant', async () => {
    // phone_numbers query returns null (unknown phone_number_id)
    mockSingle.mockResolvedValueOnce({ data: null, error: null })

    const payload = makePayload({ phoneNumberId: 'unknown-phone-id' })
    const req = makeRequest('POST', 'http://localhost/api/webhook', payload)
    const res = await POST(req)
    expect(res.status).toBe(200)
    // Should have queried phone_numbers but NOT bot_configs
    expect(mockFrom).toHaveBeenCalledWith('phone_numbers')
    expect(mockFrom).not.toHaveBeenCalledWith('bot_configs')
  })

  it('returns 200 silently when bot_config.active is false', async () => {
    // phone_numbers returns a tenant
    mockSingle
      .mockResolvedValueOnce({ data: { tenant_id: 'tenant-uuid-1' }, error: null })
      // bot_configs returns active: false
      .mockResolvedValueOnce({ data: { active: false }, error: null })

    const payload = makePayload({ phoneNumberId: 'phone-id-123' })
    const req = makeRequest('POST', 'http://localhost/api/webhook', payload)
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockFrom).toHaveBeenCalledWith('phone_numbers')
    expect(mockFrom).toHaveBeenCalledWith('bot_configs')
    expect(mockFrom).not.toHaveBeenCalledWith('processed_messages')
  })

  it('skips processing duplicate wamid (rowCount === 0)', async () => {
    // phone_numbers query returns tenant
    mockSingle
      .mockResolvedValueOnce({ data: { tenant_id: 'tenant-uuid-1' }, error: null })
      // bot_configs returns active: true
      .mockResolvedValueOnce({ data: { active: true }, error: null })
    // upsert on processed_messages returns count: 0 (conflict — duplicate)
    mockUpsert.mockResolvedValueOnce({ data: null, error: null, count: 0 })

    const payload = makePayload({ wamid: 'wamid.duplicate.001' })
    const req = makeRequest('POST', 'http://localhost/api/webhook', payload)
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockFrom).toHaveBeenCalledWith('processed_messages')
    // conversations should NOT be upserted since it's a duplicate
    expect(mockFrom).not.toHaveBeenCalledWith('conversations')
  })

  it('processes valid text message: upserts conversation, inserts processed_message', async () => {
    // phone_numbers
    mockSingle
      .mockResolvedValueOnce({ data: { tenant_id: 'tenant-uuid-1' }, error: null })
      // bot_configs
      .mockResolvedValueOnce({ data: { active: true }, error: null })
    // upsert processed_messages: count = 1 (new row inserted)
    mockUpsert
      .mockResolvedValueOnce({ data: null, error: null, count: 1 })
      // upsert conversations
      .mockResolvedValueOnce({ data: null, error: null })

    const payload = makePayload({ messageType: 'text', wamid: 'wamid.new.001' })
    const req = makeRequest('POST', 'http://localhost/api/webhook', payload)
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockFrom).toHaveBeenCalledWith('processed_messages')
    expect(mockFrom).toHaveBeenCalledWith('conversations')
  })

  it('sends non-text reply for image/audio message type', async () => {
    // phone_numbers
    mockSingle
      .mockResolvedValueOnce({ data: { tenant_id: 'tenant-uuid-1' }, error: null })
      // bot_configs
      .mockResolvedValueOnce({ data: { active: true }, error: null })
    // upsert processed_messages: count = 1
    mockUpsert
      .mockResolvedValueOnce({ data: null, error: null, count: 1 })
      // upsert conversations
      .mockResolvedValueOnce({ data: null, error: null })

    // Spy on sendStubReply via fetch — stub should be called with non-text reply
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }))

    // Set a token so sendStubReply doesn't skip
    process.env.WHATSAPP_API_TOKEN = 'test-wa-token'

    const payload = makePayload({ messageType: 'image', wamid: 'wamid.image.001' })
    const req = makeRequest('POST', 'http://localhost/api/webhook', payload)
    const res = await POST(req)
    expect(res.status).toBe(200)

    // Check fetch was called with the non-text message body
    expect(fetchSpy).toHaveBeenCalledOnce()
    const fetchBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
    expect(fetchBody.text.body).toBe('Je ne peux traiter que les messages texte pour le moment.')

    fetchSpy.mockRestore()
  })
})
