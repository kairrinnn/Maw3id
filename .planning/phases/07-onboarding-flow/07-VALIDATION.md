---
phase: 7
slug: onboarding-flow
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-09
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 |
| **Config file** | `salon-bot/vitest.config.ts` |
| **Quick run command** | `npm --prefix salon-bot test -- --reporter=verbose tests/onboarding.test.ts` |
| **Full suite command** | `npm --prefix salon-bot test -- --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm --prefix salon-bot test -- --reporter=verbose tests/onboarding.test.ts`
- **After every plan wave:** Run `npm --prefix salon-bot test -- --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-00-T1 | 07-00 | 0 | ONB-01/02/03/WA-04 | unit | `npm --prefix salon-bot test -- tests/onboarding.test.ts` | ❌ W0 | ⬜ pending |
| 07-00-T2 | 07-00 | 0 | ONB-01/02/03/WA-04 | migration | `test -f salon-bot/supabase/migrations/20260509000001_phase7_onboarding_schema.sql` | ❌ W0 | ⬜ pending |
| 07-01-T1 | 07-01 | 1 | ONB-01 | unit | `npm --prefix salon-bot test -- tests/onboarding.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-T2 | 07-01 | 1 | ONB-01 | unit | `npm --prefix salon-bot test -- tests/onboarding.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-T1 | 07-02 | 2 | ONB-02/WA-04 | unit | `npm --prefix salon-bot test -- tests/onboarding.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-T2 | 07-02 | 2 | ONB-02/WA-04 | unit | `npm --prefix salon-bot test -- tests/onboarding.test.ts` | ❌ W0 | ⬜ pending |
| 07-03-T1 | 07-03 | 2 | ONB-03 | unit | `npm --prefix salon-bot test -- tests/onboarding.test.ts` | ❌ W0 | ⬜ pending |
| 07-03-T2 | 07-03 | 2 | ONB-03 | unit | `npm --prefix salon-bot test -- tests/onboarding.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `salon-bot/tests/onboarding.test.ts` — stubs for ONB-01 (saveSalonProfile, readiness check), ONB-02/WA-04 (savePhoneNumber, upsert), ONB-03 (activateBot gate, test_mode)
- [ ] `salon-bot/supabase/migrations/20260509000001_phase7_onboarding_schema.sql` — adds `tenants.description TEXT`, `UNIQUE(tenant_id)` on `phone_numbers`, `bot_configs.test_mode BOOLEAN DEFAULT false`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wizard redirects to correct step on first login | ONB-01 | Requires live browser session with Supabase auth | Sign up with a fresh account, verify redirect to /onboarding/step-1 |
| Bot inactive until minimum config met | ONB-01 | Requires live DB state checks | Complete step 1 only, verify bot_configs.active = false, bot does not respond to WhatsApp |
| WhatsApp number saves and bot activates | ONB-02/WA-04 | Requires real Meta credentials | Enter test phone_number_id + waba_id, verify phone_numbers row created, bot responds |
| Test mode badge visible on dashboard | ONB-03 | Requires browser + live DB | Activate in test mode, verify badge shows on dashboard, real number still inactive |
| pg_cron migration prerequisite | ONB-01 | Requires Supabase Studio access | Run ALTER DATABASE postgres SET app.cron_secret and app.app_url before migration apply |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (onboarding.test.ts, schema migration)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
