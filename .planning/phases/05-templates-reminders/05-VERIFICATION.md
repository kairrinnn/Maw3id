---
phase: 05-templates-reminders
verified: 2026-05-05T00:10:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
human_verification:
  - test: "Submit a real template to Meta sandbox"
    expected: "Meta returns {id, status:'PENDING'} and whatsapp_templates.meta_status updates to 'PENDING'"
    why_human: "Requires live Meta credentials and a real WABA account — cannot mock the actual Meta approval pipeline"
  - test: "End-to-end reminder delivery on hosted Supabase"
    expected: "pg_cron fires every 5 minutes, a booking due in 24h receives a WhatsApp message, reminder_sent becomes true, re-run sends 0"
    why_human: "pg_cron + pg_net cannot fire against localhost:3000 — requires hosted Supabase with app.cron_secret and app.app_url configured"
---

# Phase 5: Templates & Reminders Verification Report

**Phase Goal:** Clients receive automated WhatsApp reminders before appointments using Meta-approved templates
**Verified:** 2026-05-05T00:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The 3 standard templates (reminder, confirmation, cancellation) are stored per tenant and submittable to Meta from the dashboard | VERIFIED | Seed migration `20260505000001_seed_standard_templates.sql` inserts all 3 rows per tenant with a trigger for new tenants; `/api/templates/submit` route POSTs to `/{waba_id}/message_templates` and updates `meta_status`; 7/7 unit tests green |
| 2 | A client with a confirmed appointment receives a WhatsApp reminder message 24 hours before their slot via an approved template | VERIFIED | `/api/reminders/send` queries `bookings WHERE status='confirmed' AND reminder_sent=false` within 23-25h window, fetches `APPROVED` template, calls `sendTemplateMessage()` with correct Africa/Casablanca datetime; 9/9 unit tests green including happy-path payload assertion |
| 3 | A reminder is not sent twice for the same appointment even if the scheduler runs multiple times | VERIFIED | Optimistic-lock UPDATE `.update({reminder_sent: true}, {count: 'exact'}).eq('reminder_sent', false)` — when `count === 0`, send is skipped; race-condition test and claim test both green |

**Score:** 3/3 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `salon-bot/src/lib/whatsapp/types.ts` | `SendTemplatePayload` extended with `phoneNumberId: string` | VERIFIED | Line 60: `phoneNumberId: string  // required for multi-tenant` — field is required (not optional) |
| `salon-bot/src/lib/whatsapp/send.ts` | `sendTemplateMessage()` implementation (min 60 lines) | VERIFIED | 75 lines; full implementation with fetch POST, error handling, returns wamid; no stub text found |
| `salon-bot/src/app/api/templates/submit/route.ts` | POST endpoint submitting template to Meta | VERIFIED | 88 lines; exports `POST`; loads body_text + waba_id from DB, POSTs to `/{waba_id}/message_templates`, updates `meta_status` |
| `salon-bot/supabase/migrations/20260505000001_seed_standard_templates.sql` | Seeds 3 standard templates per tenant | VERIFIED | 51 lines; contains `rdv_reminder`, `rdv_confirmation`, `rdv_cancellation` in both backfill INSERT and trigger function; `ON CONFLICT DO NOTHING` on all paths |
| `salon-bot/tests/templates.test.ts` | Unit coverage for submit route (min 80 lines) | VERIFIED | 187 lines; 7 test cases covering 400/404 validation, Meta POST payload shape, meta_status update, 502 on Meta failure |
| `salon-bot/src/app/api/reminders/send/route.ts` | Cron-target reminder sender with idempotency (min 100 lines) | VERIFIED | 126 lines; exports `POST`; auth gate, 23-25h window query, optimistic-lock, rollback on failure |
| `salon-bot/tests/reminders.test.ts` | Unit coverage for reminder route (min 150 lines) | VERIFIED | 368 lines; 9 test cases including auth gate (2), no bookings, window math, happy path, skip-no-template, skip-no-phone, race-condition, rollback |
| `salon-bot/supabase/migrations/20260505000002_phase5_cron.sql` | pg_cron 5-min schedule for hosted Supabase | VERIFIED | 37 lines; `cron.schedule('send-appointment-reminders', '*/5 * * * *', ...)` with `net.http_post`; `current_setting` indirection for secret (no hardcoded value); idempotent via `cron.unschedule WHERE EXISTS` |
| `salon-bot/.env.local.example` | `CRON_SECRET` env var documented | VERIFIED | Line 27-28: `CRON_SECRET=` with comment explaining hosted Supabase requirement — note: documented in `.env.local.example`, not `.env.example` (plan said `.env.example`; the project uses `.env.local.example`; documentation requirement is satisfied) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `send.ts` | `https://graph.facebook.com/{version}/{phoneNumberId}/messages` | `fetch POST` with `type: 'template'` | WIRED | Line 49: URL built with `payload.phoneNumberId`; line 60: `type: 'template'` in body |
| `templates/submit/route.ts` | `https://graph.facebook.com/{version}/{waba_id}/message_templates` | `fetch POST` with components + example.body_text | WIRED | Line 41: URL uses `phoneRow.waba_id/message_templates`; line 48: nested `example.body_text: [exampleValues]` |
| `templates/submit/route.ts` | `whatsapp_templates` table | `supabase update meta_status` after successful POST | WIRED | Lines 82-85: `.from('whatsapp_templates').update({meta_status: metaData.status}).eq('id', tplRow.id)` |
| `reminders/send/route.ts` | `sendTemplateMessage` in `send.ts` | `import + await sendTemplateMessage(payload)` | WIRED | Line 2: `import { sendTemplateMessage } from '@/lib/whatsapp/send'`; line 99: `await sendTemplateMessage({...})` |
| `reminders/send/route.ts` | `bookings` table | `update reminder_sent=true` with `eq('reminder_sent', false)` guard | WIRED | Lines 87-91: `.update({reminder_sent: true}, {count: 'exact'}).eq('id', booking.id).eq('reminder_sent', false)` |
| `20260505000002_phase5_cron.sql` | `/api/reminders/send` | `net.http_post` every 5 minutes | WIRED | Lines 25-32: `SELECT net.http_post(url := current_setting('app.app_url') || '/api/reminders/send', ...)` |
| `reminders/send/route.ts` | `whatsapp_templates` table | `supabase select WHERE meta_status='APPROVED'` | WIRED | Lines 53-59: `.from('whatsapp_templates').select('template_name, language').eq('meta_status', 'APPROVED').single()` |

All 7 key links WIRED.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TPL-01 | 05-01-PLAN.md | 3 standard templates stored per tenant and submittable to Meta | SATISFIED | Seed migration + trigger cover all existing and new tenants; submit route handles full Meta submission lifecycle |
| TPL-02 | 05-02-PLAN.md | Automatic 24h reminder via approved Meta template | SATISFIED | Reminder route + pg_cron migration implement full pipeline with idempotency guarantee |

No orphaned requirements found for Phase 5.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/reminders.test.ts` | 121 (stderr during rollback test) | `console.error` logs appear in test output | INFO | Expected behavior — the route intentionally calls `console.error` on send failure; not a code defect |

No blockers or warnings found in implementation files. No stubs, placeholders, or empty handlers detected.

---

### Test Suite Status

| Test File | Tests | Status | Notes |
|-----------|-------|--------|-------|
| `tests/templates.test.ts` | 7/7 | ALL PASS | Phase 5 Plan 01 |
| `tests/reminders.test.ts` | 9/9 | ALL PASS | Phase 5 Plan 02 |
| `tests/send.test.ts` | included in full suite | ALL PASS | sendTemplateMessage covered |
| `tests/webhook.test.ts` | included in full suite | ALL PASS | No regression from Phase 5 |
| `tests/llm-reply.test.ts` | 1 FAIL / 14 total | PRE-EXISTING FAILURE | Failure introduced in Phase 4.5 commit `061f1c6` (before Phase 5 began); unrelated to Phase 5 artifacts |

Full suite: **124 passed / 1 failed** — the single failure is a pre-existing Phase 4.5 defect in `llm-reply.test.ts`, not caused by any Phase 5 change.

---

### Human Verification Required

#### 1. Live Meta Template Submission

**Test:** Call `POST /api/templates/submit` with a real tenant UUID and `template_name: rdv_reminder` using valid Meta credentials in `.env.local`
**Expected:** Meta returns `{id: "<template_id>", status: "PENDING"}`, and the `whatsapp_templates` row for that tenant updates `meta_status` to `PENDING`
**Why human:** Cannot mock the Meta template approval pipeline; requires a real WABA and Graph API token with template management permissions

#### 2. pg_cron End-to-End on Hosted Supabase

**Test:** On a hosted Supabase project, run `ALTER DATABASE postgres SET app.cron_secret = '...'; ALTER DATABASE postgres SET app.app_url = 'https://...';` then apply the `20260505000002_phase5_cron.sql` migration. Insert a confirmed booking with `appointment_at = now() + interval '24 hours'`. Wait for the next 5-minute cron tick.
**Expected:** The booking's `reminder_sent` becomes `true`, the client's WhatsApp number receives the `rdv_reminder` template message, and a second cron run returns `{sent: 0}` for the same booking.
**Why human:** pg_cron cannot call `localhost:3000`; requires live hosted infrastructure with `pg_net` enabled and a real WhatsApp test number.

---

### Gaps Summary

No gaps. All 3 success criteria are implemented, tested, and wired end-to-end at the code level. The two human verification items are environmental integration tests that cannot be verified programmatically, not code defects.

---

_Verified: 2026-05-05T00:10:00Z_
_Verifier: Claude (gsd-verifier)_
