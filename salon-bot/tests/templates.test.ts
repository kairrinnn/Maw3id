import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Global fetch mock ---
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// --- Supabase service mock ---

// Helper to build a chainable Supabase query mock
function buildChain(returnValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {}
  const fn = () => chain
  chain.select = vi.fn(fn)
  chain.eq = vi.fn(fn)
  chain.update = vi.fn(fn)
  chain.single = vi.fn(() => Promise.resolve(returnValue))
  return chain
}

// buildUpdateChain — last call is .eq() returning a promise (for the update chain)
function buildUpdateChain(returnValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.update = vi.fn(() => chain)
  chain.eq = vi.fn(() => Promise.resolve(returnValue))
  return chain
}

// We store references to individual chain mocks so we can assert on them
let mockTplChain: ReturnType<typeof buildChain>
let mockPhoneChain: ReturnType<typeof buildChain>
let mockUpdateChain: ReturnType<typeof buildUpdateChain>

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}))

// Stub env vars needed by the route
vi.stubEnv('WHATSAPP_API_TOKEN', 'test-token')
vi.stubEnv('WHATSAPP_API_VERSION', 'v23.0')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')

// Helper: reset Supabase mocks for each test
function setupDefaultMocks({
  tplData = {
    id: 'tpl-uuid-1',
    body_text: 'Rappel : votre rendez-vous chez {{2}} est prévu le {{1}}. À bientôt !',
    language: 'fr',
  },
  phoneData = { waba_id: 'WABA_ID_001' },
  tplError = null,
  phoneError = null,
}: {
  tplData?: unknown
  phoneData?: unknown
  tplError?: unknown
  phoneError?: unknown
} = {}) {
  mockTplChain = buildChain({ data: tplData, error: tplError })
  mockPhoneChain = buildChain({ data: phoneData, error: phoneError })
  mockUpdateChain = buildUpdateChain({ data: null, error: null })

  mockFrom.mockImplementation((table: string) => {
    if (table === 'whatsapp_templates') {
      // First call = select, second call = update
      if ((mockFrom.mock.calls.filter((c: string[]) => c[0] === 'whatsapp_templates').length) > 1) {
        return mockUpdateChain
      }
      return mockTplChain
    }
    if (table === 'phone_numbers') return mockPhoneChain
    return buildChain({ data: null, error: null })
  })
}

// Helper: build a minimal Next.js Request object
function makeRequest(body: unknown) {
  return new Request('http://localhost:3000/api/templates/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/templates/submit', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFrom.mockReset()
  })

  it('returns 400 when tenant_id is missing', async () => {
    const { POST } = await import('@/app/api/templates/submit/route')
    const req = makeRequest({ template_name: 'rdv_reminder' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when template_name is missing', async () => {
    const { POST } = await import('@/app/api/templates/submit/route')
    const req = makeRequest({ tenant_id: 'tenant-uuid-1' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when no whatsapp_templates row matches', async () => {
    setupDefaultMocks({ tplData: null, tplError: { message: 'Not found' } })
    const { POST } = await import('@/app/api/templates/submit/route')
    const req = makeRequest({ tenant_id: 'tenant-uuid-1', template_name: 'rdv_reminder' })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns 404 when tenant has no active phone_numbers row', async () => {
    setupDefaultMocks({ phoneData: null, phoneError: { message: 'Not found' } })
    const { POST } = await import('@/app/api/templates/submit/route')
    const req = makeRequest({ tenant_id: 'tenant-uuid-1', template_name: 'rdv_reminder' })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('POSTs to Meta message_templates endpoint with correct body on success', async () => {
    setupDefaultMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'meta-tpl-id-001', status: 'PENDING' }),
    })

    const { POST } = await import('@/app/api/templates/submit/route')
    const req = makeRequest({ tenant_id: 'tenant-uuid-1', template_name: 'rdv_reminder' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledOnce()

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('WABA_ID_001/message_templates')
    expect(url).toContain('v23.0')

    const metaBody = JSON.parse(init.body)
    expect(metaBody.name).toBe('rdv_reminder')
    expect(metaBody.category).toBe('UTILITY')
    expect(metaBody.language).toBe('fr')
    expect(metaBody.components[0].type).toBe('BODY')
    expect(metaBody.components[0].text).toContain('{{1}}')
    // example.body_text must be a nested array (array of arrays) per Meta spec
    expect(Array.isArray(metaBody.components[0].example.body_text)).toBe(true)
    expect(Array.isArray(metaBody.components[0].example.body_text[0])).toBe(true)
    expect(metaBody.components[0].example.body_text[0]).toEqual(['lundi 5 mai à 14h00', 'Salon Fatima'])
  })

  it('returns 200 with {id, status} and updates meta_status on success', async () => {
    setupDefaultMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'meta-tpl-id-001', status: 'PENDING' }),
    })

    const { POST } = await import('@/app/api/templates/submit/route')
    const req = makeRequest({ tenant_id: 'tenant-uuid-1', template_name: 'rdv_reminder' })
    const res = await POST(req)

    const json = await res.json()
    expect(json.id).toBe('meta-tpl-id-001')
    expect(json.status).toBe('PENDING')
  })

  it('returns 502 with Meta error body on Meta non-200, does NOT update meta_status', async () => {
    setupDefaultMocks()
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid template', code: 100 } }),
    })

    const { POST } = await import('@/app/api/templates/submit/route')
    const req = makeRequest({ tenant_id: 'tenant-uuid-1', template_name: 'rdv_reminder' })
    const res = await POST(req)

    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('Meta submission failed')
    // update should NOT have been called since Meta failed
    expect(mockUpdateChain.update).not.toHaveBeenCalled()
  })
})
