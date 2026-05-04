---
phase: 05-templates-reminders
plan: 02
subsystem: api
tags: [whatsapp, meta-api, reminders, pg_cron, pg_net, supabase, idempotency, cron]

# Dependency graph
requires:
  - phase: 05-01
    provides: sendTemplateMessage with per-tenant phoneNumberId, whatsapp_templates table rows

provides:
  - POST /api/reminders/send — auth-gated cron target with optimistic-lock idempotency + Meta rollback
  - pg_cron migration for hosted Supabase 5-minute schedule (no secrets in git)
  - .env.local.example documenting all project env vars including new CRON_SECRET

affects:
  - 07-onboarding (needs ALTER DATABASE SET app.cron_secret and app.app_url before migration apply)
  - 06-dashboard (can surface reminder_sent status per booking)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optimistic-lock idempotency: UPDATE with count:'exact' and .eq('reminder_sent', false) guard — concurrent cron runs cannot double-send"
    - "Meta failure rollback: reminder_sent reset to false on send error so next cron run retries"
    - "pg_cron secret injection via current_setting('app.cron_secret') — no literal secrets in migration SQL"
    - "Africa/Casablanca timezone formatting via toLocaleString('fr-FR', {timeZone: 'Africa/Casablanca'})"

key-files:
  created:
    - salon-bot/src/app/api/reminders/send/route.ts
    - salon-bot/supabase/migrations/20260505000002_phase5_cron.sql
    - salon-bot/.env.local.example
  modified:
    - salon-bot/tests/reminders.test.ts

key-decisions:
  - "Optimistic-lock UPDATE chosen over advisory locks or Redis — matches research Pattern 2, reuses same idempotency pattern as Phase 2 processed_messages dedup"
  - "Africa/Casablanca timezone hardcoded in route — Morocco-only product, no multi-timezone requirement"
  - "5-minute cron cadence — each booking in 23-25h window has 24 polling chances; combined with rollback gives strong delivery guarantee"
  - "pg_cron migration ships for hosted-only — local dev cannot route pg_cron to localhost:3000 (research Pitfall #3)"
  - "CRON_SECRET sourced via current_setting('app.cron_secret') indirection — no hardcoded secrets in git"
  - "Migration requires one-time ALTER DATABASE SET before apply — flagged for Phase 7 onboarding automation"
  - "Test null-coalescing bug fixed: null ?? fixture evaluates to fixture in JS; use 'in' operator to distinguish explicit null from missing key"

patterns-established:
  - "Cron-target route pattern: auth gate → query window → per-row fetch → claim (optimistic-lock) → send → rollback-on-throw"
  - "pg_cron + pg_net integration: secrets via current_setting, URL via current_setting, cron.unschedule guard for idempotent re-apply"

requirements-completed: [TPL-02]

# Metrics
duration: 15min
completed: 2026-05-04
---

# Phase 5 Plan 02: Reminder Scheduler Summary

**POST /api/reminders/send with optimistic-lock idempotency (UPDATE count:'exact' guard), Meta failure rollback, and pg_cron 5-minute schedule migration — Phase 5 (Templates & Reminders) complete**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-04T22:00:00Z
- **Completed:** 2026-05-04T23:00:00Z
- **Tasks:** 3 (TDD RED already committed + GREEN implementation + pg_cron migration)
- **Files modified:** 4

## Accomplishments

- POST /api/reminders/send enforces x-cron-secret auth gate against CRON_SECRET env var
- Route queries 23-25h window, fetches per-tenant phone number and APPROVED template, skips silently if either missing
- Optimistic-lock UPDATE with `.eq('reminder_sent', false)` guard and `count: 'exact'` — concurrent cron runs cannot double-send the same booking
- On Meta send failure: rolls back `reminder_sent=false` so next cron run retries (no lost bookings)
- pg_cron migration ships for hosted Supabase apply with no secrets hardcoded (uses `current_setting` indirection)
- 10 new tests passing (all scenarios: auth, window, happy path, no template, no phone, race condition, rollback)
- 124/125 tests pass across full suite (1 pre-existing failure in llm-reply.test.ts, unrelated)
- Zero TypeScript errors

## Task Commits

1. **Task 1 (TDD RED): Failing tests** - `d177000` (test) — committed in prior session
2. **Task 2 (GREEN): Route implementation + test fixes** - `77d2260` (feat)
3. **Task 3: pg_cron migration** - `31b3e6b` (feat)

## Files Created/Modified

- `salon-bot/src/app/api/reminders/send/route.ts` — Cron-target reminder sender with optimistic-lock idempotency (127 lines)
- `salon-bot/supabase/migrations/20260505000002_phase5_cron.sql` — pg_cron 5-min schedule + pg_net call for hosted Supabase
- `salon-bot/.env.local.example` — All project env vars documented including new CRON_SECRET
- `salon-bot/tests/reminders.test.ts` — 10 test cases, fixed null-coalescing bug and TypeScript errors

## Decisions Made

- **Optimistic-lock idempotency:** The UPDATE-with-WHERE-guard pattern (`count: 'exact'`, `.eq('reminder_sent', false)`) is the identical dedup technique Phase 2 used for `processed_messages`. No Redis, advisory locks, or claims table — consistent with established project patterns.
- **Africa/Casablanca timezone hardcoded:** Morocco-only product, no multi-timezone requirement. Using `toLocaleString('fr-FR', {timeZone: 'Africa/Casablanca'})` gives French-language datetime strings directly suitable for template body.
- **5-minute cron cadence:** Each booking in the 23-25h window has 24 polling attempts. Combined with the optimistic lock + rollback, this provides a strong delivery guarantee even with transient Meta API failures.
- **pg_cron hosted-only:** Local dev uses manual `curl` trigger. Research Pitfall #3 confirmed pg_cron cannot resolve `localhost:3000` in local Supabase environment.
- **CRON_SECRET via current_setting indirection:** `ALTER DATABASE postgres SET app.cron_secret = '...'` separates secret from migration SQL. No secrets land in git history.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed null-coalescing bug in test helper setupHappyPath**
- **Found during:** Task 2 (running tests against the implemented route)
- **Issue:** `opts.tpl ?? templateFixture` evaluates to `templateFixture` when `opts.tpl` is explicitly `null` (nullish coalescing replaces both `null` and `undefined`). So tests passing `{ tpl: null }` were silently using the fixture, making "skip when no template" and "skip when no phone" tests pass with `sent: 1` instead of `sent: 0`.
- **Fix:** Changed all three checks to `'key' in opts ? opts.key : defaultFixture` to correctly distinguish explicit `null` from missing key.
- **Files modified:** `salon-bot/tests/reminders.test.ts`
- **Verification:** Both previously-failing tests now pass (`sent: 0`, `sendTemplateMessage` not called).
- **Committed in:** `77d2260` (Task 2 commit)

**2. [Rule 2 - Missing] Fixed TypeScript errors in reminders.test.ts**
- **Found during:** Task 2 (npx tsc --noEmit check)
- **Issue:** Two TS errors: (a) `{ from: mockFrom }` cast to `ReturnType<typeof createServiceClient>` fails type overlap check; (b) `payload.components` accessed without undefined guard.
- **Fix:** Added `as unknown as ReturnType<typeof createServiceClient>` double-cast; added `const components = payload.components!` with non-null assertion for component access.
- **Files modified:** `salon-bot/tests/reminders.test.ts`
- **Verification:** `npx tsc --noEmit` produces zero errors.
- **Committed in:** `77d2260` (Task 2 commit)

**3. [Rule 3 - Blocking] .env.example renamed to .env.local.example to avoid gitignore**
- **Found during:** Task 2 (git add rejected .env.example)
- **Issue:** `.gitignore` pattern `.env*` excludes `.env.example` but explicitly allows `.env.local.example`.
- **Fix:** Created file as `salon-bot/.env.local.example` instead.
- **Files modified:** `salon-bot/.env.local.example` (created)
- **Verification:** `git add` succeeds; file committed in `77d2260`.
- **Committed in:** `77d2260` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness, TypeScript compliance, and git compatibility. No scope creep.

## Issues Encountered

- Pre-existing test failure in `llm-reply.test.ts > Gemini success` present before this plan (confirmed in 05-01 deferred items). Out of scope per deviation rules.

## Operational Note for Phase 7

Before applying the pg_cron migration to hosted Supabase, set these once as a superuser:
```sql
ALTER DATABASE postgres SET app.cron_secret = '<same value as CRON_SECRET on Vercel/host>';
ALTER DATABASE postgres SET app.app_url = 'https://<production-host>';
```
Phase 7 onboarding automation should include these as a setup step.

## Hand-off Note

Phase 5 (Templates & Reminders) is complete. Both plans delivered:
- **05-01:** `sendTemplateMessage()` with per-tenant phoneNumberId + POST `/api/templates/submit` + seed migration (3 templates per tenant)
- **05-02:** POST `/api/reminders/send` with auth, idempotency, rollback + pg_cron migration

**Phase 6 (Dashboard Admin)** can now surface:
- A "Submit template to Meta" button calling POST `/api/templates/submit` — route ready
- A "Reminder status" panel reading `bookings.reminder_sent` — column already exists in schema

## Self-Check: PASSED

- FOUND: salon-bot/src/app/api/reminders/send/route.ts
- FOUND: salon-bot/supabase/migrations/20260505000002_phase5_cron.sql
- FOUND: salon-bot/.env.local.example
- FOUND: .planning/phases/05-templates-reminders/05-02-SUMMARY.md
- FOUND commit: d177000 (test RED)
- FOUND commit: 77d2260 (feat GREEN)
- FOUND commit: 31b3e6b (feat cron)

---
*Phase: 05-templates-reminders*
*Completed: 2026-05-05*
