import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: Request) {
  let body: { tenant_id?: string; template_name?: string }
  try {
    body = await request.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  if (!body.tenant_id || !body.template_name) {
    return new Response('Missing tenant_id or template_name', { status: 400 })
  }

  const supabase = createServiceClient()

  // 1. Load template row (to get body_text, language)
  const { data: tplRow } = await supabase
    .from('whatsapp_templates')
    .select('id, body_text, language')
    .eq('tenant_id', body.tenant_id)
    .eq('template_name', body.template_name)
    .single()

  if (!tplRow) return new Response('Template not found', { status: 404 })

  // 2. Load tenant's waba_id from phone_numbers
  // NOTE: waba_id (not phone_number_id) — template submission goes to /{waba_id}/message_templates
  // Sending messages goes to /{phone_number_id}/messages (research pitfall #1)
  const { data: phoneRow } = await supabase
    .from('phone_numbers')
    .select('waba_id')
    .eq('tenant_id', body.tenant_id)
    .eq('status', 'active')
    .single()

  if (!phoneRow) return new Response('No active WhatsApp number for tenant', { status: 404 })

  // 3. POST to Meta /{waba_id}/message_templates
  const version = process.env.WHATSAPP_API_VERSION || 'v23.0'
  const url = `https://graph.facebook.com/${version}/${phoneRow.waba_id}/message_templates`

  // example.body_text is REQUIRED by Meta when template contains {{n}} variables (pitfall #4)
  // Must be a nested array: array of example sets, each set is an array of variable values
  const exampleValues =
    body.template_name === 'rdv_reminder' ||
    body.template_name === 'rdv_confirmation' ||
    body.template_name === 'rdv_cancellation'
      ? ['lundi 5 mai à 14h00', 'Salon Fatima']
      : ['exemple1', 'exemple2']

  const metaBody = {
    name: body.template_name,
    category: 'UTILITY', // appointment reminders are UTILITY, not MARKETING
    language: tplRow.language || 'fr',
    components: [
      {
        type: 'BODY',
        text: tplRow.body_text,
        example: { body_text: [exampleValues] }, // REQUIRED nested array per Meta spec
      },
    ],
  }

  const metaRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metaBody),
  })

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}))
    return Response.json({ error: 'Meta submission failed', meta: err }, { status: 502 })
  }

  const metaData = await metaRes.json()

  // 4. Update meta_status to reflect what Meta returned (typically 'PENDING' for new submissions)
  await supabase
    .from('whatsapp_templates')
    .update({ meta_status: metaData.status || 'submitted' })
    .eq('id', tplRow.id)

  return Response.json({ id: metaData.id, status: metaData.status || 'submitted' }, { status: 200 })
}
