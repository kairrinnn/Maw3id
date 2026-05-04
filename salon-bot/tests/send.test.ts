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

describe('sendTemplateMessage', () => {
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_API_TOKEN', 'test-token')
    vi.stubEnv('WHATSAPP_API_VERSION', 'v23.0')
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('POSTs to the correct Meta messages endpoint using payload.phoneNumberId', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.TPL001' }] }),
    })
    const { sendTemplateMessage } = await import('@/lib/whatsapp/send')
    await sendTemplateMessage({
      to: '212600111111',
      templateName: 'rdv_reminder',
      languageCode: 'fr',
      phoneNumberId: 'TENANT_PHONE_ID',
    })

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/TENANT_PHONE_ID/messages')
    expect(url).not.toContain(process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'ENV_VAR')
  })

  it('sends correct Meta template payload shape', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.TPL002' }] }),
    })
    const { sendTemplateMessage } = await import('@/lib/whatsapp/send')
    await sendTemplateMessage({
      to: '212600111111',
      templateName: 'rdv_reminder',
      languageCode: 'fr',
      phoneNumberId: 'PHONE_ID_001',
    })

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.messaging_product).toBe('whatsapp')
    expect(body.type).toBe('template')
    expect(body.template.name).toBe('rdv_reminder')
    expect(body.template.language.code).toBe('fr')
    expect(init.headers['Authorization']).toBe('Bearer test-token')
  })

  it('includes components when provided in payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.TPL003' }] }),
    })
    const { sendTemplateMessage } = await import('@/lib/whatsapp/send')
    await sendTemplateMessage({
      to: '212600111111',
      templateName: 'rdv_reminder',
      languageCode: 'fr',
      phoneNumberId: 'PHONE_ID_001',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'lundi 5 mai' }] }],
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.template.components).toBeDefined()
    expect(body.template.components[0].parameters[0].text).toBe('lundi 5 mai')
  })

  it('omits components key when payload.components is undefined', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.TPL004' }] }),
    })
    const { sendTemplateMessage } = await import('@/lib/whatsapp/send')
    await sendTemplateMessage({
      to: '212600111111',
      templateName: 'rdv_reminder',
      languageCode: 'fr',
      phoneNumberId: 'PHONE_ID_001',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.template.components).toBeUndefined()
  })

  it('returns data.messages[0].id from Meta response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.RETURNED_ID' }] }),
    })
    const { sendTemplateMessage } = await import('@/lib/whatsapp/send')
    const result = await sendTemplateMessage({
      to: '212600111111',
      templateName: 'rdv_reminder',
      languageCode: 'fr',
      phoneNumberId: 'PHONE_ID_001',
    })

    expect(result).toBe('wamid.RETURNED_ID')
  })

  it('throws "Meta template API error: {status}" on non-200 response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400 })
    const { sendTemplateMessage } = await import('@/lib/whatsapp/send')
    await expect(
      sendTemplateMessage({
        to: '212600111111',
        templateName: 'rdv_reminder',
        languageCode: 'fr',
        phoneNumberId: 'PHONE_ID_001',
      })
    ).rejects.toThrow('Meta template API error: 400')
  })

  it('defaults to v23.0 when WHATSAPP_API_VERSION not set', async () => {
    vi.stubEnv('WHATSAPP_API_VERSION', '')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.X' }] }),
    })
    const { sendTemplateMessage } = await import('@/lib/whatsapp/send')
    await sendTemplateMessage({
      to: '212600111111',
      templateName: 'rdv_reminder',
      languageCode: 'fr',
      phoneNumberId: 'PHONE_ID_001',
    })

    expect(mockFetch.mock.calls[0][0]).toContain('/v23.0/')
  })
})
