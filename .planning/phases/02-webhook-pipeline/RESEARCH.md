# Research: Phase 2 — Webhook Pipeline

## 1. Meta WhatsApp Cloud API — Webhook POST Payload Shape

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "212600000000",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "contacts": [
              {
                "profile": { "name": "Client Name" },
                "wa_id": "212600111111"
              }
            ],
            "messages": [
              {
                "from": "212600111111",
                "id": "wamid.XXXXX",
                "timestamp": "1696000000",
                "text": { "body": "Bonjour, je voudrais réserver" },
                "type": "text"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

**Key fields:**
- `entry[0].changes[0].value.metadata.phone_number_id` → used to identify the tenant
- `entry[0].changes[0].value.messages[0].id` → the `wamid` for deduplication
- `entry[0].changes[0].value.messages[0].from` → client's WhatsApp phone number
- `entry[0].changes[0].value.messages[0].type` → "text", "image", "audio", etc. — only handle "text" in Phase 2
- `entry[0].changes[0].value.messages[0].text.body` → message text
- Status updates (delivered, read) also arrive via POST — must filter: only process when `messages` array exists

## 2. GET Webhook Verification

Meta sends a GET request with query params:
- `hub.mode` — always `"subscribe"`
- `hub.verify_token` — the token you set in Meta Developer Console
- `hub.challenge` — random string Meta expects back

**Response logic:**
```typescript
if (hub_mode === 'subscribe' && hub_verify_token === process.env.WEBHOOK_VERIFY_TOKEN) {
  return new Response(hub_challenge, { status: 200 })
}
return new Response('Forbidden', { status: 403 })
```

## 3. Send Text Message — Meta Graph API

**Endpoint:** `POST https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages`

**Headers:**
```
Authorization: Bearer {WHATSAPP_API_TOKEN}
Content-Type: application/json
```

**Body:**
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "212600111111",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "Bonjour! Comment puis-je vous aider?"
  }
}
```

**Response on success (200):**
```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "212600111111", "wa_id": "212600111111" }],
  "messages": [{ "id": "wamid.OUTBOUND_ID" }]
}
```

## 4. Send Template Message

**Body:**
```json
{
  "messaging_product": "whatsapp",
  "to": "212600111111",
  "type": "template",
  "template": {
    "name": "confirmation_rdv",
    "language": { "code": "fr" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Coupe" },
          { "type": "text", "text": "Mardi 15h" }
        ]
      }
    ]
  }
}
```

Not needed for Phase 2 (stub reply only), but types should anticipate this.

## 5. Next.js 15 App Router — POST Handler Pattern

**Critical**: Meta expects HTTP 200 within 5 seconds. For Phase 2 (no LLM, simple DB lookup), synchronous processing is fine. But the pattern to use for future phases:

```typescript
// app/api/webhook/route.ts
export async function POST(request: Request) {
  // Parse body
  const body = await request.json()
  
  // Return 200 immediately for status updates (no messages array)
  if (!body.entry?.[0]?.changes?.[0]?.value?.messages) {
    return new Response('OK', { status: 200 })
  }
  
  // Process synchronously for Phase 2 (fast DB ops only)
  await processMessage(body)
  
  return new Response('OK', { status: 200 })
}
```

**Edge runtime**: Not needed for Phase 2. Node.js runtime is fine and gives access to full Node APIs.

## 6. Webhook Signature Verification (X-Hub-Signature-256)

Meta signs every POST with HMAC-SHA256:
- Header: `x-hub-signature-256: sha256=HASH`
- Hash is computed over the raw request body using your `APP_SECRET`

**Verification:**
```typescript
import { createHmac } from 'crypto'

function verifySignature(body: string, signature: string, appSecret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(body).digest('hex')
  return signature === expected
}
```

**Important**: Must read the raw body as string BEFORE parsing JSON. In Next.js 15:
```typescript
const rawBody = await request.text()
const signature = request.headers.get('x-hub-signature-256') ?? ''
if (!verifySignature(rawBody, signature, process.env.WHATSAPP_APP_SECRET!)) {
  return new Response('Unauthorized', { status: 401 })
}
const body = JSON.parse(rawBody)
```

Note: For Phase 2 development/testing, signature verification can be optional (env flag `SKIP_WEBHOOK_SIGNATURE`).

## 7. Required Environment Variables

```env
# Meta WhatsApp Cloud API
WHATSAPP_API_TOKEN=         # Permanent token or System User token
WHATSAPP_API_VERSION=v19.0  # Pinned API version
WHATSAPP_APP_SECRET=        # App secret for signature verification

# Webhook
WEBHOOK_VERIFY_TOKEN=       # Random string set in Meta Developer Console
```

Note: `WHATSAPP_PHONE_NUMBER_ID` is NOT a fixed env var in multi-tenant — it comes from the `phone_numbers` table per tenant. The API token may be shared (single WABA) or per-tenant (multiple WABAs). Phase 2 uses a single shared token.

## 8. Deduplication Pattern

Meta may deliver the same message twice (at-least-once delivery). The `wamid` is the unique message ID.

**Approach**: Use a `processed_wamids` table OR a unique constraint on `wamid` in the `conversations` messages log.

For Phase 2, simplest approach: check if `wamid` already processed before doing anything, or catch unique constraint violation on insert.

Recommended: add a `message_logs` table or use `conversations.last_wamid` + upsert pattern. Alternatively, a lightweight `processed_messages` table:
```sql
CREATE TABLE processed_messages (
  wamid TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
Insert with `ON CONFLICT DO NOTHING`, check `rowCount` — if 0, message already processed.

## 9. Tenant Routing Flow

```
POST /api/webhook
  → parse phone_number_id from metadata
  → SELECT tenant_id FROM phone_numbers WHERE wa_phone_number_id = phone_number_id AND active = true
  → if not found: log warning, return 200 (don't error — Meta will retry)
  → SELECT bot_configs WHERE tenant_id = tenant_id
  → if bot not active: return 200 silently
  → upsert conversation (find by client_phone + tenant_id)
  → deduplicate via wamid
  → generate reply (Phase 2: static echo or stub)
  → POST reply to Meta Graph API
  → return 200
```

## 10. Supabase Service Client for Webhook

Webhook has no user JWT — must use service role key to bypass RLS:
```typescript
// src/lib/supabase/service.ts
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

This client bypasses all RLS policies — only use in server-side trusted contexts (webhooks, cron jobs).

## 11. Known Gotchas

1. **Body already consumed**: In Next.js 15, `request.json()` consumes the body. If you need to verify signature first, use `request.text()` then `JSON.parse()`.
2. **Meta retries on non-200**: If your handler throws, Meta retries exponentially. Always return 200 even on "soft" errors (tenant not found, bot inactive).
3. **Status updates**: Meta sends delivery/read receipts via the same POST endpoint. These don't have a `messages` array — filter them out early.
4. **Array iteration**: A single POST can contain multiple entries/messages. Always iterate the full array.
5. **Phone number format**: Meta sends `from` as international format without `+` (e.g. `212600111111`). Store consistently.
6. **Timestamp**: Meta sends Unix timestamp as string, not number.
7. **Non-text messages**: Phase 2 should return a polite "Je ne peux traiter que les messages texte" for image/audio/video types.
