import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('sendTextMessage', () => {
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_API_TOKEN', 'test-token')
    vi.stubEnv('WHATSAPP_API_VERSION', 'v19.0')
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('POSTs to correct Meta endpoint with correct body shape', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.OUT123' }] }),
    })
    const { sendTextMessage } = await import('@/lib/whatsapp/send')
    const result = await sendTextMessage('212600111111', 'Bonjour!', 'PHONE_ID_001')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v19.0/PHONE_ID_001/messages')
    expect(init.method).toBe('POST')
    expect(init.headers['Authorization']).toBe('Bearer test-token')
    const body = JSON.parse(init.body)
    expect(body.messaging_product).toBe('whatsapp')
    expect(body.recipient_type).toBe('individual')
    expect(body.to).toBe('212600111111')
    expect(body.type).toBe('text')
    expect(body.text.body).toBe('Bonjour!')
    expect(result).toBe('wamid.OUT123')
  })

  it('throws when Meta returns non-200', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400 })
    const { sendTextMessage } = await import('@/lib/whatsapp/send')
    await expect(sendTextMessage('212600111111', 'Hello', 'PHONE_ID_001'))
      .rejects.toThrow('Meta API error: 400')
  })

  it('defaults to v19.0 when WHATSAPP_API_VERSION not set', async () => {
    vi.stubEnv('WHATSAPP_API_VERSION', '')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.X' }] }),
    })
    const { sendTextMessage } = await import('@/lib/whatsapp/send')
    await sendTextMessage('212600111111', 'Hi', 'PID')
    expect(mockFetch.mock.calls[0][0]).toContain('/v21.0/')
  })
})

describe('sendTemplateMessage stub', () => {
  it('throws not-implemented error', async () => {
    const { sendTemplateMessage } = await import('@/lib/whatsapp/send')
    await expect(sendTemplateMessage({ to: '212600111111', templateName: 'test', languageCode: 'fr' }))
      .rejects.toThrow('not implemented')
  })
})
