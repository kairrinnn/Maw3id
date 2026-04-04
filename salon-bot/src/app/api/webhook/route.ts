import { createServiceClient } from '@/lib/supabase/service'
import { sendTextMessage } from '@/lib/whatsapp/send'
import { verifyWebhookSignature } from '@/lib/whatsapp/verify'
import type { WebhookPayload, WebhookMessage } from '@/lib/whatsapp/types'
import { extractIntent } from '@/lib/llm/intent'
import { processIntent } from '@/lib/fsm/machine'
import { loadConversationState, saveConversationState } from '@/lib/fsm/state'
import { createBooking, cancelBooking, modifyBooking, getUpcomingBookings } from '@/lib/booking/service'
import type { Service } from '@/lib/llm/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  if (process.env.SKIP_WEBHOOK_SIGNATURE !== 'true') {
    const signature = request.headers.get('x-hub-signature-256') ?? ''
    const appSecret = process.env.WHATSAPP_APP_SECRET ?? ''
    if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  let body: WebhookPayload
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response('OK', { status: 200 })
  }

  const value = body.entry?.[0]?.changes?.[0]?.value
  if (!value?.messages?.length) {
    return new Response('OK', { status: 200 })
  }

  const phoneNumberId = value.metadata.phone_number_id
  const supabase = createServiceClient()

  const { data: phoneRow } = await supabase
    .from('phone_numbers')
    .select('tenant_id')
    .eq('phone_number_id', phoneNumberId)
    .eq('status', 'active')
    .single()

  if (!phoneRow) {
    console.warn('[webhook] Unknown phone_number_id:', phoneNumberId)
    return new Response('OK', { status: 200 })
  }

  const { tenant_id } = phoneRow

  const { data: botConfig } = await supabase
    .from('bot_configs')
    .select('active, owner_notification_wa_id')
    .eq('tenant_id', tenant_id)
    .single()

  if (!botConfig?.active) {
    return new Response('OK', { status: 200 })
  }

  for (const message of value.messages) {
    await processMessage(supabase, tenant_id, message, phoneNumberId, botConfig)
  }

  return new Response('OK', { status: 200 })
}

async function processMessage(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  message: WebhookMessage,
  phoneNumberId: string,
  botConfig: { active: boolean; owner_notification_wa_id: string | null }
) {
  // Timezone: Morocco (UTC+1, no DST). All appointment_at use +01:00 offset.
  const wamid = message.id
  const clientWaId = message.from

  const { count } = await supabase
    .from('processed_messages')
    .upsert(
      { wamid, tenant_id: tenantId },
      { onConflict: 'wamid', ignoreDuplicates: true, count: 'exact' }
    )

  if (count === 0) {
    console.warn('[webhook] Duplicate wamid skipped:', wamid)
    return
  }

  // Capture conversation_id for booking link
  const { data: convRow } = await supabase
    .from('conversations')
    .upsert(
      {
        tenant_id: tenantId,
        wa_id: clientWaId,
        last_customer_message_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,wa_id', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  const conversationId = convRow?.id ?? null

  if (message.type !== 'text') {
    await sendTextMessage(clientWaId, 'Je ne peux traiter que les messages texte pour le moment.', phoneNumberId)
    return
  }

  const userText = message.text.body
  try {
    const { data: services } = await supabase
      .from('services')
      .select('id, tenant_id, name, duration_minutes, price_mad, active')
      .eq('tenant_id', tenantId)
      .eq('active', true)

    const activeServices: Service[] = (services as Service[]) ?? []
    const state = await loadConversationState(supabase, tenantId, clientWaId)
    const intent = await extractIntent(userText, state, activeServices)
    const { nextState, replyText } = processIntent(state, intent, activeServices, userText)

    // --- BOOKING CREATION (confirming -> confirmed) ---
    if (nextState.step === 'confirmed' && state.step === 'confirming') {
      const result = await createBooking(supabase, {
        tenantId,
        serviceId: nextState.service_id!,
        clientWaId,
        clientName: nextState.client_name ?? null,
        conversationId,
        appointmentAt: `${nextState.date}T${nextState.time}:00+01:00`,
      })

      if (result.conflict) {
        await sendTextMessage(
          clientWaId,
          'Desole, ce creneau est deja pris. Voulez-vous choisir une autre heure?',
          phoneNumberId
        )
        await saveConversationState(supabase, tenantId, clientWaId, {
          ...state,
          step: 'awaiting_datetime',
        })
        return
      }

      const stateWithBooking = { ...nextState, booking_id: result.booking!.id }
      await saveConversationState(supabase, tenantId, clientWaId, stateWithBooking)
      await sendTextMessage(clientWaId, replyText, phoneNumberId)
      return
    }

    // --- MODIFICATION CONFIRMATION (confirming_modify -> confirmed) ---
    if (nextState.step === 'confirmed' && state.step === 'confirming_modify') {
      const newAppointmentAt = `${nextState.date}T${nextState.time}:00+01:00`
      const result = await modifyBooking(supabase, tenantId, state.booking_id!, newAppointmentAt)

      if (result.conflict) {
        await sendTextMessage(
          clientWaId,
          'Desole, ce nouveau creneau est deja pris. Voulez-vous choisir une autre heure?',
          phoneNumberId
        )
        await saveConversationState(supabase, tenantId, clientWaId, {
          ...state,
          step: 'modify_awaiting_datetime',
          date: undefined,
          time: undefined,
        })
        return
      }

      await saveConversationState(supabase, tenantId, clientWaId, nextState)
      await sendTextMessage(clientWaId, replyText, phoneNumberId)
      return
    }

    // --- MODIFICATION REFUSED (confirming_modify -> confirmed_modify_abandoned) ---
    // "non" path: client declined the modification — normalize back to 'confirmed', no DB update
    if (nextState.step === 'confirmed_modify_abandoned' && state.step === 'confirming_modify') {
      await saveConversationState(supabase, tenantId, clientWaId, {
        ...nextState,
        step: 'confirmed',
      })
      await sendTextMessage(clientWaId, replyText, phoneNumberId)
      return
    }

    // --- CANCELLATION (confirmed -> cancelling) ---
    if (nextState.step === 'cancelling' && state.booking_id) {
      await cancelBooking(supabase, tenantId, state.booking_id)

      await saveConversationState(supabase, tenantId, clientWaId, {
        step: 'cancelled',
        status: 'failed',
      })
      await sendTextMessage(clientWaId, replyText, phoneNumberId)

      // Owner notification — fire and forget, must NOT break client flow
      if (botConfig.owner_notification_wa_id) {
        try {
          const notifMsg = `[Annulation] ${clientWaId} a annule son RDV: ${state.service_name} le ${state.date} a ${state.time}.`
          await sendTextMessage(
            botConfig.owner_notification_wa_id,
            notifMsg,
            phoneNumberId
          )
        } catch (notifErr) {
          console.error('[webhook] Owner notification failed:', notifErr)
        }
      }
      return
    }

    // --- QUERY (replace placeholder with formatted bookings) ---
    if (replyText === 'UPCOMING_BOOKINGS_PLACEHOLDER') {
      const bookings = await getUpcomingBookings(supabase, tenantId, clientWaId)

      let formattedReply: string
      if (bookings.length === 0) {
        formattedReply = "Vous n'avez aucun rendez-vous a venir."
      } else {
        const lines = bookings.map((b, i) => {
          const serviceName = b.services?.name ?? 'Service'
          const dt = new Date(b.appointment_at)
          const dateStr = dt.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: 'Africa/Casablanca',
          })
          const timeStr = dt.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Casablanca',
          })
          return `${i + 1}. ${serviceName} - ${dateStr} a ${timeStr}`
        })
        formattedReply = `Vos prochains rendez-vous:\n${lines.join('\n')}`
      }

      await saveConversationState(supabase, tenantId, clientWaId, nextState)
      await sendTextMessage(clientWaId, formattedReply, phoneNumberId)
      return
    }

    // --- DEFAULT: standard FSM flow (no booking action needed) ---
    await saveConversationState(supabase, tenantId, clientWaId, nextState)
    await sendTextMessage(clientWaId, replyText, phoneNumberId)
  } catch (err) {
    console.error('[webhook] processMessage error:', err)
    await sendTextMessage(clientWaId, "Desole, une erreur s'est produite. Veuillez reessayer.", phoneNumberId)
  }
}
