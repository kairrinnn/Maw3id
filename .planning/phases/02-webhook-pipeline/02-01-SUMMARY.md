---
phase: 02-webhook-pipeline
plan: "01"
subsystem: api
tags: [whatsapp, meta, webhook, supabase, deduplication, tenant-routing, vitest]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "9-table Supabase schema (phone_numbers, bot_configs, conversations, tenants), service role client, TypeScript types"

provides:
  - "GET /api/webhook — Meta one-time verification challenge handler"
  - "POST /api/webhook — tenant-routed, deduplicated, bot-gated message handler"
  - "processed_messages migration with wamid PRIMARY KEY for idempotent delivery"
  - "src/lib/whatsapp/types.ts — full Meta webhook payload TypeScript types"
  - "Phase 2 stub sendStubReply — inline fetch call replaced by send.ts in Plan 02-02"

affects:
  - 02-02-send-helper
  - 03-conversation-fsm
  - 05-template-messages

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Webhook idempotency via upsert(ignoreDuplicates:true) + count check — count=0 means duplicate"
    - "Tenant routing via phone_numbers.phone_number_id JOIN tenants — never trust payload's own IDs"
    - "Meta must always receive 200 — all error paths return 200 silently to prevent retries"
    - "Bot gating via bot_configs.active — set false at onboarding, owner enables after setup"

key-files:
  created:
    - salon-bot/supabase/migrations/20260401000001_processed_messages.sql
    - salon-bot/src/lib/whatsapp/types.ts
    - salon-bot/src/app/api/webhook/route.ts
    - salon-bot/tests/webhook.test.ts
  modified: []

key-decisions:
  - "upsert(ignoreDuplicates:true, count:'exact') used for dedup — .insert().onConflict().ignore() is not valid Supabase JS v2"
  - "processMessage() is a separate async function (not inline) — allows Plan 02-02 to replace sendStubReply without touching route logic"
  - "Non-text messages (image/audio/video) get French polite reply — bot is text-only, must not silently drop"
  - "service.ts preserved from Phase 1 — auth.autoRefreshToken=false, persistSession=false are correctness settings for service role"

patterns-established:
  - "Webhook handler always returns 200 — Meta retries on non-200 causing duplicate delivery"
  - "Dedup before conversation upsert — check count after upsert, bail on 0 (already processed)"
  - "Tenant resolution is the first DB call — if no tenant, no further processing"

requirements-completed: ["WA-01", "WA-02", "INFRA-05"]

# Metrics
duration: 3min
completed: "2026-04-01"
---

# Phase 2 Plan 01: Webhook Handler + Tenant Routing Summary

**POST /api/webhook routes Meta payloads to tenants via phone_number_id, deduplicates by wamid PRIMARY KEY, and gates on bot_config.active — all 8 vitest tests GREEN, 0 TypeScript errors**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T07:06:25Z
- **Completed:** 2026-04-01T07:09:20Z
- **Tasks:** 2
- **Files modified:** 4 created, 0 modified

## Accomplishments
- GET handler returns hub.challenge for Meta verification challenge, 403 on token mismatch
- POST handler resolves tenant from phone_numbers table, checks bot active status, deduplicates by wamid, upserts conversation, sends stub reply
- processed_messages migration with wamid PRIMARY KEY enables idempotent message delivery
- Full Meta webhook payload types exported from src/lib/whatsapp/types.ts
- 8 unit tests covering all behavioral branches (TDD RED → GREEN)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration + service client + types** - `2bbecda` (feat)
2. **Task 2: Failing tests — RED** - `f1cfc07` (test)
3. **Task 2: Route implementation — GREEN** - `3f33e0d` (feat)

**Plan metadata:** _(docs commit follows)_

_Note: TDD task has two commits (test RED → feat GREEN)_

## Files Created/Modified
- `salon-bot/supabase/migrations/20260401000001_processed_messages.sql` - processed_messages table with wamid PK and tenant_id index
- `salon-bot/src/lib/whatsapp/types.ts` - WebhookPayload, WebhookMessage, WebhookMetadata, WebhookValue, WebhookEntry, WebhookChange, SendTemplatePayload
- `salon-bot/src/app/api/webhook/route.ts` - GET verification + POST tenant-routed message handler with stub reply
- `salon-bot/tests/webhook.test.ts` - 8 vitest unit tests covering all webhook behavior branches
- `salon-bot/src/lib/supabase/service.ts` - Verified existing, not modified (exports createServiceClient with auth config)

## Decisions Made
- Used `upsert({ onConflict: 'wamid', ignoreDuplicates: true, count: 'exact' })` — `.insert().onConflict().ignore()` chaining is not valid in Supabase JS v2
- `processMessage()` extracted as separate function so Plan 02-02 can replace `sendStubReply` without touching route-level logic
- Non-text messages (image/audio/video/etc.) receive a French polite reply rather than silent drop — prevents clients thinking bot is broken
- service.ts from Phase 1 preserved exactly — `auth: { autoRefreshToken: false, persistSession: false }` are required for service role correctness

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required for this plan. WHATSAPP_API_TOKEN will be needed at deploy time (already noted in Phase 5 flag).

## Next Phase Readiness
- POST /api/webhook is live and testable — Meta can deliver messages
- Plan 02-02 can implement `src/lib/whatsapp/send.ts` and replace `sendStubReply` in route.ts
- Phase 3 FSM can receive messages via `processMessage()` once send.ts is ready
- processed_messages migration must be applied to Supabase before live testing

---
*Phase: 02-webhook-pipeline*
*Completed: 2026-04-01*
