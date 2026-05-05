---
phase: 06-dashboard-admin
verified: 2026-05-05T22:28:00Z
status: passed
score: 17/17 must-haves verified
re_verification: false
---

# Phase 6: Dashboard Admin Verification Report

**Phase Goal:** Salon owners can manage their services, hours, and see booking stats without touching a database
**Verified:** 2026-05-05T22:28:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Salon owner can create, edit, and delete services (name, duration, price) from the dashboard | VERIFIED | `actions.ts` exports createService (insert), updateService (update+eq), deleteService (soft-delete update active=false). ServiceForm wired via useActionState. All 6 DASH-01 tests pass. |
| 2 | Salon owner can define opening hours and mark specific days as closed | VERIFIED | `schedules/actions.ts` saveSchedules upserts 7 rows with `onConflict:'tenant_id,day_of_week'`. ScheduleForm wired via useActionState(saveSchedules). Migration `20260506000001_schedules_unique_constraint.sql` adds required UNIQUE constraint. All 5 DASH-02 tests pass. |
| 3 | Dashboard displays total bookings and estimated revenue for current week and month | VERIFIED | `stats.ts` exports 4 pure helpers. `dashboard/page.tsx` queries bookings with `.eq('status','confirmed')`, calls formatMad/sumRevenue, renders 4 StatsCard instances. All 6 DASH-03 tests pass. |

**Score:** 3/3 success criteria verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `salon-bot/src/app/(dashboard)/services/actions.ts` | createService, updateService, deleteService | VERIFIED | All 3 exported, tenant_id from getClaims(), soft-delete via update({active:false}), revalidatePath('/services') on success |
| `salon-bot/src/app/(dashboard)/services/page.tsx` | Server Component loading services list | VERIFIED | Queries `from('services').select(...).eq('active',true)`, renders ServiceList |
| `salon-bot/src/components/dashboard/ServiceList.tsx` | Tabular list with inline edit/delete | VERIFIED | Two-step delete with confirm UI, useActionState(deleteService), renders ServiceForm for add/edit |
| `salon-bot/src/components/dashboard/ServiceForm.tsx` | Add/edit form with useActionState | VERIFIED | `useActionState` from 'react', switches between createService/updateService based on `initial` prop |
| `salon-bot/src/app/(dashboard)/schedules/actions.ts` | saveSchedules with onConflict upsert | VERIFIED | Upserts 7 rows with `{ onConflict: 'tenant_id,day_of_week' }`, time validation (open < close), revalidatePath('/schedules') |
| `salon-bot/src/app/(dashboard)/schedules/page.tsx` | 7-day grid with DB defaults | VERIFIED | Queries schedules table, fills missing days with DAY_DEFAULT, renders ScheduleForm |
| `salon-bot/src/components/dashboard/ScheduleForm.tsx` | 7-row form with closed checkbox | VERIFIED | DISPLAY_ORDER=[1..6,0] (Mon-Sun), closed toggle hides time inputs client-side immediately, useActionState(saveSchedules) |
| `salon-bot/src/lib/dashboard/stats.ts` | getWeekBoundsCasablanca, getMonthBoundsCasablanca, formatMad, sumRevenue | VERIFIED | All 4 exported. CASABLANCA_OFFSET_MS=3600000, correct Monday boundary math, fr-FR locale, Array.isArray branch for Supabase join shape |
| `salon-bot/src/components/dashboard/StatsCard.tsx` | Reusable stat card with period/value/subLabel | VERIFIED | Server Component, text-3xl font-semibold display, no 'use client' |
| `salon-bot/src/components/dashboard/DashboardNav.tsx` | Client Component nav with active-link highlighting | VERIFIED | 'use client', usePathname, 3 links (Tableau de bord/Services/Horaires), underline active state |
| `salon-bot/src/app/(dashboard)/dashboard/page.tsx` | Extended with 4-card stats grid | VERIFIED | Imports stats helpers, queries bookings with .eq('status','confirmed') for week+month, renders 4 StatsCard instances, existing bot status card preserved above grid |
| `salon-bot/src/app/(dashboard)/layout.tsx` | DashboardNav added | VERIFIED | Imports and renders DashboardNav, text-xl heading, max-w-7xl container |
| `salon-bot/supabase/migrations/20260506000001_schedules_unique_constraint.sql` | UNIQUE(tenant_id, day_of_week) constraint | VERIFIED | Idempotent DO block with IF NOT EXISTS guard, correct constraint name `schedules_tenant_day_unique` |
| `salon-bot/tests/dashboard-services.test.ts` | Real assertions for DASH-01 | VERIFIED | vi.mock wiring, 6 real assertions (no expect(true).toBe(true) placeholders), all pass |
| `salon-bot/tests/dashboard-schedules.test.ts` | Real assertions for DASH-02 | VERIFIED | vi.mock wiring, 5 real assertions, all pass |
| `salon-bot/tests/dashboard-stats.test.ts` | Real assertions for DASH-03 | VERIFIED | Imports from '@/lib/dashboard/stats', 6 real assertions with specific ISO boundaries, all pass |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ServiceForm.tsx` | `services/actions.ts` | useActionState(createService/updateService) | WIRED | Line 16: `useActionState<ActionResult, FormData>(action as ...)` where action = initial ? updateService : createService |
| `ServiceList.tsx` | `services/actions.ts` | useActionState(deleteService) | WIRED | Line 19: `useActionState<ActionResult, FormData>(deleteService as ...)` |
| `services/actions.ts` | supabase services table | `.from('services').insert/update` with tenant_id from getClaims() | WIRED | Lines 42-48 (insert), 63-70 (update+eq+eq) |
| `services/actions.ts` | Next.js cache | `revalidatePath('/services')` after mutations | WIRED | Lines 51, 73, 92 |
| `ScheduleForm.tsx` | `schedules/actions.ts` | useActionState(saveSchedules) | WIRED | Line 31: `useActionState(saveSchedules, null)` |
| `schedules/actions.ts` | supabase schedules table | `.upsert(rows, { onConflict: 'tenant_id,day_of_week' })` | WIRED | Line 65 |
| `dashboard/page.tsx` | `stats.ts` | imports getWeekBoundsCasablanca, getMonthBoundsCasablanca, formatMad, sumRevenue | WIRED | Line 3: `from '@/lib/dashboard/stats'` |
| `dashboard/page.tsx` | supabase bookings + services tables | `.from('bookings').select('id, services(price_mad)').eq('status','confirmed')` | WIRED | Lines 49-62, two parallel queries for week and month bounds |
| `layout.tsx` | `DashboardNav.tsx` | imports and renders `<DashboardNav />` | WIRED | Line 3 import, line 25 render |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DASH-01 | 06-01-PLAN.md | Gérant peut créer/modifier/supprimer les services (nom, durée, prix) | SATISFIED | createService/updateService/deleteService in actions.ts; ServiceForm + ServiceList components; 6 unit tests passing |
| DASH-02 | 06-02-PLAN.md | Gérant peut définir les horaires d'ouverture et les jours de fermeture | SATISFIED | saveSchedules with 7-row upsert; ScheduleForm with closed checkbox; UNIQUE migration; 5 unit tests passing |
| DASH-03 | 06-03-PLAN.md | Dashboard affiche les stats : nombre de bookings et revenus estimés par période | SATISFIED | stats.ts pure helpers; dashboard/page.tsx with 4 StatsCard instances; confirmed-only filter; 6 unit tests passing |

No orphaned requirements — all 3 DASH requirements claimed by plans and verified.

---

### Anti-Patterns Found

None. Full scan of all Phase 6 source files found:
- Zero TODO/FIXME/PLACEHOLDER comments
- Zero `return null` / empty stubs in components
- Zero `expect(true).toBe(true)` placeholders in test files (all replaced with real assertions)
- No `font-medium` violations (normalized to `font-semibold` per UI-SPEC)

**Pre-existing failure (not Phase 6):** `tests/llm-reply.test.ts` has 1 pre-existing failure unrelated to Phase 6 (Gemini mock text mismatch). All 17 Phase 6 test cases pass.

---

### Human Verification Required

The following items cannot be verified programmatically and require a browser session with a real tenant account:

#### 1. Services CRUD end-to-end flow

**Test:** Log in as a salon owner. Navigate to /services. Create a service (e.g. "Coupe", 30 min, 150 MAD). Verify it appears in the table. Click Modifier, change name to "Coupe + brushing", save. Verify the updated name appears. Click "Supprimer ce service", confirm. Verify the row disappears.
**Expected:** All operations complete without page reload for list updates (Next.js cache revalidation). Empty state "Aucun service configuré" shows CTA when no services remain.
**Why human:** Server Action revalidatePath + Next.js ISR cache behavior cannot be tested without a live Supabase instance.

#### 2. Schedules 7-day form behavior

**Test:** Navigate to /schedules. Toggle "Fermé" on Lundi — verify time inputs hide immediately (no server round-trip). Save. Navigate away and return — verify the closed state persists.
**Expected:** Time input visibility changes instantly on checkbox toggle (client-side state). Saved values pre-fill on next visit.
**Why human:** Client-side `closedMap` state behavior and hidden input fallback (`value="00:00"`) for closed days requires browser interaction.

#### 3. Stats cards display correct live data

**Test:** After creating at least one confirmed booking, navigate to /dashboard. Verify the weekly/monthly booking count and revenue cards show non-zero values that match the booking.
**Expected:** 4 cards visible: "Cette semaine" and "Ce mois" for both booking count and estimated revenue. Values match confirmed bookings only.
**Why human:** Requires a live Supabase instance with real booking data to verify Africa/Casablanca timezone boundary accuracy.

#### 4. DashboardNav active-link highlighting

**Test:** Navigate between /dashboard, /services, and /schedules. Verify the active link shows underline styling and the inactive links are muted gray.
**Expected:** Active link renders `font-semibold text-gray-900 underline underline-offset-4`; inactive links render `text-gray-600`.
**Why human:** usePathname hook behavior requires a live browser with Next.js router context.

---

## Gaps Summary

No gaps. All 17 must-haves verified across 3 plans (06-00, 06-01, 06-02, 06-03). The phase goal is fully achieved in code:

- DASH-01: Complete services CRUD with tenant isolation, Zod validation, soft-delete, and cache revalidation.
- DASH-02: Complete 7-day schedule management with upsert and time validation. UNIQUE constraint migration in place.
- DASH-03: Pure stats helpers with correct Africa/Casablanca UTC+1 boundary math, confirmed-only filter, and fr-FR locale formatting.
- Navigation: DashboardNav Client Component wired into layout with active-link highlighting.
- Tests: All 17 DASH-tagged test cases pass with real assertions (no placeholders). One pre-existing unrelated failure in llm-reply.test.ts is unchanged from Phase 5.

---

_Verified: 2026-05-05T22:28:00Z_
_Verifier: Claude (gsd-verifier)_
