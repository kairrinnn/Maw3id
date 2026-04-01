---
phase: 02-webhook-pipeline
plan: "02"
subsystem: api
tags: [whatsapp, meta-graph-api, hmac-sha256, webhook, fetch, crypto, tdd]

# Dependency graph
requires:
  - phase: 02-webhook-pipeline/02-01
    provides: "route.ts POST handler with sendStubReply, WebhookPayload types, WhatsApp types"
provides:
  - "sendTextMessage(to, body, phoneNumberId) — Meta Graph API client returning outbound wamid"
  - "sendTemplateMessage — Phase 5 stub exported from send.ts"
  - "verifyWebhookSignature(rawBody, signature, appSecret) — HMAC-SHA256 X-Hub-Signature-256 verification"
  - "POST /api/webhook with signature gate (bypassable via SKIP_WEBHOOK_SIGNATURE=true)"
  - ".env.local.example documenting all 7 Phase 2 env vars"
affects: [03-fsm, 05-templates, testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw body read with request.text() before JSON.parse() to enable HMAC signature verification"
    - "SKIP_WEBHOOK_SIGNATURE env var pattern for dev/test bypass of security gate"
    - "vi.mock factory pattern without top-level variable references (vitest hoisting constraint)"

key-files:
  created:
    - salon-bot/src/lib/whatsapp/send.ts
    - salon-bot/src/lib/whatsapp/verify.ts
    - salon-bot/tests/send.test.ts
    - salon-bot/tests/verify.test.ts
  modified:
    - salon-bot/src/app/api/webhook/route.ts
    - salon-bot/tests/webhook.test.ts
    - salon-bot/.env.local.example

key-decisions:
  - "sendTextMessage throws on non-200 (not silent skip) — caller decides whether to swallow errors"
  - "SKIP_WEBHOOK_SIGNATURE env var bypasses signature check in dev/test; must never be set in prod"
  - "sendTemplateMessage exported as stub that throws immediately — Phase 5 implements it"
  - "webhook.test.ts mocks sendTextMessage entirely to keep route tests focused on routing logic, not Meta API"

patterns-established:
  - "TDD RED-GREEN for all new library functions — send.ts and verify.ts both tested before implementation"
  - "vi.mock factory cannot reference top-level vi.fn() variables — use vi.mocked(import) in test body instead"

requirements-completed: ["WA-03"]

# Metrics
duration: 4min
completed: 2026-04-01
---

# Phase 2 Plan 2: Meta Send Helper + Signature Verification Summary

**HMAC-SHA256 webhook signature verification and typed Meta Graph API sendTextMessage helper replacing the inline sendStubReply stub**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-01T07:12:52Z
- **Completed:** 2026-04-01T07:17:00Z
- **Tasks:** 2 completed
- **Files modified:** 7

## Accomplishments
- `sendTextMessage` calls Meta Graph API with correct URL/headers/body shape, returns outbound wamid, throws typed error on non-200
- `verifyWebhookSignature` verifies X-Hub-Signature-256 using Node.js `crypto.createHmac`, returns false for all invalid inputs
- POST `/api/webhook` now reads raw body via `request.text()` before parsing, gates on signature validity (bypassed by `SKIP_WEBHOOK_SIGNATURE=true`)
- Removed `sendStubReply` inline function from route.ts — replaced with `sendTextMessage` import
- 46 tests total passing (9 new: 4 send, 5 verify; plus 1 new 401 test in webhook.test.ts)

## Task Commits

Each task was committed atomically:

1. **Task 1: sendTextMessage helper + verifyWebhookSignature (TDD RED→GREEN)** - `f46ed3e` (feat)
2. **Task 2: Wire send helper + signature check into route.ts + env example** - `3858492` (feat)

**Plan metadata:** (see final commit)

## Files Created/Modified
- `salon-bot/src/lib/whatsapp/send.ts` - Meta Graph API client: sendTextMessage + sendTemplateMessage stub
- `salon-bot/src/lib/whatsapp/verify.ts` - HMAC-SHA256 X-Hub-Signature-256 verifier
- `salon-bot/tests/send.test.ts` - 4 tests for sendTextMessage (mocked fetch) and sendTemplateMessage stub
- `salon-bot/tests/verify.test.ts` - 5 tests for verifyWebhookSignature (valid, tampered body, wrong secret, empty sig, empty secret)
- `salon-bot/src/app/api/webhook/route.ts` - Updated to use request.text(), verifyWebhookSignature, sendTextMessage
- `salon-bot/tests/webhook.test.ts` - Added sendTextMessage mock, SKIP_WEBHOOK_SIGNATURE, new 401 test
- `salon-bot/.env.local.example` - Added WHATSAPP_API_TOKEN, WHATSAPP_API_VERSION, WHATSAPP_APP_SECRET, WEBHOOK_VERIFY_TOKEN, SKIP_WEBHOOK_SIGNATURE

## Decisions Made
- `sendTextMessage` throws on non-200 (not silent skip like the old stub) — callers own error handling
- `SKIP_WEBHOOK_SIGNATURE=true` pattern chosen for dev bypass over a test-only mock to keep route.ts behavior realistic
- `sendTemplateMessage` exported as stub that throws immediately — keeps Phase 5 contract visible now
- Mocked `sendTextMessage` in `webhook.test.ts` (instead of mocking fetch) to keep route tests focused on routing/DB logic

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vitest vi.mock hoisting error in webhook.test.ts**
- **Found during:** Task 2 (webhook.test.ts update)
- **Issue:** `const mockSendTextMessage = vi.fn()` referenced inside `vi.mock` factory caused `ReferenceError: Cannot access 'mockSendTextMessage' before initialization` — vitest hoists `vi.mock` calls to top of file, before variable declarations
- **Fix:** Moved `vi.fn()` inline into the factory; accessed the mock in tests via `vi.mocked(sendTextMessage)` after importing the mocked module
- **Files modified:** salon-bot/tests/webhook.test.ts
- **Verification:** All 46 tests pass after fix
- **Committed in:** 3858492 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for vitest ESM mock hoisting constraint. No scope creep.

## Issues Encountered
None — all planned work completed without unexpected blockers.

## User Setup Required
None — no external service configuration required beyond what is already documented in `.env.local.example`.

## Next Phase Readiness
- Phase 2 complete: webhook receives messages, deduplicates via wamid, resolves tenant, verifies signature, sends text reply via Meta Graph API
- Phase 3 (FSM) can import `sendTextMessage` from `@/lib/whatsapp/send` with confidence — stable tested contract
- Phase 5 (templates) has the stub `sendTemplateMessage` export ready to implement

---
*Phase: 02-webhook-pipeline*
*Completed: 2026-04-01*

## Self-Check: PASSED

- FOUND: salon-bot/src/lib/whatsapp/send.ts
- FOUND: salon-bot/src/lib/whatsapp/verify.ts
- FOUND: salon-bot/tests/send.test.ts
- FOUND: salon-bot/tests/verify.test.ts
- FOUND: salon-bot/.env.local.example
- FOUND commit f46ed3e (feat Task 1)
- FOUND commit 3858492 (feat Task 2)
- 46 tests passing, 0 TypeScript errors
