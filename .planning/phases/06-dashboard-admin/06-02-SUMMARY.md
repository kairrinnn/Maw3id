---
phase: 06-dashboard-admin
plan: "02"
subsystem: ui
tags: [next.js, react, supabase, server-actions, vitest, tailwind, schedules]

# Dependency graph
requires:
  - phase: 06-00
    provides: schedules_tenant_day_unique UNIQUE constraint enabling upsert onConflict

provides:
  - saveSchedules Server Action — upserts all 7 schedule rows in one call
  - /schedules page — Server Component loading 7-row defaults from DB
  - ScheduleForm component — Client Component with closed-toggle, time inputs, flash success

affects: [07-onboarding, fsm-booking-core, dashboard-stats]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD: RED (failing test) → GREEN (implementation) per plan's tdd=true task
    - useActionState (React 19) for Server Action binding — NOT deprecated useFormState
    - Hidden inputs (value="00:00") for closed days to always deliver 7-row formData payload
    - closedMap local state for immediate client-side toggle without round-trip
    - Success flash via useEffect + setTimeout(3000ms) pattern
    - Lundi-first display order: DISPLAY_ORDER=[1,2,3,4,5,6,0] per French convention

key-files:
  created:
    - salon-bot/src/app/(dashboard)/schedules/actions.ts
    - salon-bot/src/app/(dashboard)/schedules/page.tsx
    - salon-bot/src/components/dashboard/ScheduleForm.tsx
  modified:
    - salon-bot/tests/dashboard-schedules.test.ts

key-decisions:
  - "saveSchedules uses upsert with onConflict: 'tenant_id,day_of_week' — relies on schedules_tenant_day_unique from 06-00; without that constraint Postgres raises 42P10"
  - "closed=true days write hidden inputs (00:00) so server always receives all 7 form rows — action validates open<close only on non-closed days"
  - "vi.mock('next/cache') uses getter pattern to allow mockReset() between tests — direct mock object accumulates calls across tests"
  - "Display order [1,2,3,4,5,6,0] renders Lundi first, Dimanche last (French week convention)"

patterns-established:
  - "Pattern: TDD with vitest dynamic import — test file written first, actions.ts created in GREEN phase"
  - "Pattern: makeFormData(overrides) helper generates 7-day FormData with Sunday-closed default, each test overrides only what differs"
  - "Pattern: Schedule page fills missing DB days with DAY_DEFAULT — Array.from({length:7}) + find() — never renders fewer than 7 rows"

requirements-completed: [DASH-02]

# Metrics
duration: 7min
completed: "2026-05-05"
---

# Phase 06 Plan 02: Schedules Upsert Summary

**`saveSchedules` Server Action upserts all 7 weekly schedule rows via single Supabase upsert with `onConflict: 'tenant_id,day_of_week'`, with a 7-row ScheduleForm React 19 Client Component and 5 green Vitest assertions replacing placeholder stubs**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-05T21:14:26Z
- **Completed:** 2026-05-05T21:21:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Implemented `saveSchedules` Server Action: reads 7-day formData, validates open < close on non-closed days, upserts all rows in one call using the 06-00 unique constraint, returns `{ error: 'Non autorisé' }` without tenant
- Built `/schedules` Server Component page: queries DB, fills 7-day defaults (Sunday closed), strips Postgres `HH:MM:SS` → `HH:MM`, renders ScheduleForm
- Built `ScheduleForm` Client Component: `useActionState` React 19 hook, Lundi-first display order, closed checkbox hides time inputs client-side, success flash auto-dismisses after 3s, all UI-SPEC copy exact
- Replaced 5 `expect(true).toBe(true)` placeholder stubs with real assertions including `onConflict` string proof, `Non autorisé` guard, `doit précéder` validation, closed-skip, and `revalidatePath` call

## Task Commits

1. **Task 1: Implement saveSchedules action and replace test stubs** - `b8efc02` (feat)
2. **Task 2: Build /schedules page with ScheduleForm component** - `a0507b3` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `salon-bot/src/app/(dashboard)/schedules/actions.ts` — `'use server'` action: 7-row upsert, time validation, getClaims auth guard
- `salon-bot/src/app/(dashboard)/schedules/page.tsx` — Server Component: DB query, 7-day default fill, renders ScheduleForm
- `salon-bot/src/components/dashboard/ScheduleForm.tsx` — `'use client'` component: useActionState, closedMap toggle, hidden inputs, flash
- `salon-bot/tests/dashboard-schedules.test.ts` — 5 real Vitest assertions (replaced all placeholders)

## Decisions Made

- `saveSchedules` upserts with `onConflict: 'tenant_id,day_of_week'` — proof that the 06-00 UNIQUE constraint is in place; any regression in migration order raises 42P10 and the test catches it via the `onConflict` assertion
- `closed=true` days still send hidden `00:00` values so server always receives exactly 7 rows — avoids conditional logic in action for "missing" days
- `vi.mock('next/cache')` uses getter accessor instead of direct object so `mockReset()` in `beforeEach` resets call count per-test correctly
- `useActionState` (React 19 `react` package) used — plan explicitly banned deprecated `useFormState` from `react-dom`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed revalidatePath mock accumulating calls across tests**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** `vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))` creates a shared mock object; calling `mockReset()` on the imported reference after module caching has no effect — test 5 saw 3 calls instead of 1
- **Fix:** Changed to getter accessor pattern: `get revalidatePath() { return mockRevalidatePath }` with top-level `const mockRevalidatePath = vi.fn()` reset in `beforeEach`
- **Files modified:** salon-bot/tests/dashboard-schedules.test.ts
- **Verification:** Test 5 `toHaveBeenCalledOnce()` passes
- **Committed in:** b8efc02 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix was necessary for test isolation correctness. No scope creep.

## Issues Encountered

- `npm run build` returned "Another next build process is already running" — stale lock file in `.next/lock` directory. Removed lock directory manually, build succeeded on retry.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/schedules` route is live as dynamic (ƒ) in Next.js build
- `saveSchedules` action is ready for integration with FSM booking core (Phase 7+) — schedules table now has data per tenant
- Phase 6 Wave 1 remaining: plan 06-03 (stats aggregation for /dashboard)
- DASH-02 traceability: ROADMAP entry stays pending until Phase 6 manual UI walk-through verification

---
*Phase: 06-dashboard-admin*
*Completed: 2026-05-05*
