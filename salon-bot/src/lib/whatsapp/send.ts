import type { SendTemplatePayload } from './types'

/**
 * Send a plain text WhatsApp message via Meta Cloud API.
 * Returns the outbound wamid from Meta's response.
 * Throws on non-200 response.
 */
export async function sendTextMessage(
  to: string,
  body: string,
  phoneNumberId: string
): Promise<string> {
  const token = process.env.WHATSAPP_API_TOKEN!
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0'
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body },
    }),
  })

  if (!response.ok) {
    throw new Error(`Meta API error: ${response.status}`)
  }

  const data = await response.json()
  return data.messages[0].id as string
}

/**
 * Send a WhatsApp template message via Meta Cloud API.
 * Uses payload.phoneNumberId for multi-tenant support (per-tenant phone number).
 * Returns the outbound wamid from Meta's response.
 * Throws on non-200 response.
 */
export async function sendTemplateMessage(payload: SendTemplatePayload): Promise<string> {
  const token = process.env.WHATSAPP_API_TOKEN!
  const version = process.env.WHATSAPP_API_VERSION || 'v23.0'
  const url = `https://graph.facebook.com/${version}/${payload.phoneNumberId}/messages`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: payload.to,
      type: 'template',
      template: {
        name: payload.templateName,
        language: { code: payload.languageCode },
        ...(payload.components ? { components: payload.components } : {}),
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Meta template API error: ${response.status}`)
  }

  const data = await response.json()
  return data.messages[0].id as string
}
