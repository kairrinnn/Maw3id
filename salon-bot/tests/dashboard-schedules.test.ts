import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Supabase server mock ---
const mockUpsert = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getClaims: vi.fn(() =>
          Promise.resolve({
            data: { claims: { tenant_id: 'tenant-uuid-1' } },
          })
        ),
      },
      from: mockFrom,
    })
  ),
}))

const mockRevalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  get revalidatePath() { return mockRevalidatePath },
}))

// Helper: build FormData with 7 days using sensible defaults
// Each override can replace specific fields for a given day
function makeFormData(
  overrides: Record<string, string | undefined> = {}
): FormData {
  const fd = new FormData()
  for (let day = 0; day <= 6; day++) {
    // Default: closed on Sunday (day 0), open otherwise
    const closedDefault = day === 0 ? 'on' : undefined
    const openDefault = '09:00'
    const closeDefault = '18:00'

    const closed = overrides[`day_${day}_closed`] ?? closedDefault
    const openTime = overrides[`day_${day}_open_time`] ?? openDefault
    const closeTime = overrides[`day_${day}_close_time`] ?? closeDefault

    if (closed !== undefined) fd.set(`day_${day}_closed`, closed)
    if (openTime !== undefined) fd.set(`day_${day}_open_time`, openTime)
    if (closeTime !== undefined) fd.set(`day_${day}_close_time`, closeTime)
  }
  return fd
}

describe('DASH-02: Schedules upsert via Server Action', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockUpsert.mockReset()
    mockRevalidatePath.mockReset()

    // Default: upsert succeeds
    const chain: Record<string, unknown> = {}
    mockUpsert.mockResolvedValue({ data: null, error: null })
    chain.upsert = mockUpsert
    mockFrom.mockReturnValue(chain)
  })

  it('saves all 7 days: upsert called once with array of 7 rows and onConflict arg', async () => {
    const { saveSchedules } = await import('@/app/(dashboard)/schedules/actions')
    const fd = makeFormData()
    const result = await saveSchedules(null, fd)

    expect(mockFrom).toHaveBeenCalledWith('schedules')
    expect(mockUpsert).toHaveBeenCalledOnce()

    const [rows, opts] = mockUpsert.mock.calls[0]
    expect(rows).toHaveLength(7)
    expect(opts).toEqual({ onConflict: 'tenant_id,day_of_week' })
    rows.forEach((row: { tenant_id: string }) => {
      expect(row.tenant_id).toBe('tenant-uuid-1')
    })
    expect(result).toEqual({ success: true })
  })

  it('returns { error: "Non autorisé" } and never calls from() when tenant_id missing', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getClaims: vi.fn(() =>
          Promise.resolve({ data: { claims: null } })
        ),
      },
      from: mockFrom,
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    const { saveSchedules } = await import('@/app/(dashboard)/schedules/actions')
    const fd = makeFormData()
    const result = await saveSchedules(null, fd)

    expect(result).toEqual({ error: 'Non autorisé' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns error containing "doit précéder" when open_time >= close_time on non-closed day', async () => {
    const { saveSchedules } = await import('@/app/(dashboard)/schedules/actions')
    // Day 1 = Lundi: open 09:00, close 08:00 (invalid)
    const fd = makeFormData({
      day_1_open_time: '09:00',
      day_1_close_time: '08:00',
    })
    const result = await saveSchedules(null, fd)

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('doit précéder')
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('closed=true day skips time validation and upsert IS called with closed row', async () => {
    const { saveSchedules } = await import('@/app/(dashboard)/schedules/actions')
    // Override Dimanche (day 0): already closed by default in makeFormData
    // Set open/close to empty to confirm time validation is bypassed
    const fd = makeFormData({
      day_0_closed: 'on',
      day_0_open_time: '',
      day_0_close_time: '',
    })
    const result = await saveSchedules(null, fd)

    expect(mockUpsert).toHaveBeenCalledOnce()
    const [rows] = mockUpsert.mock.calls[0]
    const sundayRow = (rows as Array<{ day_of_week: number; closed: boolean }>).find(
      r => r.day_of_week === 0
    )
    expect(sundayRow?.closed).toBe(true)
    expect(result).toEqual({ success: true })
  })

  it('revalidatePath("/schedules") is called once on success', async () => {
    const { saveSchedules } = await import('@/app/(dashboard)/schedules/actions')
    const fd = makeFormData()
    await saveSchedules(null, fd)

    expect(mockRevalidatePath).toHaveBeenCalledOnce()
    expect(mockRevalidatePath).toHaveBeenCalledWith('/schedules')
  })
})
