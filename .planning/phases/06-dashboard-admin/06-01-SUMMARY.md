---
phase: 06-dashboard-admin
plan: 01
subsystem: ui
tags: [nextjs, react, supabase, zod, vitest, tailwind, server-actions]

# Dependency graph
requires:
  - phase: 06-00
    provides: UNIQUE migration on services table, test scaffold with 6 placeholder stubs
provides:
  - createService/updateService/deleteService server actions with getClaims tenant isolation
  - /services Server Component page with active service query
  - ServiceList Client Component with inline two-step delete confirmation
  - ServiceForm Client Component with useActionState (React 19), add/edit modes, field errors
  - 6 real Vitest assertions replacing 06-00 placeholders (all green)
affects: [06-02, 06-03, bot-booking-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - useActionState from 'react' (NOT useFormState from react-dom — React 19 / Next.js 16)
    - Server Action returns ActionResult = { error } | { success: true } (project convention)
    - getClaims() for tenant_id extraction (never trust form input)
    - Soft-delete via update({ active: false }) — hard DELETE never used on FK-referenced rows
    - TDD flow: RED (placeholder stubs → real failing assertions) then GREEN (implement actions)

key-files:
  created:
    - salon-bot/src/app/(dashboard)/services/actions.ts
    - salon-bot/src/app/(dashboard)/services/page.tsx
    - salon-bot/src/components/dashboard/ServiceList.tsx
    - salon-bot/src/components/dashboard/ServiceForm.tsx
  modified:
    - salon-bot/tests/dashboard-services.test.ts

key-decisions:
  - "deleteService updates active=false (soft-delete) — never hard DELETE — preserves bookings.service_id FK"
  - "useActionState from 'react' used (NOT useFormState from 'react-dom' — deprecated/removed in React 19)"
  - "ServiceList.tsx is the orchestrator: holds editing/confirmingDeleteId state and renders ServiceForm below the table — avoids prop-drilling through a separate wrapper component"
  - "Delete form uses separate useActionState(deleteService) inside ServiceList — keeps delete pending state isolated from add/edit form"

patterns-established:
  - "TDD-RED: Write real failing tests against non-existent module (ERR_MODULE_NOT_FOUND confirms RED)"
  - "TDD-GREEN: Implement actions to exact contract so all 6 assertions pass atomically"
  - "Server Component page: getClaims → redirect if no claims → extract tenantId → query with .eq('tenant_id') and .eq('active', true)"

requirements-completed: [DASH-01]

# Metrics
duration: 6min
completed: 2026-05-05
---

# Phase 06-01: Services CRUD Summary

**Three Server Actions (createService/updateService/deleteService) + /services page + ServiceList + ServiceForm — full CRUD with Zod validation, soft-delete, and 6 green Vitest assertions**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-05T22:14:07Z
- **Completed:** 2026-05-05T22:20:29Z
- **Tasks:** 2 (TDD task + UI task)
- **Files modified:** 5

## Accomplishments
- Three server actions enforce tenant isolation via getClaims() — tenant_id never comes from form input
- Soft-delete pattern: deleteService calls `.update({ active: false })` never `.delete()` — preserves bookings FK
- ServiceList renders inline two-step delete confirmation with min-h-[44px] touch targets per UI-SPEC
- ServiceForm uses React 19's `useActionState` (not deprecated `useFormState`) with key-reset on mode switch
- 6 real Vitest assertions replacing all 06-00 placeholders — full suite stays at 141 pass / 1 pre-existing fail

## Task Commits

1. **RED: Real failing tests** - `0d3e220` (test)
2. **GREEN: Server actions implementation** - `0e2071c` (feat)
3. **Task 2: /services page + components** - `2cd3017` (feat)

## Files Created/Modified
- `salon-bot/src/app/(dashboard)/services/actions.ts` - createService, updateService, deleteService with Zod + getClaims
- `salon-bot/src/app/(dashboard)/services/page.tsx` - Server Component: getClaims, tenant guard, active services query
- `salon-bot/src/components/dashboard/ServiceList.tsx` - Table + inline delete confirmation + ServiceForm orchestration
- `salon-bot/src/components/dashboard/ServiceForm.tsx` - Add/edit form with useActionState, error display, flash message
- `salon-bot/tests/dashboard-services.test.ts` - 6 real assertions (insert args, unauthorized guard, Zod errors, update chain, soft-delete, revalidatePath)

## Decisions Made
- **Soft-delete enforced:** `deleteService` uses `.update({ active: false })`. Test mock intentionally has NO `.delete()` method — implementation throws loudly if ever called incorrectly.
- **React 19 hook:** `useActionState` from `'react'` only. `useFormState` from `'react-dom'` is removed in React 19.
- **ServiceList as orchestrator:** Rather than a separate wrapper component, ServiceList holds `editing` state and renders `<ServiceForm>` below itself. Clean separation without extra indirection.
- **Delete state isolation:** `useActionState(deleteService)` lives inside ServiceList alongside the table state — delete pending/success doesn't bleed into the add/edit form state.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None. TypeScript compiles clean for all new files. Pre-existing `llm-reply.test.ts` "Gemini success" failure was already documented in STATE.md as deferred — unaffected by this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DASH-01 services CRUD complete — bot can now read `services WHERE active=true` reliably
- Ready for 06-02 (schedules CRUD) and 06-03 (stats aggregation)
- /services page renders table or empty state, form adds/edits, delete confirms inline

---
*Phase: 06-dashboard-admin*
*Completed: 2026-05-05*
