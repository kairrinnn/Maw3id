---
phase: 06-dashboard-admin
plan: 00
subsystem: database, testing
tags: [supabase, postgres, vitest, migrations, schedules]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "schedules table definition (20260331000001_create_schema.sql)"
provides:
  - "UNIQUE(tenant_id, day_of_week) constraint on schedules table — unblocks plan 06-02 upsert"
  - "Test scaffold dashboard-services.test.ts (DASH-01, 6 stubs)"
  - "Test scaffold dashboard-schedules.test.ts (DASH-02, 5 stubs)"
  - "Test scaffold dashboard-stats.test.ts (DASH-03, 6 stubs)"
affects: [06-01, 06-02, 06-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent UNIQUE constraint migration via DO/IF NOT EXISTS block (Postgres lacks ADD CONSTRAINT IF NOT EXISTS for UNIQUE)"
    - "Test stub pattern: vitest-only imports + expect(true).toBe(true) placeholders, replaced in later plans"

key-files:
  created:
    - "salon-bot/supabase/migrations/20260506000001_schedules_unique_constraint.sql"
    - "salon-bot/tests/dashboard-services.test.ts"
    - "salon-bot/tests/dashboard-schedules.test.ts"
    - "salon-bot/tests/dashboard-stats.test.ts"
  modified: []

key-decisions:
  - "DO/IF NOT EXISTS guard for UNIQUE constraint — Postgres has no native ADD CONSTRAINT IF NOT EXISTS for UNIQUE constraints; DO block pattern ensures idempotency"
  - "No @/ imports in test stubs — module-resolution would fail before 06-01/02/03 create the action files; stubs stay pure vitest until downstream plans replace them"

patterns-established:
  - "Wave 0 scaffolding pattern: migration + empty test files committed before any feature code — downstream plans have a known landing spot"

requirements-completed: [DASH-01, DASH-02, DASH-03]

# Metrics
duration: 2min
completed: 2026-05-05
---

# Phase 6 Plan 00: Dashboard Admin Wave 0 Prerequisites Summary

**Idempotent UNIQUE(tenant_id,day_of_week) migration on schedules table + 3 vitest stub files (DASH-01/02/03) scaffolding 17 placeholder tests so downstream plans 06-01/02/03 have clean landing targets**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-05T21:09:45Z
- **Completed:** 2026-05-05T21:11:27Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Migration `20260506000001_schedules_unique_constraint.sql` created with idempotent DO block — unblocks plan 06-02 `.upsert({ onConflict: 'tenant_id,day_of_week' })` which previously would throw Postgres 42P10
- 17 placeholder tests across 3 describe blocks (DASH-01: 6, DASH-02: 5, DASH-03: 6) — all pass green
- Full vitest suite stays at 141 passing + 1 pre-existing failing (Gemini success, deferred from Phase 4.5)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add UNIQUE(tenant_id, day_of_week) migration to schedules table** - `f848ca3` (chore)
2. **Tasks 2+3: Create test scaffolds for DASH-01, DASH-02, DASH-03** - `2fb1b34` (test)

**Plan metadata:** (docs commit pending)

## Files Created/Modified

- `salon-bot/supabase/migrations/20260506000001_schedules_unique_constraint.sql` — Idempotent UNIQUE constraint on schedules(tenant_id, day_of_week)
- `salon-bot/tests/dashboard-services.test.ts` — DASH-01 stubs: createService, updateService, deleteService (6 it blocks)
- `salon-bot/tests/dashboard-schedules.test.ts` — DASH-02 stubs: upsertSchedule all 7 days, conflict, validation (5 it blocks)
- `salon-bot/tests/dashboard-stats.test.ts` — DASH-03 stubs: confirmed count, week/month windows, revenue sum/format (6 it blocks)

## Decisions Made

- **DO/IF NOT EXISTS idiom:** Postgres has no `ADD CONSTRAINT IF NOT EXISTS` syntax for UNIQUE constraints (only for CHECK). The DO block pattern lets migrations be re-run safely during local development without erroring.
- **No @/ imports in stubs:** Module resolution for `@/lib/actions/services` etc. would fail at import time before plans 06-01/02/03 create those files. Keeping stubs vitest-only ensures the suite remains green throughout the wave.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. The 1 pre-existing failing test (`llm-reply.test.ts > Gemini success`) is unchanged and was deferred in Phase 4.5.

## Note for Downstream Plans

Replace `expect(true).toBe(true)` placeholders with real Supabase mock assertions during 06-01/02/03 task implementation. Each stub's comment specifies exactly which mock assertion to add.

## User Setup Required

None — no external service configuration required. Migration must be applied to Supabase via `supabase db push` or the Supabase dashboard SQL editor before plan 06-02 is used in production.

## Next Phase Readiness

- Plans 06-01, 06-02, 06-03 can now proceed — each has a pre-existing test file to fill in
- Plan 06-02 upsert will succeed once the migration is applied to the Supabase instance
- No blockers for Wave 1 execution

---
*Phase: 06-dashboard-admin*
*Completed: 2026-05-05*
