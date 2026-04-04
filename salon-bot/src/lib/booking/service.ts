import type { SupabaseClient } from '@supabase/supabase-js'

export interface CreateBookingParams {
  tenantId: string
  serviceId: string
  staffId?: string | null
  clientWaId: string
  clientName?: string | null
  conversationId?: string | null
  appointmentAt: string  // TIMESTAMPTZ string, e.g. "2026-04-07T14:00:00+01:00"
}

export interface BookingRow {
  id: string
  tenant_id: string
  service_id: string
  staff_id: string | null
  client_wa_id: string
  client_name: string | null
  conversation_id: string | null
  appointment_at: string
  status: string
  created_at: string
  services?: { name: string }
}

export interface BookingResult {
  booking: BookingRow | null
  conflict: boolean
}

export async function createBooking(
  supabase: SupabaseClient,
  params: CreateBookingParams
): Promise<BookingResult> {
  const { data, error } = await supabase.rpc('create_booking', {
    p_tenant_id: params.tenantId,
    p_service_id: params.serviceId,
    p_staff_id: params.staffId ?? null,
    p_client_wa_id: params.clientWaId,
    p_client_name: params.clientName ?? null,
    p_conversation_id: params.conversationId ?? null,
    p_appointment_at: params.appointmentAt,
  })

  if (error) {
    if (error.code === '23505') {
      return { booking: null, conflict: true }
    }
    throw new Error(`createBooking failed: ${error.message}`)
  }

  return { booking: data as BookingRow, conflict: false }
}

export async function cancelBooking(
  supabase: SupabaseClient,
  tenantId: string,
  bookingId: string
): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .eq('status', 'confirmed')

  if (error) {
    throw new Error(`cancelBooking failed: ${error.message}`)
  }
}

export async function modifyBooking(
  supabase: SupabaseClient,
  tenantId: string,
  bookingId: string,
  newAppointmentAt: string
): Promise<BookingResult> {
  const { data, error } = await supabase
    .from('bookings')
    .update({ appointment_at: newAppointmentAt })
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .eq('status', 'confirmed')
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { booking: null, conflict: true }
    }
    throw new Error(`modifyBooking failed: ${error.message}`)
  }

  return { booking: data as BookingRow, conflict: false }
}

export async function getUpcomingBookings(
  supabase: SupabaseClient,
  tenantId: string,
  clientWaId: string
): Promise<BookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, tenant_id, service_id, staff_id, client_wa_id, client_name, conversation_id, appointment_at, status, created_at, services(name)')
    .eq('tenant_id', tenantId)
    .eq('client_wa_id', clientWaId)
    .eq('status', 'confirmed')
    .gte('appointment_at', new Date().toISOString())
    .order('appointment_at', { ascending: true })
    .limit(5)

  if (error) {
    throw new Error(`getUpcomingBookings failed: ${error.message}`)
  }

  return (data ?? []).map((b: any) => ({
    ...b,
    services: Array.isArray(b.services) ? b.services[0] : b.services,
  })) as BookingRow[]
}
