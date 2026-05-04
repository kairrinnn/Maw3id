---
phase: 5
slug: templates-reminders
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-04
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.2 |
| **Config file** | `salon-bot/vitest.config.ts` |
| **Quick run command** | `vitest run tests/send.test.ts tests/templates.test.ts tests/reminders.test.ts` |
| **Full suite command** | `vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `vitest run tests/send.test.ts tests/templates.test.ts tests/reminders.test.ts`
- **After every plan wave:** Run `vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 05-01 | 0 | TPL-01 | unit | `vitest run tests/send.test.ts tests/templates.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 05-01 | 1 | TPL-01 | unit | `vitest run tests/send.test.ts` | ✅ | ⬜ pending |
| 05-01-03 | 05-01 | 1 | TPL-01 | unit | `vitest run tests/templates.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-01 | 05-02 | 0 | TPL-02 | unit | `vitest run tests/reminders.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-02 | 05-02 | 2 | TPL-02 | unit | `vitest run tests/reminders.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-03 | 05-02 | 2 | TPL-02 | unit | `vitest run tests/reminders.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/templates.test.ts` — stubs for TPL-01 (sendTemplateMessage, template submission)
- [ ] `tests/reminders.test.ts` — stubs for TPL-02 (reminder route, idempotency, auth guard, rollback)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Meta template approval received | TPL-01 | Meta review is async (24-48h), cannot automate | Submit template via POST /api/templates/submit, check Meta dashboard for status APPROVED |
| WhatsApp reminder actually received on phone | TPL-02 | End-to-end delivery requires live Meta sandbox | Trigger /api/reminders/send manually, verify WhatsApp message received on test number |
| pg_cron fires on hosted Supabase | TPL-02 | pg_cron cannot reach localhost | Deploy to hosted Supabase, verify cron fires via Supabase dashboard logs |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (templates.test.ts, reminders.test.ts)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
