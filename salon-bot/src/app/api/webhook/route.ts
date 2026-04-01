import { createServiceClient } from '@/lib/supabase/service'
import { sendTextMessage } from '@/lib/whatsapp/send'
import { verifyWebhookSignature } from '@/lib/whatsapp/verify'
import type { WebhookPayload, WebhookMessage } from '@/lib/whatsapp/types'

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
  // 1. Read raw body as string (required for signature verification)
  const rawBody = await request.text()

  // 2. Verify signature unless explicitly skipped (dev/test)
  if (process.env.SKIP_WEBHOOK_SIGNATURE !== 'true') {
    const signature = request.headers.get('x-hub-signature-256') ?? ''
    const appSecret = process.env.WHATSAPP_APP_SECRET ?? ''
    if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  // 3. Parse JSON after signature check
  let body: WebhookPayload
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response('OK', { status: 200 })
  }

  // Early exit: status update (delivery/read receipt) — no messages array
  const value = body.entry?.[0]?.changes?.[0]?.value
  if (!value?.messages?.length) {
    return new Response('OK', { status: 200 })
  }

  const phoneNumberId = value.metadata.phone_number_id
  const supabase = createServiceClient()

  // INFRA-05: Resolve tenant from phone_number_id
  const { data: phoneRow } = await supabase
    .from('phone_numbers')
    .select('tenant_id')
    .eq('phone_number_id', phoneNumberId)
    .eq('status', 'active')
    .single()

  if (!phoneRow) {
    // Unknown phone_number_id — log warning, return 200 (Meta must not retry)
    console.warn('[webhook] Unknown phone_number_id:', phoneNumberId)
    return new Response('OK', { status: 200 })
  }

  const { tenant_id } = phoneRow

  // Check bot is active for this tenant
  const { data: botConfig } = await supabase
    .from('bot_configs')
    .select('active')
    .eq('tenant_id', tenant_id)
    .single()

  if (!botConfig?.active) {
    return new Response('OK', { status: 200 })
  }

  // Process each message in the payload (Meta can batch)
  for (const message of value.messages) {
    await processMessage(supabase, tenant_id, message, phoneNumberId)
  }

  return new Response('OK', { status: 200 })
}

async function processMessage(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  message: WebhookMessage,
  phoneNumberId: string
) {
  const wamid = message.id
  const clientWaId = message.from

  // WA-02: Deduplicate via wamid PRIMARY KEY
  // upsert with ignoreDuplicates:true returns count=0 on conflict (already processed)
  const { count } = await supabase
    .from('processed_messages')
    .upsert(
      { wamid, tenant_id: tenantId },
      { onConflict: 'wamid', ignoreDuplicates: true, count: 'exact' }
    )

  // count === 0 means conflict — already processed, skip
  if (count === 0) {
    console.warn('[webhook] Duplicate wamid skipped:', wamid)
    return
  }

  // Upsert conversation (UNIQUE tenant_id + wa_id)
  await supabase
    .from('conversations')
    .upsert(
      {
        tenant_id: tenantId,
        wa_id: clientWaId,
        last_customer_message_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,wa_id', ignoreDuplicates: false }
    )

  // Determine reply text
  let replyText: string
  if (message.type !== 'text') {
    replyText = 'Je ne peux traiter que les messages texte pour le moment.'
  } else {
    // Phase 2 stub — will be replaced by FSM in Phase 3
    replyText = 'Bonjour! Je suis en cours de configuration.'
  }

  await sendTextMessage(clientWaId, replyText, phoneNumberId)
}
