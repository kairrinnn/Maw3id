---
phase: 05-templates-reminders
plan: 01
subsystem: api
tags: [whatsapp, meta-api, templates, supabase, postgres, multi-tenant]

# Dependency graph
requires:
  - phase: 04.5-llm-responses
    provides: sendTextMessage, webhook route pattern, createServiceClient
  - phase: 01-foundation
    provides: whatsapp_templates table schema, phone_numbers.waba_id, UNIQUE(tenant_id, template_name)

provides:
  - sendTemplateMessage(payload) with per-tenant phoneNumberId — ready for Plan 05-02 reminder scheduler
  - POST /api/templates/submit — submits a tenant's stored template to Meta for approval
  - Seed migration: 3 standard templates per tenant (rdv_reminder, rdv_confirmation, rdv_cancellation) + future-tenant trigger

affects:
  - 05-02-reminders (consumes sendTemplateMessage)
  - 06-dashboard (consumes /api/templates/submit for UI action)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-tenant template send: phoneNumberId from DB payload, not global env var"
    - "Meta template submit: waba_id (not phone_number_id) for /{waba_id}/message_templates endpoint"
    - "Meta example.body_text: nested array [[val1, val2]] required for templates with {{n}} variables"
    - "Idempotent seed migration: ON CONFLICT (tenant_id, template_name) DO NOTHING + AFTER INSERT trigger"

key-files:
  created:
    - salon-bot/src/app/api/templates/submit/route.ts
    - salon-bot/supabase/migrations/20260505000001_seed_standard_templates.sql
    - salon-bot/tests/templates.test.ts
  modified:
    - salon-bot/src/lib/whatsapp/types.ts
    - salon-bot/src/lib/whatsapp/send.ts
    - salon-bot/tests/send.test.ts

key-decisions:
  - "phoneNumberId required in SendTemplatePayload (not global env) — multi-tenant support (pitfall #4)"
  - "waba_id used for template submission to /{waba_id}/message_templates (not phone_number_id — pitfall #1)"
  - "category locked to UTILITY for all 3 standard templates — appointment reminders are not MARKETING"
  - "example.body_text is nested array [[val1, val2]] — required by Meta when template contains {{n}} variables"
  - "API version defaulted to v23.0 (upgraded from v21.0 used in sendTextMessage — aligned with Phase 5 research)"
  - "Seed migration uses ON CONFLICT DO NOTHING (matches UNIQUE constraint) + AFTER INSERT trigger for new tenants"

patterns-established:
  - "Template submission route pattern: validate body -> load template row -> load waba_id -> POST to Meta -> update meta_status"
  - "TDD RED/GREEN pattern: test files committed failing, implementation committed separately"

requirements-completed: [TPL-01]

# Metrics
duration: 4min
completed: 2026-05-04
---

# Phase 5 Plan 01: Templates & Submit Route Summary

**sendTemplateMessage() implemented with per-tenant phoneNumberId + POST /api/templates/submit route + idempotent 3-template seed migration for every tenant**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-04T18:06:12Z
- **Completed:** 2026-05-04T18:10:00Z
- **Tasks:** 3 (TDD RED + 2x GREEN)
- **Files modified:** 6

## Accomplishments

- sendTemplateMessage stub replaced with full implementation using per-tenant phoneNumberId from payload
- POST /api/templates/submit handles all error paths (400/404/502/200) and updates meta_status after Meta approval
- Seed migration creates 3 standard templates for existing tenants + AFTER INSERT trigger auto-seeds future tenants
- 17 new tests added (7 sendTemplateMessage + 7 template submit + 3 pre-existing send tests retained)
- Zero TypeScript errors; 115 tests pass (1 pre-existing unrelated failure in llm-reply.test.ts)

## Task Commits

1. **Task 1 (TDD RED): Failing tests** - `43941dc` (test)
2. **Task 2 (GREEN): sendTemplateMessage implementation** - `5e5bc11` (feat)
3. **Task 3 (GREEN): Submit route + seed migration** - `1eafacf` (feat)

## Files Created/Modified

- `salon-bot/src/lib/whatsapp/types.ts` - Added `phoneNumberId: string` (required) to SendTemplatePayload
- `salon-bot/src/lib/whatsapp/send.ts` - Replaced stub with full sendTemplateMessage implementation
- `salon-bot/src/app/api/templates/submit/route.ts` - New POST route for Meta template submission
- `salon-bot/supabase/migrations/20260505000001_seed_standard_templates.sql` - Seed + trigger migration
- `salon-bot/tests/send.test.ts` - Replaced stub describe block with 7 real sendTemplateMessage tests
- `salon-bot/tests/templates.test.ts` - New file with 7 tests for template submit route

## Decisions Made

- **phoneNumberId in payload (not env):** SendTemplatePayload extended with required `phoneNumberId` field. The reminder route (Plan 05-02) will fetch `phone_numbers.phone_number_id` from DB and pass it here. No global env var — that would break multi-tenant.
- **waba_id for template submit:** Template submission uses `/{waba_id}/message_templates` endpoint. The route fetches `phone_numbers.waba_id` (not `phone_number_id`) — these are different Meta IDs.
- **UTILITY category locked:** All 3 standard templates hardcoded as UTILITY. Marketing category increases cost and applies opt-out rules — not appropriate for appointment reminders.
- **example.body_text nested array:** Meta requires `example: { body_text: [['val1', 'val2']] }` (array of arrays) when template body contains `{{n}}` variables. Missing this causes Meta to reject the submission.
- **v23.0 default:** sendTemplateMessage defaults to v23.0 (sendTextMessage still defaults to v21.0 — not changed, no plan scope to do so).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing test failure in `llm-reply.test.ts > Gemini success` was present before this plan (confirmed via git stash). Out of scope per deviation rules. Logged to deferred items.

## Hand-off Note for 05-02

`sendTemplateMessage(payload)` is ready. The `payload` type requires `phoneNumberId` which must come from `phone_numbers.phone_number_id` (NOT `waba_id`) per tenant. The reminder route (05-02) should query `phone_numbers` with `.select('phone_number_id')` when building the payload for sendTemplateMessage.

The submit route uses `waba_id` (different field) — reminder route uses `phone_number_id`. Both are in the `phone_numbers` table, just different columns.

## Next Phase Readiness

- Plan 05-02 (reminder scheduler) can consume `sendTemplateMessage()` directly — signature is stable
- Template rows exist per tenant (after migration apply); `meta_status='pending'` until submitted to Meta
- Submit route ready for Phase 6 dashboard UI to trigger template submission per tenant

---
*Phase: 05-templates-reminders*
*Completed: 2026-05-04*
