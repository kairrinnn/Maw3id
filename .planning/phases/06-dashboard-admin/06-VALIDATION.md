---
phase: 6
slug: dashboard-admin
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-05
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 |
| **Config file** | `salon-bot/vitest.config.ts` |
| **Quick run command** | `npm --prefix salon-bot test -- --reporter=verbose` |
| **Full suite command** | `npm --prefix salon-bot test -- --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm --prefix salon-bot test -- --reporter=verbose`
- **After every plan wave:** Run `npm --prefix salon-bot test -- --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 06-01 | 0 | DASH-01 | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ W0 | ⬜ pending |
| 06-01-02 | 06-01 | 1 | DASH-01 | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ W0 | ⬜ pending |
| 06-01-03 | 06-01 | 1 | DASH-01 | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ W0 | ⬜ pending |
| 06-02-01 | 06-02 | 0 | DASH-02 | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ W0 | ⬜ pending |
| 06-02-02 | 06-02 | 2 | DASH-02 | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ W0 | ⬜ pending |
| 06-03-01 | 06-03 | 0 | DASH-03 | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ W0 | ⬜ pending |
| 06-03-02 | 06-03 | 2 | DASH-03 | unit | `npm --prefix salon-bot test -- --reporter=verbose` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `salon-bot/tests/dashboard-services.test.ts` — stubs for DASH-01 (createService, updateService, deleteService)
- [ ] `salon-bot/tests/dashboard-schedules.test.ts` — stubs for DASH-02 (upsertSchedule)
- [ ] `salon-bot/tests/dashboard-stats.test.ts` — stubs for DASH-03 (stats aggregation)
- [ ] Migration: `ALTER TABLE schedules ADD CONSTRAINT schedules_tenant_day_unique UNIQUE (tenant_id, day_of_week)` if not already present

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Services CRUD renders correctly in browser | DASH-01 | React Server Components require browser for visual verification | Create, edit, and delete a service from /services, verify table updates without page reload |
| Schedule form renders all 7 days | DASH-02 | 7-row grid layout requires visual inspection | Visit /schedules, verify Mon–Sun rows render, toggle closed checkbox, save and reload |
| Stats cards show correct week/month counts | DASH-03 | Date window accuracy requires live DB with real bookings data | Verify totals match Supabase dashboard counts for current week and month |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (dashboard-services.test.ts, dashboard-schedules.test.ts, dashboard-stats.test.ts)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
