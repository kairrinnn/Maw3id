# Architecture Research

**Domain:** Multi-tenant WhatsApp Bot SaaS (Salon Booking)
**Researched:** 2026-03-30
**Confidence:** HIGH (core patterns); MEDIUM (LLM routing specifics)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         EXTERNAL LAYER                           │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐       │
│  │  Salon Client │   │  Salon Client │   │  Salon Client │       │
│  │  (WhatsApp)   │   │  (WhatsApp)   │   │  (WhatsApp)   │       │
│  └──────┬────────┘   └──────┬────────┘   └──────┬────────┘       │
│         │ phone_A           │ phone_B            │ phone_C        │
└─────────┼───────────────────┼────────────────────┼───────────────┘
          │                   │                    │
          └───────────────────┴────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Meta Cloud API    │
                    │  Single WABA App   │
                    │  (one webhook URL) │
                    └─────────┬──────────┘
                              │ POST /api/webhook
┌─────────────────────────────▼────────────────────────────────────┐
│                       NEXT.JS APP (single deploy)                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    WEBHOOK INGESTION                        │  │
│  │  app/api/webhook/route.ts                                  │  │
│  │  ├── Verify X-Hub-Signature-256 (HMAC)                     │  │
│  │  ├── Extract entry[0].changes[0].value.metadata            │  │
│  │  │   └── .phone_number_id → tenant lookup                  │  │
│  │  ├── Return 200 immediately                                │  │
│  │  └── Enqueue job to background worker                      │  │
│  └────────────────────┬───────────────────────────────────────┘  │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐  │
│  │                    TENANT ROUTER                            │  │
│  │  lib/webhook/tenantRouter.ts                               │  │
│  │  ├── SELECT tenant FROM phone_numbers WHERE                │  │
│  │  │   phone_number_id = $1 (single indexed lookup)          │  │
│  │  └── Attach tenant context to message pipeline             │  │
│  └────────────────────┬───────────────────────────────────────┘  │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐  │
│  │                  CONVERSATION STATE MACHINE                 │  │
│  │  lib/bot/stateMachine.ts                                   │  │
│  │  ├── Load conversation record (by wa_id + tenant_id)       │  │
│  │  ├── Current state: IDLE / COLLECTING / CONFIRMING /       │  │
│  │  │                  MODIFYING / CANCELLING                 │  │
│  │  ├── Structured state object (not raw history):            │  │
│  │  │   { name, service_id, date, time, slot_id, status }     │  │
│  │  ├── Apply incoming message event                          │  │
│  │  └── Produce next_state + action_list                      │  │
│  └────────────────────┬───────────────────────────────────────┘  │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐  │
│  │                    LLM ROUTING LAYER                        │  │
│  │  lib/llm/router.ts                                         │  │
│  │  ├── Classify intent complexity from state context         │  │
│  │  │   ├── SIMPLE: greeting, FAQ, slot confirm, cancel       │  │
│  │  │   └── COMPLEX: ambiguous date, multi-service, complaint │  │
│  │  ├── SIMPLE → cheap model (GPT-4o-mini / Gemini Flash)     │  │
│  │  ├── COMPLEX → standard model (GPT-4o / Gemini Pro)        │  │
│  │  └── Returns: extracted_entities + generated_text          │  │
│  └────────────────────┬───────────────────────────────────────┘  │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐  │
│  │                ACTION EXECUTOR                              │  │
│  │  lib/bot/actionExecutor.ts                                 │  │
│  │  ├── BOOK_SLOT → INSERT booking, check availability        │  │
│  │  ├── SEND_TEMPLATE → Meta template message (24h+ window)   │  │
│  │  ├── SEND_TEXT → Meta freeform reply (within 24h window)   │  │
│  │  └── UPDATE_STATE → persist new conversation state         │  │
│  └────────────────────┬───────────────────────────────────────┘  │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐  │
│  │                   DASHBOARD API ROUTES                      │  │
│  │  app/api/dashboard/[...] (authenticated, tenant-scoped)    │  │
│  │  ├── /bookings  → list, update, cancel                     │  │
│  │  ├── /services  → CRUD tenant services + pricing           │  │
│  │  ├── /schedule  → hours, breaks, capacity                  │  │
│  │  ├── /templates → approved Meta templates per tenant       │  │
│  │  └── /stats     → booking volume, revenue, conversion      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │               NEXT.JS DASHBOARD FRONTEND                  │    │
│  │  app/(dashboard)/[tenantSlug]/...                         │    │
│  │  Authenticated via Supabase Auth (email/magic link)       │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────┬───────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────┐
│                         SUPABASE                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  Postgres (RLS)  │  │  Supabase Auth   │  │  Storage       │  │
│  │  All tenant data │  │  Dashboard users │  │  (future docs) │  │
│  └──────────────────┘  └──────────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| Webhook Ingestion | Signature verification, immediate 200, payload parsing | Meta → Tenant Router |
| Tenant Router | Map `phone_number_id` → `tenant_id`, attach context | Webhook → State Machine |
| Conversation State Machine | Track booking flow state, produce action lists | Tenant Router → LLM Router + Action Executor |
| LLM Routing Layer | Choose cheap vs expensive model, extract entities, generate reply text | State Machine → LLM APIs |
| Action Executor | Persist DB changes, send WhatsApp replies | LLM Router → Supabase + Meta API |
| Dashboard API Routes | Tenant-scoped REST API for admin UI | Supabase (via server-side Supabase client) |
| Dashboard Frontend | Next.js app for salon owners | Dashboard API Routes |
| Reminder Scheduler | Cron job sending 24h-before template reminders | Supabase bookings → Meta API |

---

## Recommended Project Structure

```
f:/Bot_WhatsApp/
├── app/
│   ├── api/
│   │   ├── webhook/
│   │   │   └── route.ts          # Single Meta webhook endpoint (GET verify + POST receive)
│   │   └── dashboard/
│   │       ├── bookings/route.ts
│   │       ├── services/route.ts
│   │       ├── schedule/route.ts
│   │       ├── templates/route.ts
│   │       └── stats/route.ts
│   ├── (dashboard)/              # Auth-protected tenant dashboard
│   │   └── [tenantSlug]/
│   │       ├── bookings/
│   │       ├── services/
│   │       ├── schedule/
│   │       └── settings/
│   └── (auth)/
│       └── login/
├── lib/
│   ├── webhook/
│   │   ├── verify.ts             # HMAC X-Hub-Signature-256 verification
│   │   ├── tenantRouter.ts       # phone_number_id → tenant_id lookup
│   │   └── payloadParser.ts      # Normalize Meta webhook payload types
│   ├── bot/
│   │   ├── stateMachine.ts       # FSM: states, transitions, action emission
│   │   ├── states.ts             # State type definitions
│   │   └── actionExecutor.ts     # Execute actions (DB write, WhatsApp send)
│   ├── llm/
│   │   ├── router.ts             # Intent classification → model selection
│   │   ├── prompts.ts            # Prompt templates per state (tenant config injected)
│   │   └── providers/
│   │       ├── cheap.ts          # GPT-4o-mini or Gemini Flash client
│   │       └── standard.ts       # GPT-4o or Gemini Pro client
│   ├── meta/
│   │   ├── client.ts             # Meta Graph API wrapper (send message, send template)
│   │   └── templates.ts          # Template helper (build template body params)
│   ├── supabase/
│   │   ├── server.ts             # Server-side Supabase client (cookie-based auth)
│   │   └── service.ts            # Service-role client (webhook, no user session)
│   └── scheduler/
│       └── reminderJob.ts        # Cron: query upcoming bookings → send templates
├── supabase/
│   ├── migrations/               # All schema + RLS migrations
│   └── seed.sql                  # Dev seed data
└── .planning/                    # GSD planning artifacts
```

### Structure Rationale

- **`app/api/webhook/`:** Single Next.js route handler receives ALL Meta webhooks across all tenants. No per-tenant routes — Meta allows only one webhook URL per app.
- **`lib/bot/`:** Isolated state machine logic with no HTTP concerns. Testable in isolation.
- **`lib/llm/`:** Provider-agnostic routing layer. Swapping models means editing one file.
- **`lib/supabase/`:** Two clients — `server.ts` uses user session cookies (dashboard routes), `service.ts` uses service role key (webhook pipeline which has no browser session).
- **`supabase/migrations/`:** All RLS policies live here as SQL, version-controlled.

---

## Architectural Patterns

### Pattern 1: Single Webhook, Tenant-Disambiguated by `phone_number_id`

**What:** Meta sends ALL incoming messages for ALL phone numbers to a single webhook URL registered per WhatsApp Business App (WABA). The `entry[0].changes[0].value.metadata.phone_number_id` field in the payload identifies which registered phone number received the message. This maps 1:1 to a tenant.

**When to use:** Always — this is how Meta Cloud API works. There is no per-tenant webhook URL option.

**Trade-offs:** Simple routing lookup on every webhook call (indexed DB read, ~1ms). No complexity overhead.

**Example:**
```typescript
// lib/webhook/tenantRouter.ts
export async function resolveTenant(phoneNumberId: string): Promise<Tenant | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('phone_numbers')
    .select('tenant_id, tenants(*)')
    .eq('phone_number_id', phoneNumberId)
    .single()
  return data?.tenants ?? null
}

// In webhook payload: entry[0].changes[0].value.metadata.phone_number_id
// In message sender: entry[0].changes[0].value.messages[0].from (wa_id)
```

### Pattern 2: Structured Conversation State (FSM over Raw LLM History)

**What:** Instead of storing the full message exchange and replaying it to the LLM on every turn (raw history approach), store a compact structured state object per conversation. The FSM defines valid states and transitions. Only the current structured state — plus the new message — goes to the LLM.

**When to use:** Any token-cost-sensitive application. LLM input cost scales linearly with history length. A full booking flow is 6-10 turns; sending raw history means 5-9x the token cost on the final turn versus structured state.

**Trade-offs:** Requires upfront FSM design. Cannot handle truly open-ended conversations (acceptable for booking bots). Saves 60-80% LLM cost versus raw history.

**States:**
```
IDLE
  ↓ (greets / says wants booking)
COLLECTING_SERVICE
  ↓ (service identified)
COLLECTING_DATETIME
  ↓ (date + time identified, slot available)
CONFIRMING
  ↓ (confirms)
BOOKED ← terminal
  ↑ can re-enter MODIFYING or CANCELLING
```

**Example:**
```typescript
// lib/bot/states.ts
export type ConversationState =
  | { status: 'IDLE' }
  | { status: 'COLLECTING_SERVICE' }
  | { status: 'COLLECTING_DATETIME'; serviceId: string; serviceName: string }
  | { status: 'CONFIRMING'; serviceId: string; date: string; time: string; slotId: string }
  | { status: 'BOOKED'; bookingId: string }
  | { status: 'MODIFYING'; bookingId: string }
  | { status: 'CANCELLING'; bookingId: string }

// LLM receives: current state object + tenant config + ONE new user message
// NOT: entire conversation history
```

### Pattern 3: Tiered LLM Routing by Intent Complexity

**What:** Classify each incoming message into SIMPLE or COMPLEX before calling an LLM. SIMPLE intents (slot confirmation yes/no, cancellation confirm, service name extraction from list) go to a cheap/fast model. COMPLEX intents (ambiguous phrasing, complaint, multi-service negotiation) go to a capable model.

**When to use:** All production LLM bots with cost constraints.

**Trade-offs:** Requires a classification step — which itself can be a cheap model call or a rule-based heuristic. Adds ~50ms latency on COMPLEX path (two sequential calls). Reduces average LLM cost by 60-80% if 70%+ of turns are SIMPLE.

**Example:**
```typescript
// lib/llm/router.ts
export async function routeLLM(state: ConversationState, message: string) {
  const complexity = classifyComplexity(state, message)
  // Rule-based first: if state is CONFIRMING and message matches yes/no → SIMPLE
  // Fallback: cheap model to classify → then route
  const model = complexity === 'SIMPLE' ? cheapModel : standardModel
  return model.complete(buildPrompt(state, message))
}
```

### Pattern 4: 24-Hour Window Enforcement

**What:** Meta's WhatsApp Cloud API restricts freeform messages to a 24-hour window after the last customer message. Outside this window, only pre-approved template messages can be sent. The system must track `last_customer_message_at` per conversation and branch accordingly in the Action Executor.

**When to use:** Always — this is a hard platform constraint.

**Trade-offs:** Template messages require Meta approval (1-7 days). Onboarding must submit templates before go-live. Templates have variable-substitution slots — the system must parameterize them correctly.

**Example:**
```typescript
// lib/bot/actionExecutor.ts
function isWithin24HourWindow(lastCustomerMessageAt: Date): boolean {
  return Date.now() - lastCustomerMessageAt.getTime() < 23.5 * 60 * 60 * 1000
  // 23.5h to give buffer against clock skew
}

async function sendReply(conversation: Conversation, text: string, tenant: Tenant) {
  if (isWithin24HourWindow(conversation.last_customer_message_at)) {
    await metaClient.sendText(tenant.phone_number_id, conversation.wa_id, text)
  } else {
    await metaClient.sendTemplate(tenant.phone_number_id, conversation.wa_id, 'booking_confirmation', [...])
  }
}
```

---

## Data Flow

### Inbound Message Flow

```
WhatsApp User sends message
    │
    ▼
Meta Cloud API POSTs to /api/webhook
    │
    ▼
app/api/webhook/route.ts
    ├── Verify X-Hub-Signature-256 (HMAC-SHA256, app secret)
    ├── Return 200 OK immediately (Meta requires < 5s response)
    └── Process asynchronously (or via background queue)
         │
         ▼
         tenantRouter.ts
         ├── Extract payload.entry[0].changes[0].value.metadata.phone_number_id
         └── SELECT tenant WHERE phone_number_id = $1
              │
              ▼
              stateMachine.ts
              ├── SELECT conversation WHERE wa_id = $waId AND tenant_id = $tenantId
              ├── Load current state (or create IDLE if first contact)
              ├── Determine valid transitions for current state + message
              └── Emit action list
                   │
                   ▼
                   llm/router.ts  (only if NLU needed for this state)
                   ├── classifyComplexity(state, message)
                   ├── Route to cheap or standard model
                   └── Return { extracted_entities, reply_text }
                        │
                        ▼
                        actionExecutor.ts
                        ├── Execute DB actions (INSERT booking, UPDATE conversation)
                        ├── Determine 24h window status
                        └── Call Meta API to send reply
```

### State Persistence Flow

```
Each turn:
  READ  conversations WHERE wa_id = ? AND tenant_id = ?
            │
            ▼ (state loaded)
  PROCESS (FSM + LLM)
            │
            ▼ (new state computed)
  WRITE conversations SET state = ?, last_customer_message_at = ?, updated_at = ?
```

### Reminder Flow (Scheduled)

```
Cron job every 15 min:
    │
    ▼
SELECT bookings WHERE
  appointment_at BETWEEN NOW() + 23h AND NOW() + 25h
  AND reminder_sent = false
    │
    ▼
For each booking:
  ├── Get tenant.phone_number_id + approved template name
  ├── Call Meta sendTemplate(reminder_template, [client_name, service, time])
  └── UPDATE booking SET reminder_sent = true
```

---

## Database Schema Sketch

```sql
-- Core multi-tenant table
CREATE TABLE tenants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,        -- URL slug for dashboard
  name         TEXT NOT NULL,               -- Salon name
  plan         TEXT DEFAULT 'starter',      -- starter | booking_ai | pro
  bot_prompt   TEXT,                        -- System prompt customization
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- One row per WhatsApp number (tenant has exactly 1 in V1, extensible)
CREATE TABLE phone_numbers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number_id  TEXT UNIQUE NOT NULL,   -- Meta's phone_number_id
  waba_id          TEXT NOT NULL,          -- WhatsApp Business Account ID
  display_phone    TEXT NOT NULL,          -- +212 6XX XXX XXX (human readable)
  status           TEXT DEFAULT 'pending', -- pending | active | suspended
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_phone_numbers_phone_number_id ON phone_numbers(phone_number_id);

-- Dashboard users (salon owners / staff)
CREATE TABLE tenant_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT DEFAULT 'admin',        -- admin | staff
  UNIQUE(tenant_id, user_id)
);

-- Services offered by each salon
CREATE TABLE services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  price_mad   NUMERIC(10,2),
  active      BOOLEAN DEFAULT true
);

-- Business hours per tenant
CREATE TABLE schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL,           -- 0=Mon, 6=Sun
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  closed      BOOLEAN DEFAULT false
);

-- Conversation state per WhatsApp user × tenant
CREATE TABLE conversations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  wa_id                     TEXT NOT NULL,           -- WhatsApp user phone number
  state                     JSONB NOT NULL DEFAULT '{"status":"IDLE"}',
  last_customer_message_at  TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, wa_id)
);
CREATE INDEX idx_conversations_tenant_wa ON conversations(tenant_id, wa_id);

-- Bookings
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  conversation_id UUID REFERENCES conversations(id),
  service_id      UUID NOT NULL REFERENCES services(id),
  client_wa_id    TEXT NOT NULL,
  client_name     TEXT,
  appointment_at  TIMESTAMPTZ NOT NULL,
  status          TEXT DEFAULT 'confirmed',  -- confirmed | cancelled | completed | no_show
  reminder_sent   BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_bookings_tenant_appointment ON bookings(tenant_id, appointment_at);
CREATE INDEX idx_bookings_reminder ON bookings(appointment_at, reminder_sent)
  WHERE status = 'confirmed' AND reminder_sent = false;

-- Meta-approved templates per tenant
CREATE TABLE whatsapp_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  template_name   TEXT NOT NULL,           -- reminder_v1, confirmation_v1, cancellation_v1
  meta_status     TEXT DEFAULT 'pending',  -- pending | approved | rejected
  language        TEXT DEFAULT 'fr',
  body_text       TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, template_name)
);
```

---

## Multi-Tenant Isolation Strategy with Supabase RLS

### Strategy: Shared Schema, Row-Level Isolation

All tenants share one Postgres schema. Every tenant-owned table has a `tenant_id` column. RLS policies enforce that dashboard users can only see their own tenant's rows.

**Why shared schema over schema-per-tenant:**
- Simpler migrations (one migration applies to all tenants)
- No connection pool explosion at 50+ tenants
- Supabase RLS handles isolation correctly at the DB layer
- Schema-per-tenant adds operational complexity for negligible security gain at this scale

### RLS Policy Pattern (MEDIUM confidence — derived from official Supabase RLS docs)

```sql
-- Step 1: Enable RLS on every tenant-owned table
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Step 2: Create a helper function (cached per query via SELECT)
-- tenant_users links auth.users to tenants
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() LIMIT 1
$$;

-- Step 3: Standard read policy — dashboard users see only their tenant
CREATE POLICY "tenant_isolation_select"
ON services
FOR SELECT
TO authenticated
USING ( tenant_id = (SELECT get_user_tenant_id()) );

-- Same pattern repeated for INSERT/UPDATE/DELETE
CREATE POLICY "tenant_isolation_insert"
ON services
FOR INSERT
TO authenticated
WITH CHECK ( tenant_id = (SELECT get_user_tenant_id()) );

-- Step 4: Service role bypasses RLS (used in webhook pipeline)
-- The webhook uses SUPABASE_SERVICE_ROLE_KEY → bypasses all RLS
-- This is correct: webhook has no user session, routes by phone_number_id instead
```

### Two Supabase Client Modes

```
Dashboard routes (app/api/dashboard/*)
  → createServerClient(cookies)   ← user JWT, RLS enforced by auth.uid()
  → All queries automatically scoped to authenticated user's tenant

Webhook pipeline (app/api/webhook/route.ts)
  → createServiceClient(SERVICE_ROLE_KEY)  ← bypasses RLS
  → Must manually scope queries with .eq('tenant_id', resolvedTenantId)
  → No user session available in webhook context
```

### RLS Performance Notes (HIGH confidence — official Supabase docs)

- Index every `tenant_id` column: `CREATE INDEX ON bookings(tenant_id)`
- Wrap auth function calls with `SELECT` to allow PostgreSQL to cache per statement
- Always add explicit `.eq('tenant_id', id)` in application code alongside RLS (helps query planner)
- Use `TO authenticated` in policy `FOR` clause to skip policy evaluation for anon requests

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-10 salons | Monolith Next.js is fine. Webhook processes synchronously. Vercel Edge or serverless handles load. |
| 10-100 salons | Add a background queue (Upstash QStash or pg-boss on Supabase) — webhook returns 200 immediately, processing in queue. Prevents timeout if LLM is slow. |
| 100-500 salons | Consider extracting webhook processor to separate service (Node.js worker). Next.js serverless functions have 10s timeout on Vercel hobby, 60s on pro. LLM calls can hit this. |
| 500+ salons | Proper message queue (Redis Streams or BullMQ), horizontal worker scaling, read replicas for analytics queries |

### Scaling Priorities

1. **First bottleneck:** Vercel serverless timeout during LLM calls. Fix: return 200 from webhook immediately, use Upstash QStash to process async.
2. **Second bottleneck:** Supabase connection limits. Fix: use Supabase connection pooler (PgBouncer) — already enabled by default on Supabase hosted.

---

## Anti-Patterns

### Anti-Pattern 1: Per-Tenant Webhook URLs

**What people do:** Create separate webhook endpoints per salon, thinking it's cleaner isolation.
**Why it's wrong:** Meta Cloud API allows only ONE webhook URL per WhatsApp Business App. You cannot register per-tenant webhooks. All messages arrive at one endpoint.
**Do this instead:** Single webhook endpoint, resolve tenant via `phone_number_id` lookup in the first 10ms.

### Anti-Pattern 2: Sending Full Conversation History to LLM

**What people do:** Store every WhatsApp message and send the entire thread as LLM messages context on each turn.
**Why it's wrong:** A 10-turn booking conversation costs ~5x more tokens on turn 10 than on turn 1. LLM input costs dominate at scale. History also leaks context across unrelated conversations if not carefully filtered.
**Do this instead:** Maintain a compact structured state object. The LLM receives the current state (compact JSON) plus the single new user message. Total input stays roughly constant per turn.

### Anti-Pattern 3: Storing `phone_number_id` in `.env` per tenant

**What people do:** For a single-tenant prototype, hardcode the phone number ID in environment variables. Then struggle to multi-tenant.
**Why it's wrong:** Does not scale to N tenants. Each deployment would need separate env vars per tenant.
**Do this instead:** `phone_numbers` table with indexed `phone_number_id` column, populated during tenant onboarding. One lookup resolves any tenant dynamically.

### Anti-Pattern 4: Using `anon` Supabase Key in Webhook Handler

**What people do:** Reuse the browser/dashboard Supabase anon client in the webhook handler.
**Why it's wrong:** The anon key is subject to RLS policies, which check `auth.uid()`. The webhook has no user session — `auth.uid()` is null. All queries return empty or fail.
**Do this instead:** Use the service role key (`SUPABASE_SERVICE_ROLE_KEY`) in the webhook pipeline. Add explicit `tenant_id` filters to all queries instead of relying on RLS.

### Anti-Pattern 5: Attempting to Send Freeform Messages Outside 24h Window

**What people do:** Try to send reminder messages as regular text messages and get API errors.
**Why it's wrong:** Meta's platform strictly enforces the 24-hour customer service window. Freeform messages outside the window are rejected with error code 131026.
**Do this instead:** Track `last_customer_message_at` in the `conversations` table. Check the window before every outbound message. If outside window, use an approved template with pre-filled variables.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Meta WhatsApp Cloud API | REST calls to `graph.facebook.com/v18.0/{phone_number_id}/messages` | Use service account token stored per-tenant in `phone_numbers` or a shared system token if one WABA app serves all tenants |
| LLM Provider (OpenAI / Google) | REST API via thin provider wrapper | Abstract behind `lib/llm/providers/` to stay model-agnostic |
| Supabase Auth | Cookie-based session for dashboard (Next.js server components) | Use `@supabase/ssr` package, not deprecated `auth-helpers` |
| Cron / Reminder Scheduler | Vercel Cron Jobs (vercel.json) or Supabase pg_cron | Vercel cron minimum interval is 1 minute; pg_cron runs server-side |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Webhook handler ↔ State Machine | Direct function call (same process in V1) | Upgrade to queue message in V2 |
| State Machine ↔ LLM Router | Direct async call | LLM router is pure function: in → out |
| State Machine ↔ Supabase | Service client (no RLS) | Webhook context has no user session |
| Dashboard routes ↔ Supabase | Server client (with RLS) | User session cookie present |
| Action Executor ↔ Meta API | HTTP POST to Graph API | Must handle retry on 429 (rate limit) |

---

## Suggested Build Order

Dependencies drive this order — later components require earlier ones to exist.

```
Phase 1: Foundation
  └── Supabase schema + RLS migrations
  └── Tenant onboarding flow (create tenant, add phone_number_id)
  └── Supabase Auth for dashboard login

Phase 2: Webhook Pipeline (core bot)
  └── Webhook ingestion + signature verification
  └── Tenant router (phone_number_id → tenant lookup)
  └── Conversation state machine (IDLE → COLLECTING → CONFIRMING → BOOKED)
  └── Meta API client (send text reply)
  [Bot works without LLM — rule-based, no NLU yet]

Phase 3: LLM Integration
  └── LLM router (cheap model first)
  └── Prompt templates per state + tenant config injection
  └── Slot extraction from natural language
  └── Standard model for complex intents

Phase 4: Booking Logic
  └── Availability checking against schedules
  └── Booking creation, modification, cancellation
  └── Conflict detection

Phase 5: Templates and Reminders
  └── WhatsApp template management per tenant
  └── 24h window detection + template fallback
  └── Reminder cron job

Phase 6: Dashboard
  └── Dashboard API routes (bookings, services, schedule, stats)
  └── Dashboard frontend (Next.js app router pages)
  └── Tenant settings (bot prompt, services CRUD, hours)
```

**Rationale:** The bot pipeline (Phases 1-4) provides core value and can be tested independently of the dashboard. Starting with the webhook and a rule-based FSM (no LLM) allows end-to-end testing cheaply before adding AI complexity.

---

## Sources

- Next.js 15 Route Handlers — https://nextjs.org/docs/app/api-reference/file-conventions/route (official, fetched 2026-03-30)
- Supabase RLS performance recommendations — https://supabase.com/docs/guides/database/postgres/row-level-security (official, fetched 2026-03-30)
- Supabase Auth JWT / app_metadata patterns — https://supabase.com/docs/guides/auth/row-level-security (official, fetched 2026-03-30)
- Meta WhatsApp Cloud API webhook structure — training data (MEDIUM confidence); `phone_number_id` in `metadata` object is documented behavior; verify against https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
- 24-hour customer service window — Meta platform constraint (HIGH confidence from project context and platform knowledge)

---
*Architecture research for: Multi-tenant WhatsApp Bot SaaS (Salon Booking, Maroc)*
*Researched: 2026-03-30*
