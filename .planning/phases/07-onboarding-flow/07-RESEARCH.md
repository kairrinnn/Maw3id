# Phase 7: Onboarding Flow - Research

**Researched:** 2026-05-09
**Domain:** Multi-step onboarding wizard, WhatsApp number provisioning, bot activation gating
**Confidence:** HIGH (UI patterns), MEDIUM (Meta API — docs are accurate but API surface changes frequently)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ONB-01 | Formulaire guidé de setup initial du salon (nom, description, services, horaires) | Multi-step wizard with URL-based step routing; Services and Schedules pages already built in Phase 6 — onboarding reuses or links to them |
| ONB-02 | Étape de connexion numéro WhatsApp avec choix : numéro dédié ou coexistence | phone_numbers table already exists; manual entry of phone_number_id + waba_id is the safe implementation path for v1 |
| ONB-03 | Mode test activable avant go-live (bot actif en sandbox sur numéro test) | Meta test WABA gives 1 test phone_number_id; bot_configs.active flag + a separate test_mode boolean on bot_configs controls which number receives |
| WA-04 | Admin peut connecter un numéro WhatsApp au salon (option numéro dédié ou coexistence) | phone_numbers row insert + bot_configs.phone_number_type enum; coexistence is informational only in v1 — no API difference |
</phase_requirements>

---

## Summary

Phase 7 wires together all prior phases into a first-run experience. A new salon owner who completes signup lands on an onboarding wizard rather than an empty dashboard. The wizard has four steps: (1) confirm/edit salon name and description, (2) add at least one service (links to /services which already exists), (3) set at least one open day (links to /schedules which already exists), and (4) connect a WhatsApp number. The bot remains inactive (`bot_configs.active = false`) until the minimum configuration gate is satisfied — at least one active service AND at least one schedule row where `closed = false`. Only after the gate passes can the owner activate the bot, optionally first in test mode using Meta's built-in test phone number.

The WhatsApp number connection step is the only genuinely new technical territory. Meta's Embedded Signup OAuth flow is the "correct" path but is complex, requires a Meta Tech Provider enrollment, and changes frequently. For v1, the pragmatic path is a manual form where the owner pastes their `phone_number_id`, `waba_id`, and `display_phone` values from Meta Business Manager — this matches how the existing `phone_numbers` table is structured and avoids embedding a moving-target OAuth widget.

The test mode (ONB-03) uses the fact that Meta provides a test phone number ID in every developer app. The owner can enter that test number ID during onboarding and set `bot_configs.active = true` while a `test_mode` flag is also set, so the bot only responds to the test WABA's incoming messages. Going live flips `test_mode = false`.

**Primary recommendation:** Implement onboarding as a linear `/onboarding/step-[1-4]` route group with server-side redirect guards. Reuse existing /services and /schedules pages for steps 2-3 by linking out, or embed the minimum-viable inline variant. Keep WhatsApp number connection as a manual form in step 4. Gate bot activation behind a server action that checks service count + open schedule count before setting `active = true`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.2.1 (pinned) | Page routing, Server Actions, Server Components | Already in use — all previous phases use it |
| React | 19.2.4 (pinned) | `useActionState` for multi-step form state | Already in use — Phase 6 used it for ServiceForm/ScheduleForm |
| Supabase JS | ^2.101.1 | DB reads/writes for onboarding progress + phone_numbers insert | Already in use |
| Zod | ^4.3.6 | Validation of phone_number_id, waba_id, display_phone inputs | Already in use in every action |
| Vitest | ^4.1.2 | Unit tests for server actions | Already in use |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next/navigation` redirect | built-in | Guard onboarding steps — redirect to correct step if prerequisites not met | Step-gate enforcement in Server Components |
| `revalidatePath` | built-in | Invalidate dashboard cache after bot activation | Every action that mutates bot_configs or phone_numbers |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| URL-based step routing (`/onboarding/1`, `/onboarding/2`) | Single-page wizard with React state | URL routing allows direct navigation, bookmark, and server-side guard per step; React state would lose progress on refresh |
| Manual credential form for WhatsApp connection | Meta Embedded Signup OAuth widget | OAuth widget is correct long-term but requires Meta Tech Provider enrollment + JS SDK + changes frequently; manual form is safer for v1 |
| `bot_configs.test_mode` boolean column | Separate `test_phone_numbers` table | Simple boolean is sufficient for v1; separate table needed only if multiple test numbers per tenant are required |

**Installation:** No new packages needed. All dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure

```
src/app/(dashboard)/
├── onboarding/
│   ├── layout.tsx           # Onboarding shell (progress bar, step indicator)
│   ├── page.tsx             # Redirects to /onboarding/1
│   ├── 1/
│   │   └── page.tsx         # Step 1: Salon profile (name, description)
│   ├── 2/
│   │   └── page.tsx         # Step 2: Services — confirms at least 1 exists, link to /services
│   ├── 3/
│   │   └── page.tsx         # Step 3: Hours — confirms at least 1 open day, link to /schedules
│   └── 4/
│       └── page.tsx         # Step 4: WhatsApp number connection + test mode + activate
│
src/app/(dashboard)/onboarding/
│   └── actions.ts           # saveSalonProfile, savePhoneNumber, activateBot, checkReadiness
│
src/lib/onboarding/
│   └── readiness.ts         # getOnboardingReadiness() — counts services + open schedules
```

### Pattern 1: URL-Based Linear Wizard with Server-Side Guards

**What:** Each step is a distinct page. Server Components fetch state and redirect to the first incomplete step if a user navigates out of order.

**When to use:** Any linear multi-step form where server state is the source of truth.

**Example:**
```typescript
// src/app/(dashboard)/onboarding/2/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Step2Page() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) redirect('/login')

  const claims = claimsData.claims as Record<string, unknown>
  const tenantId = claims.tenant_id as string | null
  if (!tenantId) redirect('/login')

  // Guard: step 1 must be complete (tenant.description must be non-null)
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, description')
    .eq('id', tenantId)
    .single()

  if (!tenant?.description) redirect('/onboarding/1')

  // Count active services
  const { count: serviceCount } = await supabase
    .from('services')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('active', true)

  return (
    <div>
      <h2>Étape 2 : Vos services</h2>
      {(serviceCount ?? 0) > 0 ? (
        <p className="text-green-700">{serviceCount} service(s) configuré(s)</p>
      ) : (
        <p className="text-yellow-700">Aucun service — ajoutez-en au moins un.</p>
      )}
      {/* Link to /services or inline ServiceForm */}
    </div>
  )
}
```

### Pattern 2: Readiness Gate Before Bot Activation

**What:** A server action checks minimum configuration before allowing `active = true`. Returns structured error if not ready.

**When to use:** Any "go live" gate that requires multiple preconditions.

**Example:**
```typescript
// src/lib/onboarding/readiness.ts
import { createClient } from '@/lib/supabase/server'

export interface ReadinessResult {
  ready: boolean
  hasService: boolean
  hasOpenDay: boolean
}

export async function getOnboardingReadiness(tenantId: string): Promise<ReadinessResult> {
  const supabase = await createClient()

  const [{ count: serviceCount }, { count: openDayCount }] = await Promise.all([
    supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('active', true),
    supabase
      .from('schedules')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('closed', false),
  ])

  const hasService = (serviceCount ?? 0) > 0
  const hasOpenDay = (openDayCount ?? 0) > 0

  return { ready: hasService && hasOpenDay, hasService, hasOpenDay }
}
```

### Pattern 3: Phone Number Manual Entry Action

**What:** Server action that validates and inserts a row into `phone_numbers` table. The phone_number_id and waba_id come from the owner copying them from Meta Business Manager.

**Example:**
```typescript
// src/app/(dashboard)/onboarding/actions.ts (excerpt)
'use server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const PhoneNumberSchema = z.object({
  phone_number_id: z.string().trim().min(5).max(100),
  waba_id: z.string().trim().min(5).max(100),
  display_phone: z.string().trim().min(8).max(20),
  connection_type: z.enum(['dedicated', 'coexistence']),
})

export async function savePhoneNumber(_prev: unknown, formData: FormData) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims as Record<string, unknown> | null
  const tenantId = (claims?.tenant_id ?? null) as string | null
  if (!tenantId) return { error: 'Non autorisé' }

  const parsed = PhoneNumberSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  // Upsert — one phone number per tenant for v1
  const { error } = await supabase
    .from('phone_numbers')
    .upsert(
      {
        tenant_id: tenantId,
        phone_number_id: parsed.data.phone_number_id,
        waba_id: parsed.data.waba_id,
        display_phone: parsed.data.display_phone,
        status: 'pending',
      },
      { onConflict: 'tenant_id' } // requires UNIQUE(tenant_id) on phone_numbers
    )

  if (error) return { error: error.message }
  revalidatePath('/onboarding/4')
  return { success: true }
}
```

### Pattern 4: Bot Activation With Test Mode

**What:** The `bot_configs` table needs a `test_mode` boolean and optionally a `test_phone_number_id` column. When `test_mode = true`, the webhook route already routes by `phone_number_id` — the test number acts as a completely separate tenant number. In practice, test mode = the tenant registers with the Meta test phone_number_id first, then when going live they update to their production number.

**Implementation approach:** No code change to the webhook. The "test mode" is purely a UI concept: the owner registers the Meta test WABA phone_number_id as their number. Going live = they re-enter their real phone_number_id. A `bot_configs.test_mode` boolean is stored for UI display only (shows "Mode test actif" badge in dashboard).

### Anti-Patterns to Avoid

- **Blocking signup with mandatory onboarding:** Never block access to /dashboard before onboarding is complete. Show a banner/prompt instead. Force-redirecting from dashboard to onboarding breaks direct URL access to /services and /schedules.
- **Hard-deleting phone_numbers rows:** The webhook already relies on `phone_numbers.phone_number_id` for routing. Changing the number = UPDATE, not DELETE + INSERT, to avoid routing gaps.
- **Activating bot without phone_number row:** The webhook route reads `phone_numbers` to identify the tenant. If no phone_number row exists, incoming messages get a silent 200 response (existing behavior). Bot can only usefully activate after a phone number is registered.
- **Embedding Meta Embedded Signup JS SDK without verification:** The OAuth widget requires `window.FB` and a valid App ID. If the SDK load fails silently, the user sees a broken UI. For v1, manual credential entry is more reliable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Step progress persistence | Custom DB `onboarding_progress` table | Derive progress from existing data: `tenants.description`, service count, schedule count, `phone_numbers` row existence | Zero new tables needed — state already exists in the schema |
| Form validation | Custom validator | Zod — already used in every Phase 6 action | Consistent, tested, type-safe |
| WhatsApp number validation | Phone number regex | Display phone is informational only — Meta validates the actual number at API call time | Don't over-validate what Meta will reject anyway |
| Multi-step state machine | Redux/Zustand | URL-based routing — each step is a server page that reads its own prerequisites | No client state needed, server is authoritative |

**Key insight:** The onboarding state is entirely derivable from the existing schema. No new "onboarding" table is needed. Progress = check tenant.description → service count → schedule open days → phone_numbers row → bot_configs.active.

---

## Common Pitfalls

### Pitfall 1: Missing UNIQUE constraint on phone_numbers.tenant_id

**What goes wrong:** The `phone_numbers` table currently has `UNIQUE(phone_number_id)` but NOT `UNIQUE(tenant_id)`. Upsert with `onConflict: 'tenant_id'` will fail with error code `42P10` (no unique constraint on column).

**Why it happens:** The schema was designed for multi-number per tenant (future v2). Phase 7 v1 assumes one number per tenant.

**How to avoid:** Phase 7 Wave 0 migration adds `UNIQUE(tenant_id)` on `phone_numbers`. Use same idempotent DO block pattern as Phase 6-00 migration.

**Warning signs:** Supabase returns `42P10` on upsert.

### Pitfall 2: bot_configs.active = true Without Phone Number Row

**What goes wrong:** Bot shows as "active" in dashboard but never responds to any messages because the webhook can't route to the tenant (no `phone_numbers` row with their `phone_number_id`).

**Why it happens:** The activation action doesn't check for phone_number existence before setting `active = true`.

**How to avoid:** The `activateBot` server action must verify a `phone_numbers` row exists for the tenant before setting `active = true`. Return `{ error: 'Connectez d\'abord votre numéro WhatsApp' }` if missing.

### Pitfall 3: pg_cron Migration Requires Manual DB Config First

**What goes wrong:** Applying `20260505000002_phase5_cron.sql` fails in production if `app.cron_secret` and `app.app_url` DB settings are not set first. This is documented in STATE.md as a pending todo.

**Why it happens:** `current_setting('app.cron_secret')` inside the migration SQL fails if the setting doesn't exist.

**How to avoid:** Phase 7 onboarding documentation/runbook must include the prerequisite SQL:
```sql
ALTER DATABASE postgres SET app.cron_secret = '<value>';
ALTER DATABASE postgres SET app.app_url = 'https://<production-host>';
```
This is run ONCE in Supabase Studio SQL editor before the cron migration is applied. This is a deployment step, not a code step — document it in PLAN.md Wave 0.

### Pitfall 4: Middleware Doesn't Guard /onboarding Routes

**What goes wrong:** Unauthenticated users can access `/onboarding/*` pages because the middleware only guards paths starting with `/dashboard`.

**Why it happens:** Current `middleware.ts` `isProtectedRoute` check is `pathname.startsWith('/dashboard')`.

**How to avoid:** Extend the middleware matcher to also protect `/onboarding`. Update `isProtectedRoute` to include `/onboarding`.

### Pitfall 5: useActionState Import Source

**What goes wrong:** Importing `useActionState` from `'react-dom'` instead of `'react'` causes a runtime error in React 19 / Next.js 16.

**Why it happens:** React 19 moved `useActionState` to the `'react'` package. `react-dom` version is deprecated/removed.

**How to avoid:** Always use `import { useActionState } from 'react'` — established as a project-wide decision in Phase 06.

### Pitfall 6: description Column Missing on tenants Table

**What goes wrong:** Step 1 of onboarding wants to save a `description` field for the salon, but the `tenants` table only has `name`, `slug`, `plan`, `is_active`, `created_at` — no `description` column.

**Why it happens:** The initial schema migration didn't include a description field.

**How to avoid:** Phase 7 Wave 0 migration adds `description TEXT` to `tenants`. No NOT NULL constraint — nullable is fine (step 1 can be skipped/partial).

---

## Code Examples

### Checking Readiness (Counting Services + Open Days)

```typescript
// Source: Supabase JS v2 — count: 'exact' with head: true returns count without data
const { count } = await supabase
  .from('services')
  .select('id', { count: 'exact', head: true })
  .eq('tenant_id', tenantId)
  .eq('active', true)
// count is number | null
```

### Activating Bot With Guard

```typescript
'use server'
export async function activateBot(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims as Record<string, unknown> | null
  const tenantId = (claims?.tenant_id ?? null) as string | null
  if (!tenantId) return { error: 'Non autorisé' }

  const testMode = formData.get('test_mode') === 'on'

  // Guard 1: phone number must exist
  const { data: phoneRow } = await supabase
    .from('phone_numbers')
    .select('id')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!phoneRow) return { error: 'Connectez d\'abord votre numéro WhatsApp' }

  // Guard 2: readiness check
  const readiness = await getOnboardingReadiness(tenantId)
  if (!readiness.ready) {
    return { error: `Configuration incomplète: ${!readiness.hasService ? 'aucun service' : 'aucun jour ouvert'}` }
  }

  const { error } = await supabase
    .from('bot_configs')
    .update({ active: true, test_mode: testMode })
    .eq('tenant_id', tenantId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/onboarding/4')
  return { success: true }
}
```

### Upsert Phone Number (With onConflict)

```typescript
// Source: Supabase JS v2 upsert — requires UNIQUE(tenant_id) on phone_numbers
const { error } = await supabase
  .from('phone_numbers')
  .upsert(
    { tenant_id: tenantId, phone_number_id, waba_id, display_phone, status: 'pending' },
    { onConflict: 'tenant_id' }
  )
```

### Middleware Guard Extension

```typescript
// src/middleware.ts — extend isProtectedRoute
const isProtectedRoute =
  request.nextUrl.pathname.startsWith('/dashboard') ||
  request.nextUrl.pathname.startsWith('/onboarding')
```

### Wave 0 Migration: Add description + phone_numbers unique constraint + bot_configs test_mode

```sql
-- 20260509000001_phase7_onboarding_schema.sql

-- Add description to tenants (nullable, no breaking change)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS description TEXT;

-- Add UNIQUE(tenant_id) to phone_numbers for v1 one-number-per-tenant upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'phone_numbers_tenant_id_unique'
      AND conrelid = 'public.phone_numbers'::regclass
  ) THEN
    ALTER TABLE public.phone_numbers ADD CONSTRAINT phone_numbers_tenant_id_unique UNIQUE (tenant_id);
  END IF;
END $$;

-- Add test_mode to bot_configs
ALTER TABLE public.bot_configs ADD COLUMN IF NOT EXISTS test_mode BOOLEAN DEFAULT false;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useFormState` from `react-dom` | `useActionState` from `react` | React 19 / Next.js 15+ | Must import from `react` — established rule in Phase 06 |
| Hard phone number deletion | UPDATE existing phone_number row | N/A — designed from start | Webhook routing is stable; never gaps during number change |
| Separate onboarding DB table | Derive progress from existing schema | N/A — design choice | Zero extra tables, zero migration risk |
| Meta Embedded Signup (OAuth widget) | Manual credential entry for v1 | Meta changed Embedded Signup in May 2025 | Embedded Signup now requires Tech Provider enrollment — manual entry is pragmatic for v1 |

**Deprecated/outdated:**
- `useFormState` from `react-dom`: moved to `useActionState` from `react` in React 19
- WhatsApp Coexistence is now a May 2025 Meta feature — it is informational UI text in v1 (user declares their setup type; no API difference between dedicated and coexistence from the platform's perspective)

---

## Open Questions

1. **Does `tenants` need a `description` field, or is `system_prompt` in `bot_configs` sufficient?**
   - What we know: `system_prompt` on `bot_configs` already exists and is nullable. `tenants.description` is a separate human-readable field for onboarding display.
   - What's unclear: Whether step 1 should write to `tenants.description` (public-facing salon bio) vs `bot_configs.system_prompt` (internal LLM prompt).
   - Recommendation: Add `tenants.description` for the public-facing name/description. `bot_configs.system_prompt` is a separate advanced field for LLM tuning — not shown in basic onboarding.

2. **Should /onboarding be accessible to already-onboarded tenants?**
   - What we know: An already-active bot owner shouldn't need to redo onboarding. But blocking access entirely prevents re-configuration.
   - What's unclear: Should the dashboard show a permanent "Setup" link, or should onboarding be a one-time flow?
   - Recommendation: Show a completion banner on `/onboarding/4` for already-active bots. Allow re-access to update the phone number. Gate is idempotent — calling `activateBot` on an already-active bot is a no-op.

3. **Is one `UNIQUE(tenant_id)` on `phone_numbers` the right v1 constraint?**
   - What we know: The schema comment says per-tenant WABA (one WABA per tenant). v2 may allow multiple numbers.
   - What's unclear: Whether any existing test data has multiple `phone_numbers` rows per tenant.
   - Recommendation: Add the UNIQUE constraint in the Wave 0 migration using the idempotent DO block pattern. If existing data violates it, the migration will fail with a clear error — surface it early.

---

## Validation Architecture

`nyquist_validation` is enabled in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `salon-bot/vitest.config.ts` |
| Quick run command | `npm test -- --reporter=verbose tests/onboarding.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ONB-01 | `saveSalonProfile` writes name+description to tenants, guards tenant_id | unit | `npm test -- tests/onboarding.test.ts` | Wave 0 |
| ONB-01 | Readiness: returns hasService=false when 0 active services | unit | `npm test -- tests/onboarding.test.ts` | Wave 0 |
| ONB-01 | Readiness: returns hasOpenDay=false when all schedules closed=true | unit | `npm test -- tests/onboarding.test.ts` | Wave 0 |
| ONB-02 | `savePhoneNumber` inserts row with all required fields | unit | `npm test -- tests/onboarding.test.ts` | Wave 0 |
| ONB-02 | `savePhoneNumber` returns Zod field errors for missing phone_number_id | unit | `npm test -- tests/onboarding.test.ts` | Wave 0 |
| ONB-03 | `activateBot` returns error if no phone_numbers row exists | unit | `npm test -- tests/onboarding.test.ts` | Wave 0 |
| ONB-03 | `activateBot` returns error if readiness not met | unit | `npm test -- tests/onboarding.test.ts` | Wave 0 |
| ONB-03 | `activateBot` sets active=true and test_mode from formData | unit | `npm test -- tests/onboarding.test.ts` | Wave 0 |
| WA-04 | `savePhoneNumber` upserts with onConflict:'tenant_id' | unit | `npm test -- tests/onboarding.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- tests/onboarding.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/onboarding.test.ts` — covers all ONB-01/02/03 + WA-04 behaviors above
- [ ] Wave 0 migration `salon-bot/supabase/migrations/20260509000001_phase7_onboarding_schema.sql` — adds `tenants.description`, `phone_numbers_tenant_id_unique`, `bot_configs.test_mode`

---

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `salon-bot/src/app/(auth)/signup/actions.ts` — confirmed `bot_configs` created with `active: false` at signup
- Codebase inspection: `salon-bot/supabase/migrations/20260331000001_create_schema.sql` — confirmed `phone_numbers` schema, `bot_configs` schema, `tenants` schema
- Codebase inspection: `salon-bot/src/app/(dashboard)/services/actions.ts` — confirmed server action pattern (Zod, getClaims, revalidatePath)
- Codebase inspection: `salon-bot/tests/dashboard-services.test.ts` — confirmed Vitest mock pattern for supabase + next/cache
- Next.js in-repo docs: `node_modules/next/dist/docs/01-app/02-guides/forms.md` — confirmed `useActionState` from `react` (not `react-dom`), Server Actions with `FormData`

### Secondary (MEDIUM confidence)

- WebSearch + Meta docs: Meta test WABA provides 1 test phone number, free messages to up to 5 recipient numbers — confirmed by multiple sources
- WebSearch: WhatsApp Coexistence launched May 2025 — businesses can use same number on both WhatsApp Business App and Cloud API simultaneously
- WebSearch: Meta Embedded Signup is now the default for new onboardings; requires Tech Provider enrollment for ISVs

### Tertiary (LOW confidence — flag for validation)

- Meta Embedded Signup technical implementation details: API surface changes frequently. The manual credential form approach is confirmed stable; the full OAuth widget approach requires hands-on verification against current Meta Business Manager UI before implementing.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing libraries, no new dependencies
- Architecture: HIGH — URL-based wizard pattern is well-established in Next.js App Router; server guards via redirect() confirmed from docs
- WhatsApp credential entry: MEDIUM — manual form is safe; Embedded Signup OAuth is LOW confidence without current hands-on verification
- Pitfalls: HIGH — pitfalls 1-5 derived from codebase inspection; pitfall 6 derived from schema inspection

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (stable stack); Meta API surface: re-verify before implementing ONB-02 if > 30 days
