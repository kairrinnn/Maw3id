# Phase 5: Templates & Reminders - Research

**Researched:** 2026-05-04
**Domain:** Meta WhatsApp Template API, Supabase pg_cron, Next.js API routes
**Confidence:** HIGH

---

## Summary

Phase 5 has two distinct sub-problems: (1) storing and submitting Meta-approved templates per tenant, and (2) running a scheduler that sends a 24h reminder using those templates without double-firing. Both sub-problems are well-defined. The schema already has `whatsapp_templates` and `bookings.reminder_sent` — no new tables are needed. The `sendTemplateMessage()` stub in `send.ts` needs implementation. The scheduler is the most architecturally interesting piece: because Vercel cron is not available and this is local-dev first, Supabase pg_cron calling a Next.js API route via `net.http_post` is the cleanest fit (zero extra infrastructure, runs in Postgres, tracks execution history automatically).

The three templates (reminder, confirmation, cancellation) must be pre-defined per tenant and submitted to Meta before they can be used. Meta requires `UTILITY` category for transactional reminders. The approval window is 24-48h in practice. The dashboard piece for Phase 5 is submit-only — the full CRUD dashboard is Phase 6.

**Primary recommendation:** Implement `sendTemplateMessage()` in `send.ts`, then build a `/api/reminders/send` Next.js route, then wire a Supabase pg_cron job (via `net.http_post` + `pg_net`) to call it every 5 minutes. The route queries `bookings` WHERE `status='confirmed' AND reminder_sent=false AND appointment_at BETWEEN now()+23h AND now()+25h`, sends the template, and marks `reminder_sent=true` — all in a single atomic update per row.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TPL-01 | 3 standard templates (reminder, confirmation, cancellation) stored per tenant and submittable to Meta | `whatsapp_templates` table already exists; Meta template submission via POST /{WABA_ID}/message_templates is verified. Template storage is purely DB rows. Submission is a Meta Graph API call from a Next.js server action or API route. |
| TPL-02 | Automatic 24h reminder via Meta-approved template; no double-send | `bookings.reminder_sent` boolean already exists with a partial index. Scheduler via pg_cron + pg_net calling `/api/reminders/send`. Idempotency: UPDATE ... WHERE reminder_sent=false as the guard. |
</phase_requirements>

---

## Standard Stack

### Core

| Library / Service | Version | Purpose | Why Standard |
|-------------------|---------|---------|--------------|
| Meta Graph API | v23.0 | Send template messages + submit templates | Already in use; project env var is WHATSAPP_API_VERSION |
| Supabase pg_cron | built-in (Postgres ext) | Schedule recurring DB/HTTP jobs | Already on Supabase; zero new infra; tracks run history |
| Supabase pg_net | built-in | Async HTTP from Postgres | Required for pg_cron to call Next.js route; built-in on Supabase |
| Next.js 16.2.1 | 16.2.1 | API route `/api/reminders/send` as the job target | Already the stack |
| `@supabase/supabase-js` | ^2.101.1 | DB queries for due bookings | Already installed |

### No New npm Packages Required

All needed libraries are already installed. This phase is purely configuration + new files within the existing stack.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg_cron + pg_net | Vercel cron | Vercel cron requires Pro plan + deployment; not available locally |
| pg_cron + pg_net | node-cron in Next.js | Node-cron doesn't survive serverless restarts; unreliable in Next.js API routes |
| pg_cron + pg_net | External service (cron-job.org, Render cron) | Works but adds third-party dependency for a trivial local-dev use case |
| Per-tenant waba_id for template submit | Shared WABA | Project architecture is per-tenant WABA (INFRA-01 decision) — each tenant has own waba_id in phone_numbers table |

---

## Architecture Patterns

### Recommended File Structure (new files only)

```
src/
├── app/
│   └── api/
│       ├── reminders/
│       │   └── send/
│       │       └── route.ts        # POST — cron target, sends due reminders
│       └── templates/
│           └── submit/
│               └── route.ts        # POST — submits a template to Meta for tenant
├── lib/
│   └── whatsapp/
│       └── send.ts                 # ADD: implement sendTemplateMessage()
supabase/
└── migrations/
    └── 20260505000001_phase5_cron.sql   # pg_cron schedule + pg_net call
```

### Pattern 1: sendTemplateMessage() Implementation

**What:** Completes the stub in `send.ts`. Sends a template using the Meta messages endpoint with `type: "template"`.

**When to use:** Any time a proactive outbound message is needed (reminders, confirmations via template).

```typescript
// Source: Meta Graph API docs (verified via WebSearch + official template-api endpoint)
// POST https://graph.facebook.com/{version}/{PHONE_NUMBER_ID}/messages
export async function sendTemplateMessage(payload: SendTemplatePayload): Promise<string> {
  const token = process.env.WHATSAPP_API_TOKEN!
  const version = process.env.WHATSAPP_API_VERSION || 'v23.0'
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`

  const body = {
    messaging_product: 'whatsapp',
    to: payload.to,
    type: 'template',
    template: {
      name: payload.templateName,
      language: { code: payload.languageCode },
      ...(payload.components ? { components: payload.components } : {}),
    },
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Meta template API error: ${response.status} — ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return data.messages[0].id as string
}
```

**Note:** `phoneNumberId` is taken from env here. For multi-tenant use in the reminder route, it must come from the tenant's `phone_numbers` row, not a global env var. The signature `SendTemplatePayload` already has `to`, `templateName`, `languageCode`, `components` — extend it to accept `phoneNumberId` as a parameter, or add a separate `sendTenantTemplateMessage()` variant.

### Pattern 2: Reminder Scheduler Route

**What:** `POST /api/reminders/send` — called by pg_cron every 5 minutes. Queries bookings due for a 24h reminder, sends the template, marks `reminder_sent=true`.

```typescript
// Source: project patterns from route.ts; Supabase JS v2 idioms
export async function POST(request: Request) {
  // Verify internal secret to prevent public triggering
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000)  // now + 23h
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000)    // now + 25h

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, tenant_id, client_wa_id, appointment_at, service_id, services(name)')
    .eq('status', 'confirmed')
    .eq('reminder_sent', false)
    .gte('appointment_at', windowStart.toISOString())
    .lte('appointment_at', windowEnd.toISOString())

  let sent = 0
  for (const booking of bookings ?? []) {
    // Fetch tenant's phone_number_id for this booking
    const { data: phoneRow } = await supabase
      .from('phone_numbers')
      .select('phone_number_id')
      .eq('tenant_id', booking.tenant_id)
      .eq('status', 'active')
      .single()

    if (!phoneRow) continue

    // Fetch approved reminder template for tenant
    const { data: tpl } = await supabase
      .from('whatsapp_templates')
      .select('template_name, language')
      .eq('tenant_id', booking.tenant_id)
      .eq('template_name', 'rdv_reminder')   // standard name agreed in Phase 5
      .eq('meta_status', 'APPROVED')
      .single()

    if (!tpl) continue

    // Format date/time in Morocco locale for the template variable
    const dt = new Date(booking.appointment_at)
    const dateTimeStr = dt.toLocaleString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Africa/Casablanca',
    })

    // Mark sent FIRST (optimistic lock — prevents double send on concurrent runs)
    const { count } = await supabase
      .from('bookings')
      .update({ reminder_sent: true })
      .eq('id', booking.id)
      .eq('reminder_sent', false)   // guard: only update if still false
      // count: 'exact' to detect if another worker already sent it

    // If count === 0 another worker beat us — skip
    // Note: Supabase JS returns count on update only when requested explicitly
    // Use RPC or check .count in the update response

    try {
      await sendTemplateMessage({
        to: booking.client_wa_id,
        templateName: tpl.template_name,
        languageCode: tpl.language,
        phoneNumberId: phoneRow.phone_number_id,
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: dateTimeStr },
          ],
        }],
      })
      sent++
    } catch (err) {
      // Rollback reminder_sent flag so it retries next run
      await supabase
        .from('bookings')
        .update({ reminder_sent: false })
        .eq('id', booking.id)
      console.error('[reminders] Failed to send for booking', booking.id, err)
    }
  }

  return Response.json({ sent })
}
```

**IMPORTANT architectural note on idempotency:** The `reminder_sent` boolean update with `.eq('reminder_sent', false)` as the WHERE guard is the idempotency mechanism. The Supabase JS v2 `.update()` returns `count` when you add `, count: 'exact'` — use this to detect if another cron run already claimed the row. This avoids a separate SELECT FOR UPDATE.

### Pattern 3: Template Submission to Meta

**What:** From the dashboard (Phase 6 will surface this in UI), a server action or API route calls Meta's template creation endpoint.

```typescript
// POST /{WABA_ID}/message_templates
// Source: developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api
async function submitTemplateToMeta(wabaId: string, template: {
  name: string
  category: 'UTILITY' | 'MARKETING'
  language: string
  bodyText: string
  exampleValues: string[]
}): Promise<{ id: string; status: string }> {
  const version = process.env.WHATSAPP_API_VERSION || 'v23.0'
  const url = `https://graph.facebook.com/${version}/${wabaId}/message_templates`

  const body = {
    name: template.name,
    category: template.category,
    language: template.language,
    components: [{
      type: 'BODY',
      text: template.bodyText,
      example: {
        body_text: [template.exampleValues],  // Meta requires example values for variables
      },
    }],
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Template submission failed: ${response.status}`)
  }
  return response.json()
}
```

**Key:** The `example` field in `BODY` components is **required by Meta** when variables like `{{1}}` are present. Submissions without example values are rejected. This is a common pitfall.

### Pattern 4: pg_cron Schedule (SQL Migration)

```sql
-- Enable extensions (if not already enabled on Supabase project)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule reminder job every 5 minutes
SELECT cron.schedule(
  'send-appointment-reminders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<NEXT_PUBLIC_APP_URL>/api/reminders/send',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
```

**For local dev:** pg_cron cannot reach `localhost` from inside the Supabase Docker network. The route should also be callable manually via `curl -X POST http://localhost:3000/api/reminders/send -H "x-cron-secret: <secret>"`. The SQL migration for pg_cron is only applied to the hosted Supabase project.

### Pattern 5: The 3 Standard Templates

The 3 templates to define, submit, and store in `whatsapp_templates` per tenant:

| template_name | Category | Body text | Variables |
|---------------|----------|-----------|-----------|
| `rdv_reminder` | UTILITY | `Rappel : votre rendez-vous chez {{2}} est prévu le {{1}}. À bientôt !` | `{{1}}` = datetime, `{{2}}` = salon name |
| `rdv_confirmation` | UTILITY | `Votre rendez-vous chez {{2}} est confirmé pour le {{1}}. Merci !` | `{{1}}` = datetime, `{{2}}` = salon name |
| `rdv_cancellation` | UTILITY | `Votre rendez-vous chez {{2}} du {{1}} a été annulé. Contactez-nous pour en prendre un nouveau.` | `{{1}}` = datetime, `{{2}}` = salon name |

**IMPORTANT:** Template names must be lowercase, alphanumeric + underscores only (Meta constraint). Language code for French: `fr`. For Moroccan context, `fr` is the correct code (not `fr_FR`).

### Anti-Patterns to Avoid

- **Free-form message for reminders:** Sending a plain text reminder via `sendTextMessage()` is only valid within the 24h customer service window after the last client message. For a 24h-advance reminder the client likely hasn't messaged in days — this will fail with Meta error 131026 ("Message failed to send because more than 24 hours have passed"). Templates MUST be used.
- **Single global `reminder_sent` flag without WHERE guard:** Using `UPDATE bookings SET reminder_sent=true WHERE id=X` without the `AND reminder_sent=false` guard allows two concurrent cron runs to both fire. Always use the `WHERE reminder_sent=false` guard.
- **Hardcoding phoneNumberId in sendTemplateMessage:** The single env-var `WHATSAPP_PHONE_NUMBER_ID` only works for single-tenant. Phase 5 must fetch the `phone_number_id` from the `phone_numbers` table per tenant.
- **Submitting template without `example` field:** Meta rejects BODY components with `{{1}}` variables if no `example.body_text` is provided.
- **Using `MARKETING` category for reminders:** Appointment reminders are `UTILITY`. Mislabeling as `MARKETING` increases per-message cost and subjects templates to marketing opt-out rules.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job scheduling | Custom timer loop in Next.js | pg_cron | Next.js API routes are stateless; no persistent process |
| HTTP from Postgres | Custom webhook table + polling | pg_net (Supabase built-in) | pg_net is maintained, async, non-blocking |
| Template variable substitution | Custom string interpolation | Meta's components/parameters array | Meta does the substitution on their end from the template definition |
| Idempotency lock | Redis distributed lock | SQL WHERE guard on `reminder_sent=false` | Already in schema; Postgres serializes the update atomically |

**Key insight:** The `reminder_sent` boolean + partial index already in the schema is the entire idempotency story. No extra locking mechanism is needed.

---

## Common Pitfalls

### Pitfall 1: waba_id vs phone_number_id confusion

**What goes wrong:** Using `WHATSAPP_PHONE_NUMBER_ID` to submit templates. Template submission goes to `/{WABA_ID}/message_templates`. Sending messages goes to `/{PHONE_NUMBER_ID}/messages`. These are different IDs.

**Why it happens:** Both look like numeric Meta IDs. Easy to conflate.

**How to avoid:** `phone_numbers.waba_id` already exists in schema (Phase 1). Use it for template submission. Use `phone_numbers.phone_number_id` for sending messages.

**Warning signs:** Meta returns error 100 "Param waba_id must be a valid WABA ID" — means you passed a phone_number_id instead.

### Pitfall 2: Template approval lag

**What goes wrong:** Phase 5 builds template submission + reminder send in one pass. If templates aren't approved yet, reminders silently fail.

**Why it happens:** Meta approval takes 1-48h. Templates submitted mid-dev won't be approved when the reminder route first runs.

**How to avoid:** The reminder route checks `meta_status = 'APPROVED'` before sending. If not approved, it skips (no error). The `whatsapp_templates.meta_status` field must be kept up to date — either by polling Meta's GET endpoint or by a webhook. For Phase 5, manual status update via Supabase dashboard is acceptable (Phase 7 automates onboarding).

**Warning signs:** `sent: 0` from reminder route even when bookings are due + templates exist but have `meta_status = 'pending'`.

### Pitfall 3: pg_cron can't reach localhost

**What goes wrong:** Developer applies the pg_cron migration to local Supabase — pg_cron fires but can't reach `localhost:3000` (Next.js dev server is outside Docker).

**Why it happens:** pg_cron runs inside the Supabase Postgres container. `localhost` inside that container is the DB, not the host machine.

**How to avoid:** Don't apply the pg_cron schedule migration to the local Supabase instance. Provide a manual trigger script for local dev: `curl -X POST http://localhost:3000/api/reminders/send -H "x-cron-secret: ..."`. Apply the pg_cron migration only to hosted Supabase (production/staging).

**Warning signs:** pg_cron job shows `failed` in `cron.job_run_details` with "connection refused" errors.

### Pitfall 4: Missing `phoneNumberId` in sendTemplateMessage signature

**What goes wrong:** The existing `SendTemplatePayload` doesn't include `phoneNumberId`. The current stub uses a global env var. In multi-tenant context the correct `phone_number_id` must come from the DB.

**How to avoid:** Extend `SendTemplatePayload` in `types.ts` to include `phoneNumberId: string`. Update the function signature. The existing test `sendTemplateMessage stub throws not-implemented` just tests that it throws — it doesn't assert the payload shape, so adding the field is safe.

### Pitfall 5: Supabase JS `.update()` count

**What goes wrong:** Trying to use `.update().count('exact')` to detect if another worker already claimed the row — but Supabase JS v2 `.update()` returns count differently than `.insert()`.

**How to avoid:** Use `.update({ reminder_sent: true }, { count: 'exact' }).eq('id', booking.id).eq('reminder_sent', false)` — the count option goes as the second argument to `.update()`. If `count === 0`, the row was already processed. Verified pattern from project: Phase 2 used `upsert(payload, { ignoreDuplicates: true, count: 'exact' })` with the same approach.

---

## Code Examples

### Sending a template message (verified Meta API structure)

```typescript
// Source: Meta Graph API docs — confirmed via official template-api reference + WebSearch cross-verification
const body = {
  messaging_product: 'whatsapp',
  to: '+212600123456',
  type: 'template',
  template: {
    name: 'rdv_reminder',
    language: { code: 'fr' },
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'lundi 5 mai à 14h00' },  // {{1}}
          { type: 'text', text: 'Salon Fatima' },           // {{2}}
        ],
      },
    ],
  },
}
// POST to: https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/messages
```

### Submitting a template to Meta for approval

```typescript
// Source: developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api
const body = {
  name: 'rdv_reminder',
  category: 'UTILITY',
  language: 'fr',
  components: [
    {
      type: 'BODY',
      text: 'Rappel : votre rendez-vous chez {{2}} est prévu le {{1}}. À bientôt !',
      example: {
        body_text: [['lundi 5 mai à 14h00', 'Salon Fatima']],  // REQUIRED for variables
      },
    },
  ],
}
// POST to: https://graph.facebook.com/v23.0/{WABA_ID}/message_templates
```

### Checking template status

```typescript
// GET https://graph.facebook.com/v23.0/{WABA_ID}/message_templates?name=rdv_reminder
// Response includes: { data: [{ id, name, status: 'APPROVED'|'PENDING'|'REJECTED', ... }] }
```

### pg_cron job schedule (SQL)

```sql
-- Source: supabase.com/docs/guides/cron/quickstart — confirmed via WebFetch
SELECT cron.schedule(
  'send-appointment-reminders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_APP_URL/api/reminders/send',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
-- Store CRON_SECRET in Supabase Vault or as a DB setting (SET app.cron_secret = '...')
```

### Idempotent reminder_sent update

```sql
-- Source: project Phase 2 pattern (upsert with count) adapted for update
-- Supabase JS v2 equivalent:
const { count } = await supabase
  .from('bookings')
  .update({ reminder_sent: true }, { count: 'exact' })
  .eq('id', bookingId)
  .eq('reminder_sent', false)   // idempotency guard
// if count === 0: another worker already sent it — skip Meta call
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Twilio/WATI reseller templates | Meta Cloud API direct template submission | Project decision (Phase 1) | Full control, lower cost, direct approval |
| Vercel cron (Pro) | Supabase pg_cron + pg_net | N/A — never used here | Free tier, no deployment dependency, works with localhost |
| node-cron in Next.js | pg_cron at DB level | Best practice for serverless | Survives dyno restarts, tracked in DB, not dependent on app server |

**Deprecated/outdated:**

- `sendTemplateMessage()` stub (throws "not implemented"): will be replaced in this phase.
- `meta_status: 'pending'` default on new templates: update flow must set this to `'APPROVED'` after Meta confirms, or query Meta's GET endpoint to sync status.

---

## Open Questions

1. **waba_id availability per tenant**
   - What we know: `phone_numbers.waba_id` column exists (Phase 1 schema). Value is set at phone number registration.
   - What's unclear: In local dev/test, the `waba_id` column may be empty or a stub value since the real WABA connection happens in Phase 7 (Onboarding). Phase 5 code that calls `/{waba_id}/message_templates` needs a real value to test against the sandbox.
   - Recommendation: Add `WHATSAPP_WABA_ID` to `.env.local` as a fallback for local dev/test. The reminder route can skip the template submission concern — that part is triggered manually from dashboard (Phase 6 UI) or seeded.

2. **Template sync strategy**
   - What we know: Meta template approval is async (1-48h). The `meta_status` field tracks this.
   - What's unclear: How does `meta_status` go from `'pending'` to `'APPROVED'`? Meta doesn't push a webhook for this by default.
   - Recommendation: For Phase 5, a manual-update approach is acceptable. Add a `/api/templates/sync` route that calls `GET /{WABA_ID}/message_templates` and updates `meta_status` in DB. This can be called from the dashboard or by a second pg_cron job (daily).

3. **Multi-tenant phoneNumberId in sendTemplateMessage**
   - What we know: Current `SendTemplatePayload` lacks `phoneNumberId`. Global env var `WHATSAPP_PHONE_NUMBER_ID` is a single-tenant assumption.
   - What's unclear: None — this is a clear required change.
   - Recommendation: Add `phoneNumberId: string` to `SendTemplatePayload` in `types.ts`. Pass it from the reminder route which fetches it from `phone_numbers` table.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 |
| Config file | vitest.config.ts (inferred from project; existing tests run fine) |
| Quick run command | `vitest run --reporter=verbose` (from `f:/Bot_WhatsApp/salon-bot`) |
| Full suite command | `vitest run --reporter=verbose` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TPL-01 | `sendTemplateMessage()` POSTs correct JSON to Meta messages endpoint | unit | `vitest run tests/send.test.ts` | ✅ (needs new test cases in existing file) |
| TPL-01 | Template submission to Meta WABA endpoint sends correct body with `example` field | unit | `vitest run tests/templates.test.ts` | ❌ Wave 0 |
| TPL-02 | Reminder route queries bookings in 23-25h window and sends template | unit | `vitest run tests/reminders.test.ts` | ❌ Wave 0 |
| TPL-02 | Reminder route skips booking where `reminder_sent=true` | unit | `vitest run tests/reminders.test.ts` | ❌ Wave 0 |
| TPL-02 | Reminder route skips booking with no approved template | unit | `vitest run tests/reminders.test.ts` | ❌ Wave 0 |
| TPL-02 | Reminder route rollbacks `reminder_sent` on Meta API failure | unit | `vitest run tests/reminders.test.ts` | ❌ Wave 0 |
| TPL-02 | Reminder route returns 401 without correct cron secret | unit | `vitest run tests/reminders.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `vitest run tests/send.test.ts tests/reminders.test.ts tests/templates.test.ts`
- **Per wave merge:** `vitest run --reporter=verbose` (full 100+ test suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/reminders.test.ts` — covers TPL-02 (reminder route behavior, idempotency, auth guard)
- [ ] `tests/templates.test.ts` — covers TPL-01 (template submission to Meta, `sendTemplateMessage` implementation)

---

## Sources

### Primary (HIGH confidence)

- Meta Graph API Template API reference — `developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api` — template submission body structure, `example` field requirement, status values
- Supabase Cron quickstart — `supabase.com/docs/guides/cron/quickstart` — `cron.schedule()` SQL syntax, `net.http_post()` usage, 5-minute schedule
- Project codebase (Phase 1 schema `20260331000001_create_schema.sql`) — confirmed `whatsapp_templates`, `bookings.reminder_sent`, `phone_numbers.waba_id` fields

### Secondary (MEDIUM confidence)

- WebSearch: Meta template message send structure — multiple sources consistent on `messaging_product`, `type: "template"`, `template.language.code`, `template.components[].parameters[]` shape
- WebSearch: pg_cron + pg_net patterns — Supabase docs + community examples consistent on `net.http_post()` syntax, header passing

### Tertiary (LOW confidence — needs sandbox validation)

- Meta approval timing "24-48h" — common community claim; actual time varies by WABA verification status
- `fr` as the correct language code for French templates (vs `fr_FR`) — not definitively verified against Meta's current language code list; test in sandbox

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries already in project, no new installations needed
- Architecture patterns: HIGH — sendTemplateMessage structure verified against Meta API docs, pg_cron syntax verified against Supabase docs
- Pitfalls: HIGH — waba_id vs phone_number_id confusion is a known Meta developer pain point; localhost pg_cron limitation is documented Supabase behavior; idempotency pattern is proven by Phase 2's deduplication approach
- Template language codes: LOW — `fr` vs `fr_FR` needs sandbox verification

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (Meta API changes infrequently for template send; pg_cron syntax is stable)
