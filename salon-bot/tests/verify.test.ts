import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyWebhookSignature } from '@/lib/whatsapp/verify'

const SECRET = 'test-app-secret'
const BODY = '{"object":"whatsapp_business_account"}'

function makeSignature(body: string, secret: string) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

describe('verifyWebhookSignature', () => {
  it('returns true for valid signature', () => {
    expect(verifyWebhookSignature(BODY, makeSignature(BODY, SECRET), SECRET)).toBe(true)
  })

  it('returns false for tampered body', () => {
    expect(verifyWebhookSignature(BODY + 'x', makeSignature(BODY, SECRET), SECRET)).toBe(false)
  })

  it('returns false for wrong secret', () => {
    expect(verifyWebhookSignature(BODY, makeSignature(BODY, 'wrong-secret'), SECRET)).toBe(false)
  })

  it('returns false for empty signature', () => {
    expect(verifyWebhookSignature(BODY, '', SECRET)).toBe(false)
  })

  it('returns false for empty appSecret', () => {
    expect(verifyWebhookSignature(BODY, makeSignature(BODY, SECRET), '')).toBe(false)
  })
})
