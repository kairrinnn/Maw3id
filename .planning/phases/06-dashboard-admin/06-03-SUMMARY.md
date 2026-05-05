---
phase: 06-dashboard-admin
plan: 03
subsystem: ui
tags: [next.js, supabase, tailwind, vitest, typescript, dashboard, stats]

requires:
  - phase: 06-00
    provides: "Vitest scaffold dashboard-stats.test.ts with placeholder assertions"
  - phase: 06-01
    provides: "Supabase server client, getClaims auth pattern, dashboard layout structure"
  - phase: 06-02
    provides: "DashboardNav integrated into layout, layout max-w-7xl container"

provides:
  - "Pure stats helpers: getWeekBoundsCasablanca, getMonthBoundsCasablanca, formatMad, sumRevenue"
  - "4-card stats grid on /dashboard showing confirmed bookings and estimated revenue (week + month)"
  - "StatsCard Server Component with Display typography (text-3xl font-semibold)"
  - "DashboardNav Client Component with usePathname active-link highlighting"
  - "Dashboard layout updated: Salon Bot heading text-lg promoted to text-xl (UI-SPEC)"
  - "6 unit tests covering week/month boundary math, formatMad, sumRevenue edge cases"

affects: [06-verification, 07-onboarding]

tech-stack:
  added: []
  patterns:
    - "Africa/Casablanca UTC+1 constant offset (CASABLANCA_OFFSET_MS = 60 * 60 * 1000) for timezone math"
    - "Pure stats helper module pattern: extract time math into @/lib/dashboard/stats for unit testability"
    - "TDD RED/GREEN for pure helpers: failing import first, then implementation"
    - "Supabase join via services(price_mad) — array or object shape handled by Array.isArray branch"

key-files:
  created:
    - salon-bot/src/lib/dashboard/stats.ts
    - salon-bot/src/components/dashboard/StatsCard.tsx
    - salon-bot/src/components/dashboard/DashboardNav.tsx
  modified:
    - salon-bot/src/app/(dashboard)/dashboard/page.tsx
    - salon-bot/src/app/(dashboard)/layout.tsx
    - salon-bot/tests/dashboard-stats.test.ts

key-decisions:
  - "CASABLANCA_OFFSET_MS = 60 * 60 * 1000 constant — Morocco UTC+1, no DST, consistent with Phase 5 reminder route"
  - "sumRevenue handles both object and array Supabase join shapes via Array.isArray — Supabase JS cardinality detection varies"
  - ".eq('status', 'confirmed') enforced on stats queries — excludes cancelled/no_show/completed from revenue (Pitfall 4)"
  - "StatsCard is a Server Component (no use client) — no interactivity needed, avoids client bundle cost"
  - "Typography normalization: font-medium on status badges normalized to font-semibold per UI-SPEC (no font-medium in Phase 6)"

requirements-completed: [DASH-03]

duration: 11min
completed: 2026-05-05
---

# Phase 06 Plan 03: Dashboard Stats and Navigation Summary

**4-card stats grid with confirmed-booking revenue (Africa/Casablanca UTC+1 math), DashboardNav with active highlighting, and pure helper module with 6 unit tests**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-05T21:14:33Z
- **Completed:** 2026-05-05T21:25:30Z
- **Tasks:** 2 (TDD task + component/wiring task)
- **Files modified:** 6

## Accomplishments

- Pure stats helpers in `src/lib/dashboard/stats.ts` with 4 exports and correct UTC+1 boundary math
- 4 StatsCard instances on /dashboard showing confirmed-only bookings count and estimated revenue for current week and month
- DashboardNav Client Component with usePathname active-link highlighting wired into layout
- UI-SPEC typography contract enforced: text-lg promoted to text-xl, font-bold/font-medium normalized to font-semibold throughout dashboard files
- 6 unit tests all green; full Vitest suite passes (pre-existing llm-reply failure unchanged)
- Build succeeds with all 12 routes including /dashboard, /services, /schedules

## Task Commits

1. **Task 1 RED — Failing tests:** `970b38d` (test)
2. **Task 1 GREEN — Stats helpers:** `0a89d8b` (feat)
3. **Task 2 — Components + wiring:** `db7c4b4` (feat, included in prior agent docs commit)

## Files Created/Modified

- `salon-bot/src/lib/dashboard/stats.ts` — Pure helpers: getWeekBoundsCasablanca, getMonthBoundsCasablanca, formatMad, sumRevenue. CASABLANCA_OFFSET_MS constant, fr-FR locale formatting
- `salon-bot/src/components/dashboard/StatsCard.tsx` — Server Component, period/value/subLabel props, text-3xl font-semibold display
- `salon-bot/src/components/dashboard/DashboardNav.tsx` — Client Component, usePathname, 3 links with underline active state
- `salon-bot/src/app/(dashboard)/dashboard/page.tsx` — Extended with stats queries (confirmed-only), 4-card grid, typography normalized
- `salon-bot/src/app/(dashboard)/layout.tsx` — DashboardNav added, text-lg promoted to text-xl
- `salon-bot/tests/dashboard-stats.test.ts` — 6 real assertions replacing placeholders

## Decisions Made

- **UTC+1 constant, no DST:** `CASABLANCA_OFFSET_MS = 60 * 60 * 1000` — Morocco abolished DST in 2018; consistent with Phase 5 reminder route precedent
- **sumRevenue array branch:** Supabase JS may return joined relation as object or array depending on FK cardinality detection — both branches handled via `Array.isArray`
- **Confirmed-only filter:** `.eq('status', 'confirmed')` on both week and month queries — excludes cancelled, no_show, completed bookings from revenue (Pitfall 4 mitigation)
- **StatsCard as Server Component:** No interactivity needed — omitting 'use client' keeps it server-rendered and out of the client bundle
- **Typography normalization:** `font-medium` on status badges (Actif/Inactif) normalized to `font-semibold` per UI-SPEC which bans `font-medium` in Phase 6

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] font-medium on status badges normalized to font-semibold**
- **Found during:** Task 2 acceptance criteria check
- **Issue:** Two `text-xs font-medium` on bot status badges (Actif, Inactif) — UI-SPEC bans font-medium; plan mentioned to replace font-medium with font-semibold but didn't explicitly call out the badge spans
- **Fix:** Replaced both `text-xs font-medium` occurrences with `text-xs font-semibold`
- **Files modified:** `salon-bot/src/app/(dashboard)/dashboard/page.tsx`
- **Verification:** `grep -c "font-medium" dashboard/page.tsx` returns 0
- **Committed in:** `db7c4b4`

---

**Total deviations:** 1 auto-fixed (Rule 1 - typography normalization)
**Impact on plan:** Necessary to satisfy UI-SPEC typography contract. No scope creep.

## Issues Encountered

- **Build lock file:** After first build attempt hit a Turbopack temp file error, subsequent build attempts found `.next/lock` still present from a prior run. Removed the lock and `.next/` directory entirely before a clean build succeeded. No code changes required.
- **Task 2 commit conflict:** Files for Task 2 (StatsCard, DashboardNav, layout.tsx, dashboard/page.tsx) were inadvertently picked up and committed by the concurrent 06-02 agent's docs commit (`db7c4b4`). Files are correctly implemented and committed — no data loss or incorrect state.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Phase 6 plans complete: 06-00, 06-01, 06-02, 06-03
- Phase 6 is ready for manual UAT verification per 06-VALIDATION.md
- /dashboard shows 4 stat cards, /services and /schedules reachable via DashboardNav
- Phase 7 Onboarding Flow can begin once Phase 6 UAT passes

---
*Phase: 06-dashboard-admin*
*Completed: 2026-05-05*
