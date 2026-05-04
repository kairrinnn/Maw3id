# Phase 6: Dashboard Admin - Research

**Researched:** 2026-05-05
**Domain:** Next.js 16 Server Actions, Supabase RLS CRUD, React 19 form patterns, booking stats queries
**Confidence:** HIGH

---

## Summary

Phase 6 is a pure CRUD + read-only stats dashboard. There are no external API calls (unlike Phase 5). The schema is already complete — `services`, `schedules`, and `bookings` tables exist with RLS policies that already cover SELECT/INSERT/UPDATE/DELETE for authenticated tenants. No new migrations are required unless a gap is discovered.

The three requirements map to three UI surfaces: (1) a services manager (table with add/edit/delete), (2) a schedule manager (7-row grid, one row per day of week), and (3) a stats card section (total bookings + estimated revenue for current week and month). All data mutations go through Next.js Server Actions with `revalidatePath` — no client-side fetch needed. The authenticated server client already carries the tenant JWT so RLS enforces data isolation automatically.

The key architectural decision for this phase is that the `schedules` table is 7 fixed rows per tenant (one per day_of_week 0–6), not a variable number of rows. Upsert logic is needed when owners first set hours. Stats are computed server-side in Server Components directly — no API route needed, no client state.

**Primary recommendation:** Server Actions in `(dashboard)/` route group pages — one actions.ts per domain (services, schedules), Server Components for data loading, `useActionState` for inline form feedback. No new npm packages required.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Salon owner can create, edit, and delete services (name, duration, price) | `services` table fully exists with RLS. Server Action inserts/updates/deletes with `tenant_id` from JWT claims. Soft-delete via `active=false` preserves booking history FK integrity. |
| DASH-02 | Salon owner can define opening hours and mark specific days as closed | `schedules` table exists with `day_of_week`, `open_time`, `close_time`, `closed` columns. Upsert pattern (insert or update by tenant_id + day_of_week) is the write strategy. All 7 days rendered as fixed form rows. |
| DASH-03 | Dashboard displays total bookings and estimated revenue for current week and month | `bookings` table with `appointment_at` and `service_id` (joinable to `price_mad`). Aggregate query runs in Server Component — no RPC needed. Two time windows: ISO week (Mon–Sun) and calendar month. |
</phase_requirements>

---

## Standard Stack

### Core

| Library / Service | Version | Purpose | Why Standard |
|-------------------|---------|---------|--------------|
| Next.js 16.2.1 | 16.2.1 | Server Actions, Server Components, revalidatePath | Already the stack; no alternative |
| React 19.2.4 | 19.2.4 | `useActionState`, `useFormStatus` for form feedback | Already installed; these hooks replace the old `useFormState` from React 18 |
| `@supabase/supabase-js` | ^2.101.1 | DB queries via RLS-aware server client | Already installed |
| `@supabase/ssr` | ^0.10.0 | `createServerClient` with cookie store (auth) | Already installed |
| Zod | ^4.3.6 | Server-side form validation in Server Actions | Already installed; used in Phase 3 |
| Tailwind CSS | ^4 | UI styling | Already installed |

### No New npm Packages Required

All needed libraries are already installed. This phase is new files only.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server Actions + revalidatePath | API routes + client fetch | API routes work but require client-side state management; Server Actions are simpler for simple CRUD in this stack |
| Server Components for stats | `/api/stats` route + useEffect | Server Component is faster (no waterfall), simpler (no client state), better (no loading flash) |
| Soft-delete (`active=false`) for services | Hard DELETE | Hard delete would break FK constraint on `bookings.service_id` for historical bookings |

---

## Architecture Patterns

### Recommended File Structure (new files only)

```
src/app/(dashboard)/
├── services/
│   ├── page.tsx              # Server Component — loads services list, renders ServiceList
│   └── actions.ts            # 'use server' — createService, updateService, deleteService
├── schedules/
│   ├── page.tsx              # Server Component — loads 7 schedule rows, renders ScheduleForm
│   └── actions.ts            # 'use server' — upsertSchedule (insert or update per day)
└── dashboard/
    └── page.tsx              # Extend existing — add stats cards (bookings week/month, revenue)
src/components/dashboard/
├── ServiceList.tsx           # 'use client' — table with inline edit/delete, useActionState
├── ServiceForm.tsx           # 'use client' — add/edit form, useActionState
└── ScheduleForm.tsx          # 'use client' — 7-row grid form, useActionState per row
```

### Pattern 1: Server Action with `useActionState` (inline errors)

**What:** Server Action returns `{ error?: string; success?: boolean }`. Client component uses `useActionState` to show inline errors without page reload.

**When to use:** Any form mutation (create service, update service, upsert schedule).

```tsx
// Source: Next.js 16.2.1 built-in docs — node_modules/next/dist/docs/01-app/02-guides/forms.md
// actions.ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const ServiceSchema = z.object({
  name: z.string().min(1),
  duration_minutes: z.coerce.number().int().positive(),
  price_mad: z.coerce.number().nonnegative().nullable(),
})

export async function createService(prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const tenantId = (claimsData?.claims as Record<string, unknown>)?.tenant_id as string | null
  if (!tenantId) return { error: 'Non autorisé' }

  const parsed = ServiceSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { error } = await supabase
    .from('services')
    .insert({ ...parsed.data, tenant_id: tenantId })

  if (error) return { error: error.message }
  revalidatePath('/services')
  return { success: true }
}
```

```tsx
// ServiceForm.tsx (Client Component)
'use client'
import { useActionState } from 'react'
import { createService } from './actions'

export function ServiceForm() {
  const [state, formAction, pending] = useActionState(createService, null)
  return (
    <form action={formAction}>
      {state?.error && <p className="text-red-600">{String(state.error)}</p>}
      <input name="name" required />
      <input name="duration_minutes" type="number" required />
      <input name="price_mad" type="number" step="0.01" />
      <button disabled={pending}>Ajouter</button>
    </form>
  )
}
```

### Pattern 2: Schedule Upsert (fixed 7 rows)

**What:** Schedule has exactly 7 rows per tenant (one per day_of_week 0–6). First save is INSERT, subsequent saves are UPDATE. Use Supabase `.upsert()` with `onConflict: 'tenant_id,day_of_week'`.

**When to use:** Schedule save action.

```ts
// Source: Supabase JS v2 — upsert with onConflict constraint
await supabase
  .from('schedules')
  .upsert(
    { tenant_id: tenantId, day_of_week: day, open_time: openTime, close_time: closeTime, closed: isClosed },
    { onConflict: 'tenant_id,day_of_week' }
  )
```

**Prerequisite:** The `(tenant_id, day_of_week)` unique constraint must exist on the `schedules` table. Check the current migration — if it is missing, a migration adding `UNIQUE(tenant_id, day_of_week)` is needed before upsert works correctly.

### Pattern 3: Stats Query in Server Component

**What:** Aggregate bookings and revenue directly in the Server Component. No API route, no client state.

**When to use:** DASH-03 stats cards.

```ts
// Source: Supabase JS v2 — select with join and filter
// Week: ISO week Mon 00:00 to Sun 23:59 in Africa/Casablanca
const weekStart = getWeekStart() // Monday of current week (UTC-adjusted for Morocco)
const weekEnd   = getWeekEnd()

const { data: weekBookings } = await supabase
  .from('bookings')
  .select('id, services(price_mad)')
  .eq('tenant_id', tenantId)
  .eq('status', 'confirmed')
  .gte('appointment_at', weekStart)
  .lte('appointment_at', weekEnd)

const weekRevenue = (weekBookings ?? [])
  .reduce((sum, b) => sum + (Number((b.services as any)?.price_mad) || 0), 0)
```

### Pattern 4: Soft Delete for Services

**What:** Set `active = false` instead of issuing a DELETE. Preserves FK integrity on `bookings.service_id`.

**Why:** The `bookings` table has a FK on `service_id`. Hard DELETE would fail if any booking references the service. The bot already filters `WHERE active = true` when listing services for a booking, so soft-delete is already the natural approach.

```ts
// Soft delete
await supabase
  .from('services')
  .update({ active: false })
  .eq('id', serviceId)
  .eq('tenant_id', tenantId) // RLS also enforces this, belt-and-suspenders
```

### Anti-Patterns to Avoid

- **Fetching tenant_id from URL params:** The tenant is always the authenticated user's own tenant. Always get `tenant_id` from JWT claims via `supabase.auth.getClaims()` — never from URL or form hidden fields (allows cross-tenant spoofing even if RLS would catch it).
- **Skipping `revalidatePath` after mutations:** Without `revalidatePath('/services')`, the page will show stale Server Component output after a create/update/delete. Always call it at the end of a successful Server Action.
- **Rendering schedules as a dynamic list:** Schedules are always exactly 7 rows (0–6). Render as a fixed 7-row form, not a variable list. Load all 7 rows, fill missing days with defaults (open_time: '09:00', close_time: '18:00', closed: false).
- **Hard DELETE on services:** Breaks FK on bookings table. Use soft-delete (`active=false`).
- **Building aggregate stats in a Route Handler:** Stats data is only needed for the dashboard page owner. A Server Component query is simpler and avoids an unnecessary HTTP round trip.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tenant data isolation in CRUD | Manual `WHERE tenant_id = ?` in every query | RLS via authenticated server client (`createClient()`) | RLS enforces isolation at DB level — even if a bug forgets the `.eq('tenant_id', …)` filter, RLS blocks the cross-tenant read. Belt + suspenders: still add explicit `.eq` for readability. |
| Form pending/loading state | Custom `useState` loading boolean | `useActionState` pending from React 19 | Provided by the hook; no manual state needed |
| Form error display | Full error boundary | Return `{ error: string }` from Server Action + render in JSX | Server Actions support returning arbitrary values — use the return value pattern |
| Stats date math | Custom ISO week library | Vanilla JS Date with hardcoded `Africa/Casablanca` offset | Morocco is UTC+1 (no DST); `new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })` is sufficient. Precedent from Phase 5 reminder date formatting. |

**Key insight:** RLS + Server Actions is a natural fit here — the server client already has the user's JWT. The planner should NOT add API route layers between Server Actions and the DB. The only reason to use an API route in this project is for external callers (webhook, cron). Dashboard CRUD is internal only.

---

## Common Pitfalls

### Pitfall 1: `schedules` table missing unique constraint for upsert

**What goes wrong:** `supabase.upsert({ onConflict: 'tenant_id,day_of_week' })` throws a Postgres error if the constraint doesn't exist.

**Why it happens:** The initial migration creates the `schedules` table with a PK and indexes, but does not define a UNIQUE constraint on `(tenant_id, day_of_week)`. Upsert with `onConflict` requires the constraint name to be registered in Postgres.

**How to avoid:** Check the existing migration (`20260331000001_create_schema.sql`) — it has no UNIQUE constraint on `(tenant_id, day_of_week)`, only an index. A new migration must add `ALTER TABLE schedules ADD CONSTRAINT schedules_tenant_day_unique UNIQUE (tenant_id, day_of_week)` before upsert can work.

**Warning signs:** Supabase JS returns a `42P10` error (no unique constraint matching ON CONFLICT specification) at runtime.

### Pitfall 2: `useActionState` signature change in React 19

**What goes wrong:** Using the old React 18 `useFormState` from `react-dom` — it is deprecated in React 19 and removed.

**Why it happens:** Training data references `useFormState` from `react-dom/form`. React 19 (which this project uses: `"react": "19.2.4"`) moved this to `useActionState` from `react`.

**How to avoid:** Import `useActionState` from `'react'`, not `'react-dom'`.

```tsx
// Correct (React 19)
import { useActionState } from 'react'
// Wrong (React 18 / deprecated)
import { useFormState } from 'react-dom'
```

### Pitfall 3: `getClaims()` vs `getUser()` / `getSession()`

**What goes wrong:** Using `supabase.auth.getUser()` or `supabase.auth.getSession()` in Server Actions — `getSession()` does not validate JWT signature server-side (security vulnerability per Phase 01-02 decision log).

**Why it happens:** It's the more obvious API. `getSession()` works locally but is insecure in production because it trusts the cookie without re-validating with Supabase Auth server.

**How to avoid:** Always use `supabase.auth.getClaims()` and extract `tenant_id` from the claims object. This is the pattern already in `(dashboard)/dashboard/page.tsx`.

### Pitfall 4: Stats query not filtering by `status = 'confirmed'`

**What goes wrong:** Revenue includes cancelled bookings, double-counting.

**Why it happens:** Forgetting to `.eq('status', 'confirmed')` when aggregating. Cancelled and no-show bookings should not count toward revenue.

**How to avoid:** Always add `.eq('status', 'confirmed')` to stats queries. Bookings statuses are: `confirmed`, `cancelled`, `completed`, `no_show`.

### Pitfall 5: Week/month boundary using UTC instead of Morocco time

**What goes wrong:** A booking at 23:00 UTC on Sunday appears in the next week's stats because UTC midnight is 01:00 Morocco time.

**Why it happens:** JavaScript `Date` is UTC by default. "This week" for a Morocco salon means Monday–Sunday in Africa/Casablanca (UTC+1, no DST).

**How to avoid:** Compute week/month boundaries adjusted for UTC+1. Simple approach: add 1 hour offset when computing `weekStart`/`weekEnd` before passing ISO strings to Supabase. Consistent with Phase 5 precedent (`Africa/Casablanca` hardcoded).

---

## Code Examples

### Verified: Server Action with auth check and revalidation

```ts
// Source: project pattern from src/app/(auth)/signup/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function deleteService(prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims as Record<string, unknown> | null
  const tenantId = claims?.tenant_id as string | null
  if (!tenantId) return { error: 'Non autorisé' }

  const serviceId = formData.get('service_id') as string
  // Soft delete — preserve FK integrity with bookings
  const { error } = await supabase
    .from('services')
    .update({ active: false })
    .eq('id', serviceId)
    .eq('tenant_id', tenantId) // belt-and-suspenders (RLS also enforces)

  if (error) return { error: error.message }
  revalidatePath('/services')
  return { success: true }
}
```

### Verified: Load all 7 schedule rows with defaults for missing days

```ts
// Source: Supabase JS v2 pattern + project database.ts types
const DAY_DEFAULTS = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i as 0|1|2|3|4|5|6,
  open_time: '09:00',
  close_time: '18:00',
  closed: i === 0, // Sunday closed by default
}))

const { data: rows } = await supabase
  .from('schedules')
  .select('*')
  .eq('tenant_id', tenantId)
  .order('day_of_week')

// Merge DB rows with defaults — 7 rows always rendered
const schedules = DAY_DEFAULTS.map(def => {
  const existing = rows?.find(r => r.day_of_week === def.day_of_week)
  return existing ?? { ...def, id: null, tenant_id: tenantId }
})
```

### Verified: Stats aggregation in Server Component

```ts
// Source: project pattern (bookings query) + Supabase JS v2
// Morocco is UTC+1, no DST — offset is always 60 minutes
const now = new Date()
const nowMorocco = new Date(now.getTime() + 60 * 60 * 1000)

// Start of current week (Monday) in Morocco time
const dayOfWeek = nowMorocco.getUTCDay() // 0=Sun
const daysSinceMon = (dayOfWeek + 6) % 7
const weekStartMorocco = new Date(nowMorocco)
weekStartMorocco.setUTCDate(nowMorocco.getUTCDate() - daysSinceMon)
weekStartMorocco.setUTCHours(0, 0, 0, 0)
const weekStart = new Date(weekStartMorocco.getTime() - 60 * 60 * 1000).toISOString()

// Start of current month in Morocco time
const monthStartMorocco = new Date(nowMorocco)
monthStartMorocco.setUTCDate(1)
monthStartMorocco.setUTCHours(0, 0, 0, 0)
const monthStart = new Date(monthStartMorocco.getTime() - 60 * 60 * 1000).toISOString()

const { data: weekData } = await supabase
  .from('bookings')
  .select('id, services(price_mad)')
  .eq('status', 'confirmed')
  .gte('appointment_at', weekStart)
  .lte('appointment_at', now.toISOString())
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useFormState` (react-dom) | `useActionState` (react) | React 19 | Old import path is deprecated and gone |
| `getSession()` server-side | `getClaims()` server-side | Phase 01-02 decision | Security: getClaims validates JWT signature |
| Hard DELETE for CRUD | Soft-delete (`active=false`) for entities with FKs | Project pattern | Preserves historical booking data |

**Deprecated/outdated in this project:**
- `useFormState` from `'react-dom'`: replaced by `useActionState` from `'react'` (React 19)
- `getSession()` in Server Components: never use — see Phase 01-02 decision log

---

## Open Questions

1. **Does `schedules` have a UNIQUE constraint on `(tenant_id, day_of_week)`?**
   - What we know: The migration creates an index on `tenant_id` only, no composite unique constraint is visible in `20260331000001_create_schema.sql`.
   - What's unclear: Whether a subsequent migration added it.
   - Recommendation: The planner should include a Wave 0 task to check and add the constraint migration if missing. Upsert will fail at runtime without it.

2. **Does the dashboard layout need navigation tabs for Services / Schedules?**
   - What we know: Current `(dashboard)/layout.tsx` is a minimal nav bar (just "Déconnexion").
   - What's unclear: Whether the planner should add nav links in the layout or keep pages standalone.
   - Recommendation: Add nav links (Services, Horaires, Tableau de bord) to the existing layout — minimal change, avoids dead-end pages.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `salon-bot/vitest.config.ts` |
| Quick run command | `npm --prefix salon-bot test -- --reporter=verbose` |
| Full suite command | `npm --prefix salon-bot test -- --reporter=verbose` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | createService inserts row with correct tenant_id | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ Wave 0 |
| DASH-01 | updateService updates correct row | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ Wave 0 |
| DASH-01 | deleteService sets active=false (not hard delete) | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ Wave 0 |
| DASH-01 | createService returns error when not authenticated | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ Wave 0 |
| DASH-02 | upsertSchedule inserts when row does not exist | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ Wave 0 |
| DASH-02 | upsertSchedule updates existing row by tenant_id+day | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ Wave 0 |
| DASH-03 | stats query counts only confirmed bookings in date window | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ Wave 0 |
| DASH-03 | stats revenue sums service price_mad, excludes null | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm --prefix salon-bot test -- --reporter=verbose`
- **Per wave merge:** `npm --prefix salon-bot test -- --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `salon-bot/tests/dashboard-services.test.ts` — covers DASH-01 (createService, updateService, deleteService Server Actions)
- [ ] `salon-bot/tests/dashboard-schedules.test.ts` — covers DASH-02 (upsertSchedule action)
- [ ] `salon-bot/tests/dashboard-stats.test.ts` — covers DASH-03 (stats aggregation logic, ideally extracted into a pure function)
- [ ] Migration check: `ALTER TABLE schedules ADD CONSTRAINT schedules_tenant_day_unique UNIQUE (tenant_id, day_of_week)` if not already present

---

## Sources

### Primary (HIGH confidence)

- Next.js 16.2.1 built-in docs — `node_modules/next/dist/docs/01-app/02-guides/forms.md` — Server Actions, useActionState, revalidatePath
- Next.js 16.2.1 built-in docs — `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` — revalidatePath API
- Project migration `20260331000001_create_schema.sql` — exact `services`, `schedules`, `bookings` table definitions
- Project migration `20260331000002_enable_rls.sql` — confirmed RLS SELECT/INSERT/UPDATE/DELETE policies on services and schedules
- Project `src/types/database.ts` — TypeScript types for Service, Schedule, Booking
- Project `src/app/(dashboard)/dashboard/page.tsx` — existing getClaims() pattern to replicate
- Project `src/app/(auth)/signup/actions.ts` — Server Action pattern (revalidatePath + service client) to replicate
- Project `src/app/api/reminders/send/route.ts` — Africa/Casablanca timezone precedent

### Secondary (MEDIUM confidence)

- Project `package.json` — confirmed React 19.2.4, Zod ^4.3.6, Supabase JS ^2.101.1 already installed
- Supabase JS v2 upsert with onConflict — documented behavior inferred from existing project usage patterns (Phase 02-01 decision log notes `upsert(ignoreDuplicates:true)` pattern)

### Tertiary (LOW confidence)

- None — all findings are grounded in project source files and official Next.js built-in docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already in package.json, no new installs needed
- Architecture: HIGH — Server Actions + Server Components is the established project pattern; forms.md confirms the exact API
- Pitfalls: HIGH — unique constraint gap confirmed by direct migration inspection; React 19 hook rename confirmed by installed package.json version; getClaims pattern confirmed by existing dashboard page

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (stable — Next.js and Supabase APIs in this phase are not fast-moving)
