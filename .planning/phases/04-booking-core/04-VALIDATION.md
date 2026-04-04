---
phase: 4
slug: booking-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 4 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 |
| **Config file** | `salon-bot/vitest.config.mts` |
| **Quick run command** | `cd salon-bot && npx vitest run tests/booking.test.ts tests/fsm-machine.test.ts --reporter=verbose` |
| **Full suite command** | `cd salon-bot && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite green + manual double-booking race test passed
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 04-01 | 0 | BOOK-05 | unit | `npx vitest run tests/booking.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 04-01 | 1 | BOOK-01, BOOK-06 | unit | `npx vitest run tests/booking.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-01 | 04-02 | 1 | BOOK-03, BOOK-07 | unit | `npx vitest run tests/booking.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-02 | 04-02 | 1 | BOOK-02 | unit | `npx vitest run tests/booking.test.ts` | ❌ W0 | ⬜ pending |
| 4-03-01 | 04-03 | 1 | BOOK-04 | unit | `npx vitest run tests/booking.test.ts` | ❌ W0 | ⬜ pending |
| 4-04-01 | 04-04 | 2 | BOOK-01..07 | unit | `npx vitest run tests/webhook.test.ts tests/fsm-machine.test.ts` | ✅ exists | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `tests/booking.test.ts` — covers BOOK-01 through BOOK-07 (mock Supabase RPC + service client)
- [ ] Migration: `add owner_notification_wa_id to bot_configs`
- [ ] Migration: `create_booking RPC (Postgres function with SELECT FOR UPDATE)`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two concurrent booking requests for same slot → only one succeeds | BOOK-05 | Race condition requires concurrent requests, not unit test | Send two simultaneous curl requests to webhook with same slot, verify DB has exactly 1 confirmed booking |
| Owner receives WhatsApp notification on cancellation | BOOK-07 | Requires real Meta API + real phone number | Cancel a test booking via WhatsApp, verify owner's number receives message |
| Timezone correctness (Morocco UTC+1) | BOOK-01 | Requires end-to-end with real device | Book "demain à 15h" from Morocco timezone, verify DB stores correct UTC time |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
