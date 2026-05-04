import { createServiceClient } from '@/lib/supabase/service'
import { sendTemplateMessage } from '@/lib/whatsapp/send'

/**
 * POST /api/reminders/send
 *
 * Cron target called every 5 minutes by pg_cron (via pg_net on hosted Supabase).
 * Queries bookings due for a 24h reminder (appointment_at in the next 23-25h window),
 * sends the Meta-approved rdv_reminder template, and marks reminder_sent=true.
 *
 * Idempotency: optimistic-lock UPDATE with .eq('reminder_sent', false) guard and
 * count:'exact' — concurrent cron runs cannot double-send the same booking.
 * Rollback: on Meta send failure, reminder_sent is reset to false so the next
 * cron run retries.
 *
 * Auth: requires x-cron-secret header matching CRON_SECRET env var.
 */
export async function POST(request: Request) {
  // 1. Auth gate — shared secret between pg_cron and this route
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString()
  const windowEnd   = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()

  // 2. Query bookings due for a 24h reminder
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, tenant_id, client_wa_id, appointment_at, service_id')
    .eq('status', 'confirmed')
    .eq('reminder_sent', false)
    .gte('appointment_at', windowStart)
    .lte('appointment_at', windowEnd)

  let sent = 0

  for (const booking of bookings ?? []) {
    // 3. Fetch tenant's active phone number
    const { data: phoneRow } = await supabase
      .from('phone_numbers')
      .select('phone_number_id')
      .eq('tenant_id', booking.tenant_id)
      .eq('status', 'active')
      .single()

    if (!phoneRow) continue

    // 4. Fetch APPROVED reminder template for tenant
    const { data: tpl } = await supabase
      .from('whatsapp_templates')
      .select('template_name, language')
      .eq('tenant_id', booking.tenant_id)
      .eq('template_name', 'rdv_reminder')
      .eq('meta_status', 'APPROVED')
      .single()

    if (!tpl) continue

    // 5. Fetch salon name for template variable {{2}}
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', booking.tenant_id)
      .single()

    const salonName = tenantRow?.name ?? 'le salon'

    // 6. Format appointment datetime in Morocco timezone for template variable {{1}}
    const dt = new Date(booking.appointment_at)
    const dateTimeStr = dt.toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Casablanca',
    })

    // 7. OPTIMISTIC LOCK — claim the booking before sending
    // Using count:'exact' as second arg to .update() (Supabase JS v2 pattern)
    // If count === 0, another cron worker already claimed this booking — skip
    const { count } = await supabase
      .from('bookings')
      .update({ reminder_sent: true }, { count: 'exact' })
      .eq('id', booking.id)
      .eq('reminder_sent', false)

    if (count === 0) {
      // Another worker beat us to this booking — skip Meta send
      continue
    }

    // 8. Send template — rollback on failure so next cron run retries
    try {
      await sendTemplateMessage({
        to: booking.client_wa_id,
        templateName: tpl.template_name,
        languageCode: tpl.language,
        phoneNumberId: phoneRow.phone_number_id,
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: dateTimeStr },   // {{1}} — appointment datetime
              { type: 'text', text: salonName },     // {{2}} — salon name
            ],
          },
        ],
      })
      sent++
    } catch (err) {
      // Rollback reminder_sent so the next cron run retries this booking
      await supabase
        .from('bookings')
        .update({ reminder_sent: false })
        .eq('id', booking.id)
      console.error('[reminders] send failed for booking', booking.id, err)
    }
  }

  return Response.json({ sent }, { status: 200 })
}
