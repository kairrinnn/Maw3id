---
phase: 01-foundation
plan: 02
subsystem: auth
tags: [supabase, auth, nextjs, middleware, jwt, multi-tenant, rls, server-actions]

# Dependency graph
requires:
  - phase: 01-01
    provides: "9-table schema, RLS policies, jwt_tenant_id(), custom_access_token_hook SQL, 3 Supabase client utilities (server/client/service)"
provides:
  - "Next.js middleware with getClaims() protecting /dashboard, excluding /api/webhook"
  - "Login page + server action (signInWithPassword -> /dashboard)"
  - "Signup page + server action creating auth user + tenant + tenant_user + bot_config atomically"
  - "Dashboard layout with signout button and getClaims() guard"
  - "Dashboard page showing tenant name and bot active/inactive status from DB"
  - "POST /api/auth/signout route clearing session and redirecting to /login"
  - "INFRA-03 auth test stubs (5 tests)"
  - "INFRA-04 bot config test stubs (4 tests)"
affects:
  - "02-foundation and beyond (all features use authenticated dashboard shell)"
  - "webhook handler (excluded from middleware matcher)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getClaims() over getSession() — validates JWT signature server-side, security requirement"
    - "Service client in signup action — new user has no tenant_id in JWT yet, RLS would deny inserts"
    - "Route groups (auth) and (dashboard) — no URL segments, pure layout grouping"
    - "Server actions return { error } on failure, trigger redirect on success — no try/catch around redirect"

key-files:
  created:
    - "salon-bot/src/lib/supabase/middleware.ts"
    - "salon-bot/src/middleware.ts"
    - "salon-bot/src/app/(auth)/login/page.tsx"
    - "salon-bot/src/app/(auth)/login/actions.ts"
    - "salon-bot/src/app/(auth)/signup/page.tsx"
    - "salon-bot/src/app/(auth)/signup/actions.ts"
    - "salon-bot/src/app/(dashboard)/layout.tsx"
    - "salon-bot/src/app/(dashboard)/page.tsx"
    - "salon-bot/src/app/api/auth/signout/route.ts"
    - "salon-bot/tests/auth.test.ts"
    - "salon-bot/tests/bot-config.test.ts"
  modified: []

key-decisions:
  - "getClaims() used exclusively over getSession() — getSession() does not validate JWT signature, creating server-side auth bypass vulnerability"
  - "Signup action uses service client (SUPABASE_SERVICE_ROLE_KEY) for tenant/tenant_user/bot_config creation — new user JWT contains no tenant_id, so RLS would deny all inserts without service role bypass"
  - "Slug generated with Date.now() suffix — prevents collision on identically-named salons without requiring uniqueness check roundtrip"
  - "Bot config created with active=false at signup — prevents bot from responding before owner completes setup"

patterns-established:
  - "Atomic provisioning pattern: signup creates auth user then immediately provisions tenant + tenant_user + bot_config via service client in one server action"
  - "JWT claims access pattern: cast getClaims() result as Record<string, unknown> to safely read custom claims (tenant_id)"

requirements-completed: [INFRA-03, INFRA-04]

# Metrics
duration: 15min
completed: 2026-03-31
---

# Phase 1 Plan 2: Auth Flow + Dashboard Shell Summary

**Supabase Auth flow with atomic tenant provisioning on signup, getClaims()-based middleware protection, and dashboard shell showing per-tenant bot status**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-31T23:25:00Z
- **Completed:** 2026-03-31T23:40:00Z
- **Tasks:** 3 (Task 1: middleware, Task 2: checkpoint — hook registration, Task 3: auth pages + dashboard)
- **Files modified:** 11

## Accomplishments

- Middleware using getClaims() (not getSession()) protects all /dashboard routes and redirects to /login — webhook route excluded from matcher
- Signup server action atomically creates auth user + tenant + tenant_user + bot_config in one request using service client to bypass RLS for new user
- Login/signup pages as client components with server actions, error state handling, loading state
- Dashboard layout with signout form posting to /api/auth/signout and session guard via getClaims()
- Dashboard page reads tenant name and bot_config.active from Supabase with RLS enforced
- 28 tests passing (schema + rls + auth + bot-config), Next.js build clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Create middleware for session refresh and route protection** - `fda807d` (feat)
2. **Task 2: Register custom access token hook** - checkpoint (manual — user completed in Dashboard)
3. **Task 3: Signup/login pages, dashboard shell, signout route, tests** - `5899e8d` (feat)

**Plan metadata:** (committed with SUMMARY.md)

## Files Created/Modified

- `salon-bot/src/lib/supabase/middleware.ts` - updateSession() with getClaims(), route protection logic
- `salon-bot/src/middleware.ts` - Next.js middleware entry, excludes api/webhook from matcher
- `salon-bot/src/app/(auth)/login/page.tsx` - Client component login form with error/loading state
- `salon-bot/src/app/(auth)/login/actions.ts` - signInWithPassword server action
- `salon-bot/src/app/(auth)/signup/page.tsx` - Client component signup form (salon_name + email + password)
- `salon-bot/src/app/(auth)/signup/actions.ts` - Atomic signup: auth user + tenant + tenant_user + bot_config
- `salon-bot/src/app/(dashboard)/layout.tsx` - Authenticated layout with nav, signout button, getClaims() guard
- `salon-bot/src/app/(dashboard)/page.tsx` - Dashboard showing tenant name and bot status
- `salon-bot/src/app/api/auth/signout/route.ts` - POST handler: signOut() + redirect to /login
- `salon-bot/tests/auth.test.ts` - INFRA-03 test stubs (5 tests)
- `salon-bot/tests/bot-config.test.ts` - INFRA-04 test stubs (4 tests)

## Decisions Made

- getClaims() used exclusively over getSession() because getSession() reconstructs the session from the stored token without server-side JWT signature validation — a security vulnerability for any server-rendered auth check
- Signup action uses service client for all three insert operations because the new user's JWT has not yet been updated with tenant_id (the custom_access_token_hook only fires at next login) — using the anon client would cause RLS to deny all inserts
- Slug suffixed with `Date.now()` to prevent slug uniqueness collisions without requiring a database lookup before insert
- bot_config created with `active: false` at signup — the bot must not start responding to WhatsApp messages before the owner has configured it

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all commands executed successfully on first attempt. Build clean, 28 tests green.

## User Setup Required

The custom_access_token_hook must be registered in Supabase Dashboard before login will inject tenant_id into JWT claims:

1. Open Supabase Dashboard > Authentication > Hooks
2. Find "Custom Access Token" hook
3. Select schema: `public`, function: `custom_access_token_hook`
4. Save — verify hook appears as "Enabled"

This was completed by the user as Task 2 (checkpoint:human-action) before Task 3 execution.

## Next Phase Readiness

- Full auth flow complete: signup, login, middleware protection, signout
- Dashboard shell ready for feature pages (bot config, services, schedules)
- All 4 test files passing (28 tests total)
- Next: Phase 2 — WhatsApp webhook handler and conversation state machine

## Self-Check: PASSED

All 11 required files exist on disk. Both task commits (fda807d, 5899e8d) present in git history.

---
*Phase: 01-foundation*
*Completed: 2026-03-31*
