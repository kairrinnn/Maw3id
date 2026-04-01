import { createHmac } from 'crypto'

/**
 * Verify Meta webhook X-Hub-Signature-256 header.
 * @param rawBody - raw request body as string (from request.text())
 * @param signature - value of x-hub-signature-256 header (e.g. "sha256=abc123")
 * @param appSecret - WHATSAPP_APP_SECRET env variable
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  appSecret: string
): boolean {
  if (!signature || !appSecret) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
  return signature === expected
}
