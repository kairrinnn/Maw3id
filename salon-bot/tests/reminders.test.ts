import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted — vi.mock factories must not reference outer variables)
// ---------------------------------------------------------------------------

vi.mock('@/lib/whatsapp/send', () => ({
  sendTemplateMessage: vi.fn().mockResolvedValue('wamid.OUT.X'),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: vi.fn() })),
}))

// Stub env vars
vi.stubEnv('CRON_SECRET', 'super-secret-cron-token')
vi.stubEnv('WHATSAPP_API_TOKEN', 'test-token')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')

// ---------------------------------------------------------------------------
// Import after mocks — then grab typed mock references
// ---------------------------------------------------------------------------

import { POST } from '@/app/api/reminders/send/route'
import { sendTemplateMessage } from '@/lib/whatsapp/send'
import { createServiceClient } from '@/lib/supabase/service'

// Typed references to hoisted mocks
const mockSendTemplateMessage = vi.mocked(sendTemplateMessage)
const mockFrom = vi.fn()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Request to POST /api/reminders/send */
function makeRequest(opts: { secret?: string | null; omitHeader?: boolean } = {}) {
  const headers: Record<string, string> = {}
  if (!opts.omitHeader) {
    headers['x-cron-secret'] = opts.secret ?? 'super-secret-cron-token'
  }
  return new Request('http://localhost:3000/api/reminders/send', {
    method: 'POST',
    headers,
    body: '{}',
  })
}

/** Booking fixture due 24h from the fixed fake time (2026-05-05T10:00:00Z) */
const FIXED_NOW = new Date('2026-05-04T10:00:00Z')
const DUE_AT = new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000).toISOString() // 2026-05-05T10:00:00Z

const bookingFixture = {
  id: 'booking-uuid-1',
  tenant_id: 'tenant-uuid-1',
  client_wa_id: '212600000001',
  appointment_at: DUE_AT,
  service_id: 'service-uuid-1',
}

const phoneRowFixture = { phone_number_id: 'PHONE_NUM_ID_001' }
const templateFixture = { template_name: 'rdv_reminder', language: 'fr' }
const tenantFixture = { name: 'Salon Test Casablanca' }

// ---------------------------------------------------------------------------
// Chain builders
// ---------------------------------------------------------------------------

/** Build a bookings select chain returning the provided rows */
function buildBookingsSelectChain(rows: unknown[]) {
  const mockGte = vi.fn()
  const mockLte = vi.fn()
  const mockEq2 = vi.fn(() => ({ gte: mockGte, lte: mockLte }))
  const mockEq1 = vi.fn(() => ({ eq: mockEq2 }))
  const mockSelect = vi.fn(() => ({ eq: mockEq1 }))

  mockGte.mockImplementation(() => ({ lte: mockLte }))
  mockLte.mockResolvedValue({ data: rows, error: null })

  return { select: mockSelect, eq: mockEq1, gte: mockGte, lte: mockLte }
}

/** Build a .single()-resolving chain */
function buildSingleChain(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error })
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.single = single
  return chain
}

/** Build an update chain returning count.
 * Handles: .update({reminder_sent: true}, {count:'exact'}).eq('id', x).eq('reminder_sent', false) -> {count}
 */
function buildUpdateChain(count: number) {
  const mockEqLast = vi.fn().mockResolvedValue({ count, error: null })
  const mockEqFirst = vi.fn(() => ({ eq: mockEqLast }))
  const mockUpdate = vi.fn(() => ({ eq: mockEqFirst }))
  return { update: mockUpdate, _eqFirst: mockEqFirst, _eqLast: mockEqLast }
}

/** Build a rollback update chain (.update().eq() -> resolves) */
function buildRollbackChain() {
  const mockEq = vi.fn().mockResolvedValue({ data: null, error: null })
  const mockUpdate = vi.fn(() => ({ eq: mockEq }))
  return { update: mockUpdate, _eq: mockEq }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let mockGteCapture: ReturnType<typeof vi.fn>
let mockLteCapture: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
  vi.clearAllMocks()
  mockFrom.mockReset()
  mockSendTemplateMessage.mockResolvedValue('wamid.OUT.X')
  // Wire mockFrom into the createServiceClient mock
  vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as unknown as ReturnType<typeof createServiceClient>)
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Default mock factory (happy-path defaults; override per test as needed)
// ---------------------------------------------------------------------------

function setupHappyPath(opts: {
  bookings?: unknown[]
  phoneRow?: unknown
  tpl?: unknown
  tenant?: unknown
  updateCount?: number
} = {}) {
  // Use 'in' check so callers can pass null explicitly to simulate missing rows
  const bookings = 'bookings' in opts ? opts.bookings! : [bookingFixture]
  const phoneRow = 'phoneRow' in opts ? opts.phoneRow : phoneRowFixture
  const tpl = 'tpl' in opts ? opts.tpl : templateFixture
  const tenant = 'tenant' in opts ? opts.tenant : tenantFixture
  const updateCount = opts.updateCount ?? 1

  // Build chains
  const bookingsChain = buildBookingsSelectChain(bookings)
  mockGteCapture = bookingsChain.gte
  mockLteCapture = bookingsChain.lte

  const phoneChain = buildSingleChain(phoneRow)
  const tplChain = buildSingleChain(tpl)
  const tenantChain = buildSingleChain(tenant)
  const updateChain = buildUpdateChain(updateCount)

  // Table dispatch
  let bookingsCallCount = 0
  mockFrom.mockImplementation((table: string) => {
    if (table === 'bookings') {
      bookingsCallCount++
      if (bookingsCallCount === 1) return bookingsChain          // initial select
      if (bookingsCallCount === 2) return updateChain             // claim
      if (bookingsCallCount === 3) return buildRollbackChain()   // rollback (only on failure)
    }
    if (table === 'phone_numbers') return phoneChain
    if (table === 'whatsapp_templates') return tplChain
    if (table === 'tenants') return tenantChain
    return buildSingleChain(null)
  })

  return { bookingsChain, phoneChain, tplChain, tenantChain, updateChain }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/reminders/send', () => {

  // --- Auth gate ---

  it('returns 401 when x-cron-secret header is missing', async () => {
    const req = makeRequest({ omitHeader: true })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns 401 when x-cron-secret header value does not match CRON_SECRET', async () => {
    const req = makeRequest({ secret: 'wrong-secret' })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  // --- No bookings ---

  it('returns 200 with {sent: 0} when no bookings are due', async () => {
    setupHappyPath({ bookings: [] })
    const req = makeRequest()
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: 0 })
    expect(mockSendTemplateMessage).not.toHaveBeenCalled()
  })

  // --- Window calculation ---

  it('queries bookings using now+23h to now+25h window', async () => {
    setupHappyPath({ bookings: [] })
    const req = makeRequest()
    await POST(req)

    // gte should be called with now+23h, lte with now+25h
    const expectedGte = new Date(FIXED_NOW.getTime() + 23 * 60 * 60 * 1000).toISOString()
    const expectedLte = new Date(FIXED_NOW.getTime() + 25 * 60 * 60 * 1000).toISOString()

    // Allow ±15 minutes tolerance (900_000 ms)
    expect(mockGteCapture).toHaveBeenCalledOnce()
    const gteArg = mockGteCapture.mock.calls[0][1] as string
    const gteDiff = Math.abs(new Date(gteArg).getTime() - new Date(expectedGte).getTime())
    expect(gteDiff).toBeLessThan(900_000)

    expect(mockLteCapture).toHaveBeenCalledOnce()
    const lteArg = mockLteCapture.mock.calls[0][1] as string
    const lteDiff = Math.abs(new Date(lteArg).getTime() - new Date(expectedLte).getTime())
    expect(lteDiff).toBeLessThan(900_000)
  })

  // --- Happy path ---

  it('happy path: calls sendTemplateMessage with correct payload and returns {sent: 1}', async () => {
    setupHappyPath()
    const req = makeRequest()
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: 1 })

    expect(mockSendTemplateMessage).toHaveBeenCalledOnce()
    const payload = mockSendTemplateMessage.mock.calls[0][0]
    expect(payload.to).toBe(bookingFixture.client_wa_id)
    expect(payload.templateName).toBe('rdv_reminder')
    expect(payload.languageCode).toBe('fr')
    expect(payload.phoneNumberId).toBe(phoneRowFixture.phone_number_id)
    // components: body with 2 parameters
    expect(payload.components).toBeDefined()
    const components = payload.components!
    expect(components[0].type).toBe('body')
    expect(components[0].parameters).toHaveLength(2)
    // param[0] = datetime (should contain 'mai' for May)
    expect(components[0].parameters![0].type).toBe('text')
    expect(components[0].parameters![0].text).toEqual(expect.stringContaining('mai'))
    // param[1] = salon name
    expect(components[0].parameters![1].type).toBe('text')
    expect(components[0].parameters![1].text).toBe(tenantFixture.name)
  })

  // --- No approved template → skip ---

  it('skips booking when no APPROVED whatsapp_templates row exists for tenant', async () => {
    setupHappyPath({ tpl: null })
    const req = makeRequest()
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: 0 })
    expect(mockSendTemplateMessage).not.toHaveBeenCalled()
  })

  // --- No active phone number → skip ---

  it('skips booking when tenant has no active phone_numbers row', async () => {
    setupHappyPath({ phoneRow: null })
    const req = makeRequest()
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: 0 })
    expect(mockSendTemplateMessage).not.toHaveBeenCalled()
  })

  // --- Race condition: claim returns count=0 → skip ---

  it('does not call sendTemplateMessage when optimistic-lock update returns count=0', async () => {
    setupHappyPath({ updateCount: 0 })
    const req = makeRequest()
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: 0 })
    expect(mockSendTemplateMessage).not.toHaveBeenCalled()
  })

  // --- Claim update uses reminder_sent=true with count:'exact' guard ---

  it('claim update sets reminder_sent=true with count exact option', async () => {
    const { updateChain } = setupHappyPath()
    const req = makeRequest()
    await POST(req)

    // The update call should set reminder_sent: true
    expect(updateChain.update).toHaveBeenCalledWith(
      { reminder_sent: true },
      { count: 'exact' }
    )
    // And the second .eq() call guards on reminder_sent: false
    expect(updateChain._eqLast).toHaveBeenCalledWith('reminder_sent', false)
  })

  // --- Rollback on Meta failure ---

  it('rolls back reminder_sent to false when sendTemplateMessage throws', async () => {
    // Track update calls via a separate spy
    const rollbackUpdateSpy = vi.fn()
    const rollbackEqSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    rollbackUpdateSpy.mockReturnValue({ eq: rollbackEqSpy })

    const bookingsChain = buildBookingsSelectChain([bookingFixture])
    mockGteCapture = bookingsChain.gte
    mockLteCapture = bookingsChain.lte

    const claimUpdateChain = buildUpdateChain(1)

    let bookingsCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bookings') {
        bookingsCallCount++
        if (bookingsCallCount === 1) return bookingsChain
        if (bookingsCallCount === 2) return claimUpdateChain
        // 3rd call = rollback
        return { update: rollbackUpdateSpy }
      }
      if (table === 'phone_numbers') return buildSingleChain(phoneRowFixture)
      if (table === 'whatsapp_templates') return buildSingleChain(templateFixture)
      if (table === 'tenants') return buildSingleChain(tenantFixture)
      return buildSingleChain(null)
    })

    mockSendTemplateMessage.mockRejectedValueOnce(new Error('Meta API error: 500'))

    const req = makeRequest()
    const res = await POST(req)

    expect(res.status).toBe(200)
    // sendTemplateMessage was called (then failed)
    expect(mockSendTemplateMessage).toHaveBeenCalledOnce()
    // rollback update was called
    expect(rollbackUpdateSpy).toHaveBeenCalledOnce()
    expect(rollbackUpdateSpy).toHaveBeenCalledWith({ reminder_sent: false })
    // rollback eq was called with booking id
    expect(rollbackEqSpy).toHaveBeenCalledWith('id', bookingFixture.id)
    // sent count is 0 (send failed)
    const body = await res.json()
    expect(body).toEqual({ sent: 0 })
  })

})
