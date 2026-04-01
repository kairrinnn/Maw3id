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
  const version = process.env.WHATSAPP_API_VERSION || 'v19.0'
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
 * Send a WhatsApp template message.
 * Stub — implemented in Phase 5.
 */
export async function sendTemplateMessage(_payload: SendTemplatePayload): Promise<string> {
  throw new Error('sendTemplateMessage not implemented — Phase 5')
}
