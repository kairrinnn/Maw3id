import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createBooking, cancelBooking, modifyBooking, getUpcomingBookings } from '@/lib/booking/service'

// --- Mock helpers ---

function makeRpcSupabase(returnValue: { data: unknown; error: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue(returnValue),
    from: vi.fn(),
  } as unknown as SupabaseClient
}

function buildChain(returnValue: { data?: unknown; error: unknown }) {
  const chain: Record<string, any> = {}
  const fn = () => chain
  chain.update = vi.fn(fn)
  chain.eq = vi.fn(fn)
  chain.select = vi.fn(fn)
  chain.single = vi.fn(() => Promise.resolve(returnValue))
  chain.gte = vi.fn(fn)
  chain.order = vi.fn(fn)
  chain.limit = vi.fn(() => Promise.resolve(returnValue))
  return chain
}

function makeFromSupabase(chain: ReturnType<typeof buildChain>) {
  return {
    rpc: vi.fn(),
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient
}

// For cancelBooking: last call in chain is .eq() which returns a promise
function buildCancelChain(returnValue: { error: unknown }) {
  let callCount = 0
  const chain: Record<string, any> = {}
  chain.update = vi.fn(() => chain)
  chain.eq = vi.fn(() => {
    callCount++
    // Third .eq() is the last one — return the result
    if (callCount >= 3) return Promise.resolve(returnValue)
    return chain
  })
  return chain
}

// --- Tests ---

describe('createBooking', () => {
  it('success — returns booking and conflict: false', async () => {
    const bookingData = {
      id: 'booking-uuid-1',
      tenant_id: 'tenant-1',
      service_id: 'service-1',
      staff_id: null,
      client_wa_id: '212600000001',
      client_name: 'Ahmed',
      conversation_id: null,
      appointment_at: '2026-04-07T14:00:00+01:00',
      status: 'confirmed',
      created_at: '2026-04-04T10:00:00Z',
    }
    const supabase = makeRpcSupabase({ data: bookingData, error: null })

    const result = await createBooking(supabase, {
      tenantId: 'tenant-1',
      serviceId: 'service-1',
      clientWaId: '212600000001',
      clientName: 'Ahmed',
      appointmentAt: '2026-04-07T14:00:00+01:00',
    })

    expect(result.conflict).toBe(false)
    expect(result.booking?.id).toBe('booking-uuid-1')
    expect((supabase.rpc as any)).toHaveBeenCalledWith('create_booking', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_appointment_at: '2026-04-07T14:00:00+01:00',
    }))
  })

  it('conflict (23505) — returns { booking: null, conflict: true }', async () => {
    const supabase = makeRpcSupabase({ data: null, error: { code: '23505', message: 'unique_violation' } })

    const result = await createBooking(supabase, {
      tenantId: 'tenant-1',
      serviceId: 'service-1',
      clientWaId: '212600000001',
      appointmentAt: '2026-04-07T14:00:00+01:00',
    })

    expect(result.conflict).toBe(true)
    expect(result.booking).toBeNull()
  })

  it('other error — throws Error', async () => {
    const supabase = makeRpcSupabase({ data: null, error: { code: '42P01', message: 'relation not found' } })

    await expect(createBooking(supabase, {
      tenantId: 'tenant-1',
      serviceId: 'service-1',
      clientWaId: '212600000001',
      appointmentAt: '2026-04-07T14:00:00+01:00',
    })).rejects.toThrow('createBooking failed')
  })
})

describe('cancelBooking', () => {
  it('success — resolves without error', async () => {
    const chain = buildCancelChain({ error: null })
    const supabase = makeFromSupabase(chain as any)

    await expect(cancelBooking(supabase, 'tenant-1', 'booking-uuid-1')).resolves.toBeUndefined()
    expect(chain.update).toHaveBeenCalledWith({ status: 'cancelled' })
  })

  it('error — throws Error', async () => {
    const chain = buildCancelChain({ error: { message: 'DB failed' } })
    const supabase = makeFromSupabase(chain as any)

    await expect(cancelBooking(supabase, 'tenant-1', 'booking-uuid-1')).rejects.toThrow('cancelBooking failed')
  })
})

describe('modifyBooking', () => {
  it('success — returns updated booking and conflict: false', async () => {
    const bookingData = {
      id: 'booking-uuid-1',
      appointment_at: '2026-04-08T16:00:00+01:00',
      status: 'confirmed',
    }
    const chain = buildChain({ data: bookingData, error: null })
    const supabase = makeFromSupabase(chain)

    const result = await modifyBooking(supabase, 'tenant-1', 'booking-uuid-1', '2026-04-08T16:00:00+01:00')

    expect(result.conflict).toBe(false)
    expect(result.booking?.id).toBe('booking-uuid-1')
    expect(chain.update).toHaveBeenCalledWith({ appointment_at: '2026-04-08T16:00:00+01:00' })
  })

  it('conflict (23505) — returns { booking: null, conflict: true }', async () => {
    const chain = buildChain({ data: null, error: { code: '23505', message: 'unique_violation' } })
    const supabase = makeFromSupabase(chain)

    const result = await modifyBooking(supabase, 'tenant-1', 'booking-uuid-1', '2026-04-08T16:00:00+01:00')

    expect(result.conflict).toBe(true)
    expect(result.booking).toBeNull()
  })
})

describe('getUpcomingBookings', () => {
  it('returns array of bookings with service names', async () => {
    const bookingsData = [
      { id: '1', appointment_at: '2026-04-07T14:00:00+01:00', services: { name: 'Coupe' }, status: 'confirmed' },
    ]
    const chain = buildChain({ data: bookingsData, error: null })
    const supabase = makeFromSupabase(chain)

    const result = await getUpcomingBookings(supabase, 'tenant-1', '212600000001')

    expect(result).toHaveLength(1)
    expect(result[0].services?.name).toBe('Coupe')
  })

  it('returns empty array when no bookings', async () => {
    const chain = buildChain({ data: [], error: null })
    const supabase = makeFromSupabase(chain)

    const result = await getUpcomingBookings(supabase, 'tenant-1', '212600000001')
    expect(result).toHaveLength(0)
  })
})
