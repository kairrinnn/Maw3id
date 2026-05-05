import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Supabase auth mock setup ---
// Controls whether claims include tenant_id or not
let mockTenantId: string | null = 'TENANT_A'

// Chainable query chain for insert
function buildInsertChain(returnValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.insert = vi.fn(() => Promise.resolve(returnValue))
  return chain
}

// Chainable query chain for update().eq().eq()
function buildUpdateEqChain(returnValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {}
  // update returns chain, each eq returns chain, last eq resolves
  let eqCallCount = 0
  chain.update = vi.fn(() => chain)
  chain.eq = vi.fn(() => {
    eqCallCount++
    if (eqCallCount >= 2) {
      eqCallCount = 0
      return Promise.resolve(returnValue)
    }
    return chain
  })
  return chain
}

// Store references for assertions
let mockInsertChain: ReturnType<typeof buildInsertChain>
let mockUpdateChain: ReturnType<typeof buildUpdateEqChain>
let mockDeleteChain: ReturnType<typeof buildUpdateEqChain>

const mockFrom = vi.fn()
const mockGetClaims = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: mockGetClaims,
    },
    from: mockFrom,
  })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Helper: reset mocks before each test
function setupMocks({ tenantId = 'TENANT_A' as string | null } = {}) {
  mockTenantId = tenantId
  mockGetClaims.mockResolvedValue({
    data: {
      claims: tenantId ? { tenant_id: tenantId } : {},
    },
  })

  mockInsertChain = buildInsertChain({ data: null, error: null })
  mockUpdateChain = buildUpdateEqChain({ data: null, error: null })
  mockDeleteChain = buildUpdateEqChain({ data: null, error: null })

  let updateCallCount = 0
  mockFrom.mockImplementation((table: string) => {
    if (table === 'services') {
      // Distinguish between update calls (updateService vs deleteService)
      // by returning a fresh chain each time
      updateCallCount++
      if (updateCallCount === 1) return mockUpdateChain
      return mockDeleteChain
    }
    return mockInsertChain
  })
}

describe('DASH-01: Services CRUD via Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createService inserts row with tenant_id from JWT claims', async () => {
    setupMocks({ tenantId: 'TENANT_A' })

    // Override mockFrom to track insert specifically
    const insertMock = vi.fn(() => Promise.resolve({ data: null, error: null }))
    mockFrom.mockReturnValue({ insert: insertMock })

    const { createService } = await import('@/app/(dashboard)/services/actions')
    const formData = new FormData()
    formData.set('name', 'Coupe')
    formData.set('duration_minutes', '30')
    formData.set('price_mad', '150')

    const result = await createService(null, formData)
    expect(result).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('services')
    expect(insertMock).toHaveBeenCalledWith({
      tenant_id: 'TENANT_A',
      name: 'Coupe',
      duration_minutes: 30,
      price_mad: 150,
    })
  })

  it('createService returns { error } when tenant_id is null in claims', async () => {
    setupMocks({ tenantId: null })

    const { createService } = await import('@/app/(dashboard)/services/actions')
    const formData = new FormData()
    formData.set('name', 'Coupe')
    formData.set('duration_minutes', '30')

    const result = await createService(null, formData)
    expect('error' in result).toBe(true)
    expect((result as { error: string }).error).toBe('Non autorisé')
  })

  it('createService returns Zod field errors for invalid duration/price', async () => {
    setupMocks({ tenantId: 'TENANT_A' })

    const { createService } = await import('@/app/(dashboard)/services/actions')
    const formData = new FormData()
    formData.set('name', '') // empty name
    formData.set('duration_minutes', '30')

    const result = await createService(null, formData)
    expect('error' in result).toBe(true)
    const errorResult = result as { error: Record<string, string[]> }
    expect(typeof errorResult.error).toBe('object')
    expect(errorResult.error).toHaveProperty('name')
  })

  it('updateService updates correct row by id and tenant_id', async () => {
    setupMocks({ tenantId: 'TENANT_A' })

    const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440000'
    let capturedUpdateArg: unknown = null
    let eqCalls: Array<[string, string]> = []

    const mockChain: Record<string, unknown> = {}
    mockChain.update = vi.fn((arg: unknown) => {
      capturedUpdateArg = arg
      return mockChain
    })
    mockChain.eq = vi.fn((col: string, val: string) => {
      eqCalls.push([col, val])
      if (eqCalls.length >= 2) {
        return Promise.resolve({ data: null, error: null })
      }
      return mockChain
    })
    mockFrom.mockReturnValue(mockChain)

    const { updateService } = await import('@/app/(dashboard)/services/actions')
    const formData = new FormData()
    formData.set('id', SERVICE_ID)
    formData.set('name', 'Coupe Femme')
    formData.set('duration_minutes', '45')
    formData.set('price_mad', '200')

    const result = await updateService(null, formData)
    expect(result).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('services')
    expect(mockChain.update).toHaveBeenCalledWith({
      name: 'Coupe Femme',
      duration_minutes: 45,
      price_mad: 200,
    })
    expect(eqCalls).toContainEqual(['id', SERVICE_ID])
    expect(eqCalls).toContainEqual(['tenant_id', 'TENANT_A'])
  })

  it('deleteService sets active=false (soft delete, not hard DELETE)', async () => {
    setupMocks({ tenantId: 'TENANT_A' })

    const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440001'
    let capturedUpdateArg: unknown = null

    const mockChain: Record<string, unknown> = {}
    mockChain.update = vi.fn((arg: unknown) => {
      capturedUpdateArg = arg
      return mockChain
    })
    let eqCount = 0
    mockChain.eq = vi.fn(() => {
      eqCount++
      if (eqCount >= 2) {
        return Promise.resolve({ data: null, error: null })
      }
      return mockChain
    })
    // Intentionally NOT adding .delete to the chain — if implementation calls .delete() it will throw
    mockFrom.mockReturnValue(mockChain)

    const { deleteService } = await import('@/app/(dashboard)/services/actions')
    const formData = new FormData()
    formData.set('id', SERVICE_ID)

    const result = await deleteService(null, formData)
    expect(result).toEqual({ success: true })
    // Must call update({ active: false }) not delete()
    expect(mockChain.update).toHaveBeenCalledWith({ active: false })
    expect(mockChain).not.toHaveProperty('delete')
  })

  it('actions call revalidatePath("/services") on success', async () => {
    const { revalidatePath } = await import('next/cache')
    const revalidatePathMock = revalidatePath as ReturnType<typeof vi.fn>
    revalidatePathMock.mockClear()

    setupMocks({ tenantId: 'TENANT_A' })

    const insertMock = vi.fn(() => Promise.resolve({ data: null, error: null }))
    mockFrom.mockReturnValue({ insert: insertMock })

    const { createService } = await import('@/app/(dashboard)/services/actions')
    const formData = new FormData()
    formData.set('name', 'Brushing')
    formData.set('duration_minutes', '30')

    await createService(null, formData)
    expect(revalidatePathMock).toHaveBeenCalledWith('/services')
  })
})
