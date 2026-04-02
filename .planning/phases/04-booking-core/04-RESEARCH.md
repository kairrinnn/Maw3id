# Phase 4: Booking Core - Research

**Researched:** 2026-04-02
**Domain:** Postgres booking persistence, FSM integration, race-condition prevention, WhatsApp notifications
**Confidence:** HIGH (schema read directly from migrations; FSM logic read directly from source)

---

## Summary

Phase 4 converts the FSM's in-memory "confirmed" signal into a durable Postgres booking record, then adds modify and cancel flows on top. The bookings table already exists from Phase 1 and was corrected in the pre-Phase 3 migration — the unique constraint strategy is already decided (conditional partial indexes keyed on `staff_id` presence). The main implementation challenge is the **double-booking race condition**: Supabase JS v2 has no native SELECT FOR UPDATE syntax, so the correct approach is an RPC (Postgres function) that wraps the INSERT inside a serializable transaction.

The second major challenge is BOOK-07 (owner notification): the tenants table and bot_configs table have **no owner WhatsApp number field**. A migration is required to add `owner_notification_wa_id` to `bot_configs` (or `tenants`) before owner notifications can be sent. This is a schema gap that must be addressed in Wave 0 of the plan.

The FSM integration point is clear: `processIntent` already transitions to `step: 'confirmed'` and returns a `replyText`. The webhook route (`processMessage`) calls `saveConversationState` immediately after. Booking persistence must happen **between** these two calls — after FSM confirms but before the state is saved — to keep the single request atomic from the client's perspective.

**Primary recommendation:** Use a Postgres RPC (`create_booking`) with serializable isolation for conflict-safe inserts. Use `SELECT FOR UPDATE` inside the function for the slot check. Treat the RPC's unique constraint violation as the conflict signal and return a structured error the route can handle.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BOOK-01 | Client books via WhatsApp (service + date + time) → immediate confirmation | FSM confirming→confirmed already works; need INSERT into bookings + send confirmation text |
| BOOK-02 | Client modifies date/time of confirmed appointment | Requires new FSM steps: `modify_awaiting_datetime`, UPDATE bookings row, old slot freed |
| BOOK-03 | Client cancels confirmed appointment, owner notified | FSM intent='cancel' at step='confirmed'; UPDATE status='cancelled'; owner_notification_wa_id migration needed |
| BOOK-04 | Client queries upcoming appointments ("mes rdv") | intent='query' handler; SELECT bookings WHERE client_wa_id AND appointment_at > now() |
| BOOK-05 | Double booking impossible — unique constraint + Postgres locking | Partial unique indexes exist (pre-Phase 3 migration); RPC wrapping INSERT for race safety |
| BOOK-06 | Immediate confirmation sent after booking confirmed | replyText from confirming step already contains summary; ensure it fires AFTER successful DB insert |
| BOOK-07 | Salon owner notified on cancellation | owner_notification_wa_id missing from schema — migration required; sendTextMessage to owner number |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | ^2.101.1 (in use) | DB reads/writes, RPC calls | Already in project; service client bypasses RLS for booking inserts |
| Postgres RPC (plpgsql) | n/a | Atomic slot-lock + INSERT in one DB round-trip | Cannot do SELECT FOR UPDATE from Supabase JS directly |
| vitest | ^4.1.2 (in use) | Unit + integration tests | Already configured; `vitest run --reporter=verbose` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.3.6 (in use) | Validate booking state before DB write | Ensure service_id, date, time are non-null before attempting insert |
| chrono-node | ^2.9.0 (in use) | Already handles date parsing in FSM | Not needed in booking layer; already resolved upstream |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Postgres RPC for conflict-safe insert | Supabase JS `.insert()` with catch | `.insert()` cannot acquire row-level lock before checking; race window exists between check and insert |
| `pg_advisory_lock` | Partial unique index + serializable RPC | Advisory locks require long-held connections and complicate cleanup; partial indexes are schema-enforced and release automatically |

**Installation:** No new packages needed. All dependencies are in place.

---

## Architecture Patterns

### Recommended Project Structure (new files for Phase 4)
```
src/
├── lib/
│   ├── bookings/
│   │   ├── create.ts         # createBooking(supabase, params) → booking row or ConflictError
│   │   ├── modify.ts         # modifyBooking(supabase, bookingId, newDatetime) → updated row
│   │   ├── cancel.ts         # cancelBooking(supabase, bookingId) → void
│   │   ├── query.ts          # queryUpcomingBookings(supabase, tenantId, waId) → Booking[]
│   │   └── types.ts          # BookingRow, BookingConflictError
│   └── fsm/
│       └── machine.ts        # extend FSM: modify_awaiting_datetime, booking_id in state
supabase/
└── migrations/
    └── YYYYMMDD_phase4.sql   # add owner_notification_wa_id to bot_configs; Wave 0
tests/
└── booking-create.test.ts
    booking-conflict.test.ts
    booking-modify.test.ts
    booking-cancel.test.ts
    booking-query.test.ts
    fsm-booking-integration.test.ts
```

### Pattern 1: Booking Insertion via Postgres RPC

**What:** A `plpgsql` function that takes `(p_tenant_id, p_service_id, p_staff_id, p_client_wa_id, p_client_name, p_appointment_at, p_conversation_id)` and performs an atomic slot check + insert.

**When to use:** Every new booking creation. Never call `.insert()` on `bookings` directly from the route.

**Example:**
```sql
-- Migration: create_booking RPC
CREATE OR REPLACE FUNCTION public.create_booking(
  p_tenant_id       UUID,
  p_service_id      UUID,
  p_staff_id        UUID,        -- NULL for solo salons
  p_client_wa_id    TEXT,
  p_client_name     TEXT,
  p_conversation_id UUID,
  p_appointment_at  TIMESTAMPTZ
)
RETURNS public.bookings
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  -- Lock competing rows for this slot (prevents race between concurrent transactions)
  PERFORM 1
    FROM public.bookings
   WHERE tenant_id = p_tenant_id
     AND appointment_at = p_appointment_at
     AND status = 'confirmed'
     AND (
       (p_staff_id IS NULL AND staff_id IS NULL)
       OR (staff_id = p_staff_id)
     )
   FOR UPDATE;

  INSERT INTO public.bookings (
    tenant_id, service_id, staff_id, client_wa_id, client_name,
    conversation_id, appointment_at, status
  )
  VALUES (
    p_tenant_id, p_service_id, p_staff_id, p_client_wa_id, p_client_name,
    p_conversation_id, p_appointment_at, 'confirmed'
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;
```

**Calling from Supabase JS:**
```typescript
// Source: Supabase JS .rpc() — service client bypasses RLS
const { data, error } = await supabase.rpc('create_booking', {
  p_tenant_id: tenantId,
  p_service_id: state.service_id,
  p_staff_id: null,
  p_client_wa_id: clientWaId,
  p_client_name: state.client_name ?? null,
  p_conversation_id: conversationId,
  p_appointment_at: `${state.date}T${state.time}:00+00:00`,
})
if (error?.code === '23505') {
  // unique_violation — slot taken
  return { conflict: true }
}
```

### Pattern 2: FSM State Extension for Modify Flow

**What:** Add `booking_id` to `ConversationState` and new FSM steps for the modify path.

**When to use:** When `intent === 'modify'` and `state.step === 'confirmed'` (client has a live booking).

**New steps to add:**
- `modifying` — client said "modifier", FSM stores `booking_id`, asks for new date/time
- `modify_awaiting_datetime` — same as `awaiting_datetime` but transitions to `modify_confirming`
- `modify_confirming` — shows new time to client, asks "oui/non"

**State schema extension:**
```typescript
// In types.ts — add to ConversationStateSchema
booking_id: z.string().uuid().nullable().optional(),

// New FSM steps to add to FSM_STEPS array:
'modifying', 'modify_awaiting_datetime', 'modify_confirming'
```

**Trigger keywords for modify intent:**
```typescript
// In machine.ts — detect modify keywords at 'confirmed' step
const MODIFY_KEYWORDS = /\b(modifier|changer|reporter|deplacer|changer.*heure|nouvelle.*heure)\b/i
```

### Pattern 3: Integration Point in Webhook Route

**What:** The booking persistence call sits between `processIntent()` returning `step: 'confirmed'` and `saveConversationState()`.

**When to use:** Always — the route is the single orchestration point.

```typescript
// In processMessage() in route.ts — after processIntent():
const { nextState, replyText } = processIntent(state, intent, activeServices, userText)

if (nextState.step === 'confirmed' && state.step === 'confirming') {
  // Transition to confirmed — persist booking
  const result = await createBooking(supabase, {
    tenantId,
    clientWaId,
    conversationId,     // fetched or created earlier
    serviceId: nextState.service_id!,
    clientName: nextState.client_name ?? null,
    staffId: null,
    appointmentAt: `${nextState.date}T${nextState.time}:00+00:00`,
  })

  if (result.conflict) {
    // Slot taken — override reply, do NOT save confirmed state
    await sendTextMessage(clientWaId,
      `Desolé, ce créneau est déjà pris. Voulez-vous choisir une autre heure?`,
      phoneNumberId)
    await saveConversationState(supabase, tenantId, clientWaId,
      { ...state, step: 'awaiting_datetime' })
    return
  }

  // Save booking_id into state for future modify/cancel
  const stateWithBooking = { ...nextState, booking_id: result.booking.id }
  await saveConversationState(supabase, tenantId, clientWaId, stateWithBooking)
  await sendTextMessage(clientWaId, replyText, phoneNumberId)
  return
}

await saveConversationState(supabase, tenantId, clientWaId, nextState)
await sendTextMessage(clientWaId, replyText, phoneNumberId)
```

### Pattern 4: BOOK-04 — "mes rdv" Query

**What:** When `intent === 'query'`, SELECT from bookings for this client, format a list.

**Response format:**
```
Vos prochains rendez-vous:
1. Coupe - lundi 7 avril à 14h00
2. Coloration - vendredi 11 avril à 10h00

Pour annuler ou modifier, dites "annuler rdv 1" ou "modifier rdv 1".
```

**Implementation:**
```typescript
// lib/bookings/query.ts
export async function queryUpcomingBookings(
  supabase: SupabaseClient,
  tenantId: string,
  clientWaId: string
): Promise<BookingRow[]> {
  const { data } = await supabase
    .from('bookings')
    .select('id, appointment_at, status, services(name)')
    .eq('tenant_id', tenantId)
    .eq('client_wa_id', clientWaId)
    .eq('status', 'confirmed')
    .gte('appointment_at', new Date().toISOString())
    .order('appointment_at', { ascending: true })
    .limit(5)
  return (data ?? []) as BookingRow[]
}
```

### Pattern 5: BOOK-07 — Owner Notification

**What:** On cancellation, send a WhatsApp message to the salon owner's number.

**Schema gap:** No owner notification number is stored. Solution: add `owner_notification_wa_id TEXT` to `bot_configs`.

**Migration (Wave 0):**
```sql
ALTER TABLE public.bot_configs
  ADD COLUMN owner_notification_wa_id TEXT;
```

**Implementation:**
```typescript
// In cancel flow — after UPDATE bookings SET status='cancelled'
const { data: botCfg } = await supabase
  .from('bot_configs')
  .select('owner_notification_wa_id')
  .eq('tenant_id', tenantId)
  .single()

if (botCfg?.owner_notification_wa_id) {
  const msg = `Annulation: ${state.service_name} le ${state.date} à ${state.time} (client: ${clientWaId})`
  await sendTextMessage(botCfg.owner_notification_wa_id, msg, phoneNumberId)
}
// Notification failure must NOT break the client's cancellation flow
```

### Anti-Patterns to Avoid

- **Direct `.insert()` on bookings without RPC:** No lock can be taken between the check and insert; two simultaneous requests will both see the slot as free and both insert, causing a duplicate that the unique index rejects as an unhandled error.
- **Sending confirmation before DB insert succeeds:** Client gets "confirmed" text but no booking row exists. Always INSERT first, send text second.
- **Saving `step: 'confirmed'` to conversations before booking insert succeeds:** On retry, the FSM sees `confirmed` step and skips booking creation entirely.
- **Storing `booking_id` only in ConversationState:** State can be reset. Keep `booking_id` in state for fast lookup but validate against DB on modify/cancel.
- **Blocking the webhook response on owner notification:** If owner's WhatsApp send fails, the client's cancellation should still complete. Wrap owner notification in try/catch; log failures, don't throw.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slot conflict detection | Custom SELECT + conditional INSERT logic in TypeScript | Postgres RPC with PERFORM...FOR UPDATE | Race window between JS check and insert; DB-level lock is the only safe approach |
| Date/time formatting for replies | Custom date formatter | `toLocaleString('fr-FR', { timeZone })` or simple template strings | chrono-node already resolved the date upstream; just format YYYY-MM-DD + HH:MM |
| Booking state machine for modify/cancel | Separate state machine class | Extend existing FSM steps in machine.ts | FSM already handles step transitions; adding new steps keeps all state logic co-located |
| Upcoming appointment list formatting | Template engine | Simple JS array map + join | 5 lines max; no dependency warranted |

**Key insight:** The most dangerous custom code in booking systems is the "check then insert" pattern. Any check performed in application code has a race window. The database is the only safe place to enforce "one booking per slot."

---

## Common Pitfalls

### Pitfall 1: Timezone Ambiguity in appointment_at
**What goes wrong:** `state.date` is "2026-04-07" and `state.time` is "14:00". Concatenating them as `2026-04-07T14:00:00` without a timezone creates an ambiguous timestamp. Postgres stores it as UTC. Client in Morocco (UTC+1) books 14:00 local time but the slot lands at 13:00 UTC, causing off-by-one conflicts.
**Why it happens:** chrono-node resolves dates in local timezone; the resolved strings don't carry timezone info.
**How to avoid:** Decide on a convention in Wave 0. Simplest approach for V1: treat all times as Morocco Standard Time (UTC+1, no DST). Store as UTC: append `+01:00` when constructing the TIMESTAMPTZ. Document the convention in code comments.
**Warning signs:** Bookings appearing one hour off in dashboard display; conflict detection failing for adjacent slots.

### Pitfall 2: FSM Step Mismatch on Booking Retry
**What goes wrong:** Booking INSERT fails (DB error, network timeout). The route catches the error and returns without updating `conversations.state`. On client retry, `state.step` is still `'confirming'`. The FSM transitions to `confirmed` again and tries to INSERT the same booking twice — now hitting a unique constraint error as a false conflict.
**Why it happens:** State save and booking insert are not atomic; a partial failure leaves the FSM and DB out of sync.
**How to avoid:** Only save `step: 'confirmed'` to conversation state AFTER a successful booking insert. If insert fails, keep state at `'confirming'` and send a "try again" message.

### Pitfall 3: Modify Flow Overwrites Existing Booking Without Freeing Old Slot
**What goes wrong:** Client modifies from April 7 14:00 to April 8 10:00. Code INSERTs a new booking for the new slot but doesn't UPDATE/cancel the old one. Old slot remains `confirmed`, preventing another client from booking it.
**Why it happens:** Treating modify as insert-new rather than update-existing.
**How to avoid:** Modify must be a single UPDATE on the existing booking row: `UPDATE bookings SET appointment_at = new_time WHERE id = booking_id`. Run this inside an RPC that also does the slot check on the new time.

### Pitfall 4: `booking_id` Not in ConversationState (existing gap)
**What goes wrong:** Client says "modifier" but `state.booking_id` is null. Code can't look up which booking to modify.
**Why it happens:** Current `ConversationStateSchema` has no `booking_id` field.
**How to avoid:** Add `booking_id` to the Zod schema and store it when transitioning to `confirmed`. Required in Wave 0 of the plan.

### Pitfall 5: Owner Notification Number Missing (schema gap)
**What goes wrong:** BOOK-07 requires notifying the owner. `bot_configs` has no `owner_notification_wa_id` column.
**Why it happens:** Field was not anticipated in Phase 1 schema design.
**How to avoid:** Wave 0 migration must add `owner_notification_wa_id TEXT NULLABLE` to `bot_configs`. Treat NULL as "no notification configured" — silently skip, don't error.

### Pitfall 6: cancel Intent Collides With FSM's Existing cancel Logic
**What goes wrong:** The FSM's `cancel` intent at the `greeting`/`awaiting_*` steps cancels the in-progress flow (not a DB booking). At `confirmed` step, `cancel` must cancel an actual DB booking. Current `machine.ts` line 16 intercepts `cancel` globally BEFORE the step switch — it will fire even at `confirmed` step.
**Why it happens:** The global cancel override in machine.ts was designed for "abort this booking attempt", not "cancel a persisted booking."
**How to avoid:** The global cancel guard at line 16 in machine.ts must be scoped: only fire for steps BEFORE `confirmed`. At `confirmed` step, cancel intent falls through to the step handler which initiates the DB cancellation flow.

---

## Code Examples

### Verified: Supabase JS RPC call pattern
```typescript
// Source: Supabase JS v2 docs — .rpc() for custom functions
const { data, error } = await supabase.rpc('create_booking', {
  p_tenant_id: tenantId,
  p_appointment_at: appointmentAt,
  // ... other params
})
// error.code === '23505' means unique_violation (slot conflict)
// error.code === 'P0001' means RAISE EXCEPTION from plpgsql (custom conflict signal)
```

### Verified: Supabase JS join syntax for query
```typescript
// Fetch bookings with service name in one query
const { data } = await supabase
  .from('bookings')
  .select('id, appointment_at, services(name)')
  .eq('tenant_id', tenantId)
  .eq('client_wa_id', clientWaId)
  .eq('status', 'confirmed')
  .gte('appointment_at', new Date().toISOString())
  .order('appointment_at', { ascending: true })
```

### Verified: Conflict detection via error code
```typescript
// Postgres unique_violation = error code 23505
// Supabase surfaces this in error.code
if (error?.code === '23505') {
  // Slot conflict — inform client
}
```

### Verified: UPDATE booking status (cancel)
```typescript
const { error } = await supabase
  .from('bookings')
  .update({ status: 'cancelled' })
  .eq('id', bookingId)
  .eq('tenant_id', tenantId)     // tenantId safety check — service client bypasses RLS but explicit is safer
  .eq('status', 'confirmed')     // only cancel if still confirmed (idempotency)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SELECT then INSERT (application-level check) | Postgres RPC with SELECT FOR UPDATE inside transaction | Industry standard | Eliminates race condition window |
| Global FSM cancel override | Step-scoped cancel routing | Phase 4 | Required to distinguish "abort flow" from "cancel DB booking" |
| No booking_id in state | booking_id in ConversationState | Phase 4 migration | Required for modify/cancel to target correct booking row |
| No owner contact info | owner_notification_wa_id in bot_configs | Phase 4 migration | Required for BOOK-07 |

**Deprecated/outdated:**
- `UNIQUE(tenant_id, appointment_at)` single index: removed in pre-Phase 3 migration. Replaced by two partial indexes (staff_id IS NULL / IS NOT NULL). Do not recreate the old constraint.

---

## Open Questions

1. **Timezone convention**
   - What we know: Morocco Standard Time is UTC+1 (no daylight saving). chrono-node resolves dates in server's local time.
   - What's unclear: Server timezone in production (Vercel defaults to UTC). If server is UTC and client expects UTC+1, all times will be off by 1 hour.
   - Recommendation: In Wave 0, decide explicitly: either (a) accept UTC throughout (display as UTC, tell clients times are UTC) or (b) always append `+01:00` when constructing TIMESTAMPTZ. Option (b) is recommended for V1 Morocco-only deployment.

2. **Modify flow: what is the booking_id when client says "modifier" mid-flow?**
   - What we know: `state.booking_id` will be set after BOOK-01 is implemented.
   - What's unclear: What if the client has multiple bookings? "modifier" is ambiguous. BOOK-04 query shows a numbered list — should modify use "modifier rdv 1"?
   - Recommendation: For V1, "modifier" always targets the most recent confirmed booking for that client. Add numbered selection in V2.

3. **Conversation_id for booking insert**
   - What we know: `bookings.conversation_id` references `conversations.id`. The webhook upserts the conversation row but doesn't return the UUID.
   - What's unclear: The route currently does a `from('conversations').upsert()` but discards the returned id.
   - Recommendation: Change the upsert to a `select('id')` after upsert, or use `.upsert().select('id').single()` to capture `conversation_id` for the booking insert.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 |
| Config file | vitest.config.ts (root of salon-bot) |
| Quick run command | `cd F:/Bot_WhatsApp/salon-bot && npx vitest run tests/booking-create.test.ts --reporter=verbose` |
| Full suite command | `cd F:/Bot_WhatsApp/salon-bot && npx vitest run --reporter=verbose` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOOK-01 | createBooking() inserts row and returns booking id | unit | `vitest run tests/booking-create.test.ts` | ❌ Wave 0 |
| BOOK-01 | processMessage() triggers booking creation on confirming→confirmed transition | unit | `vitest run tests/fsm-booking-integration.test.ts` | ❌ Wave 0 |
| BOOK-02 | modifyBooking() updates appointment_at on existing row | unit | `vitest run tests/booking-modify.test.ts` | ❌ Wave 0 |
| BOOK-02 | FSM transitions correctly through modifying→modify_confirming→confirmed | unit | `vitest run tests/fsm-machine.test.ts` | ❌ extend existing |
| BOOK-03 | cancelBooking() sets status='cancelled' | unit | `vitest run tests/booking-cancel.test.ts` | ❌ Wave 0 |
| BOOK-04 | queryUpcomingBookings() returns only future confirmed bookings | unit | `vitest run tests/booking-query.test.ts` | ❌ Wave 0 |
| BOOK-05 | createBooking() returns conflict error on duplicate slot | unit | `vitest run tests/booking-conflict.test.ts` | ❌ Wave 0 |
| BOOK-05 | Concurrent inserts: only one succeeds (race condition) | manual | Manual test with two simultaneous requests | manual-only |
| BOOK-06 | sendTextMessage called AFTER successful insert (not before) | unit | `vitest run tests/fsm-booking-integration.test.ts` | ❌ Wave 0 |
| BOOK-07 | Owner notification sent when owner_notification_wa_id is set | unit | `vitest run tests/booking-cancel.test.ts` | ❌ Wave 0 |
| BOOK-07 | Owner notification skipped silently when wa_id is null | unit | `vitest run tests/booking-cancel.test.ts` | ❌ Wave 0 |

**Manual-only justification (BOOK-05 race):** True concurrency cannot be simulated in unit tests without real DB + parallel connections. Verify by running two curl requests simultaneously against dev DB and confirming only one booking row is created.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/booking-*.test.ts --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/booking-create.test.ts` — covers BOOK-01, BOOK-05, BOOK-06
- [ ] `tests/booking-modify.test.ts` — covers BOOK-02
- [ ] `tests/booking-cancel.test.ts` — covers BOOK-03, BOOK-07
- [ ] `tests/booking-query.test.ts` — covers BOOK-04
- [ ] `tests/booking-conflict.test.ts` — covers BOOK-05 unit path
- [ ] `tests/fsm-booking-integration.test.ts` — covers BOOK-01 route integration
- [ ] Migration: `supabase/migrations/YYYYMMDD_phase4.sql` — adds `owner_notification_wa_id`, `booking_id` to state schema
- [ ] Extend `ConversationStateSchema` with `booking_id` and new FSM steps

---

## Sources

### Primary (HIGH confidence)
- Direct read of `supabase/migrations/20260331000001_create_schema.sql` — bookings table columns, original unique constraint
- Direct read of `supabase/migrations/20260402000001_pre_phase3_schema.sql` — corrected partial unique indexes, staff_id column, confirmed schema state
- Direct read of `src/lib/fsm/machine.ts` — confirmed step logic, cancel intercept at line 16, state transition behavior
- Direct read of `src/lib/fsm/types.ts` and `src/lib/llm/types.ts` — ConversationState fields, FSM_STEPS enum, intent types
- Direct read of `src/app/api/webhook/route.ts` — integration point for booking creation, processMessage flow
- Direct read of `src/lib/whatsapp/send.ts` — sendTextMessage signature and behavior

### Secondary (MEDIUM confidence)
- Supabase JS v2 `.rpc()` documented behavior: RPC parameters map directly to Postgres function parameters; `error.code` surfaces Postgres error codes including `23505` for unique_violation
- Postgres `SELECT FOR UPDATE` inside `plpgsql` function: standard approach for lock-then-insert patterns in appointment booking systems

### Tertiary (LOW confidence)
- Race condition window in application-level check-then-insert: well-documented in booking system literature; exact behavior with Supabase connection pooling in Vercel edge runtime not directly verified

---

## Metadata

**Confidence breakdown:**
- Schema facts: HIGH — read directly from migration files
- FSM integration point: HIGH — read directly from machine.ts and route.ts
- Schema gaps (owner_notification_wa_id, booking_id): HIGH — absence confirmed by grep across all migrations
- Postgres RPC locking approach: MEDIUM — standard pattern, not verified against Supabase-specific connection pooler behavior
- Timezone handling: MEDIUM — Morocco UTC+1 confirmed; Vercel server timezone default needs verification in deployment

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (schema is stable; Supabase JS API is slow-moving)
