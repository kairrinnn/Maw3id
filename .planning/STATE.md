---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Completed 06-00 (Wave 0 prerequisites)
last_updated: "2026-05-05T21:11:27Z"
last_activity: 2026-05-05 — Completed 06-00 (UNIQUE migration + 3 test scaffolds, 17 new placeholder tests)
progress:
  total_phases: 9
  completed_phases: 4
  total_plans: 14
  completed_plans: 8
  percent: 73
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Un client peut réserver un créneau au salon à n'importe quelle heure, et le salon ne rate plus aucun rendez-vous faute de réponse manuelle.
**Current focus:** Phase 6 — Dashboard Admin

## Current Position

Phase: 6 of 8 (Dashboard Admin) — IN PROGRESS
Plan: 1 of 4 in Phase 6 — Plan 06-00 complete
Status: Phase 6 in progress — Wave 0 complete, ready for Wave 1 (06-01, 06-02, 06-03)
Last activity: 2026-05-05 — Completed 06-00 (UNIQUE migration + 3 test scaffolds, 17 new placeholder tests)

Progress: [████████░░] 75% (9 of ~14 plans complete across all phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 8.4 min
- Total execution time: ~67 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | 23 min | 11.5 min |
| 02-webhook-pipeline | 2 | 7 min | 3.5 min |
| 03-llm-intent | 2 | ~12 min | 6 min |
| 04-booking-core | 1 | ~7 min | 7 min |
| 04.5-llm-responses | 1 (of 2) | 7 min | 7 min |
| 05-templates-reminders | 2 | ~19 min | 9.5 min |

**Recent Trend:**
- Last 5 plans: 03-02 (~6min), 04-01 (~7min), 04.5-01 (7min), 05-01 (4min), 05-02 (~15min)
- Trend: consistent ~7-15min per plan on implementation phases

*Updated after each plan completion*
| Phase 05-templates-reminders P02 | 15 | 3 tasks | 4 files |
| Phase 06-dashboard-admin P00 | 2 | 3 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Architecture: FSM with structured state (not raw LLM history) — enforced from Phase 1 schema design
- Infra: Per-tenant WABA (not shared) — isolates suspension blast radius
- Stack: Meta Cloud API direct (no Twilio/WATI) — avoids reseller margins
- Timing: Templates submitted at onboarding Day 1 — Meta approval (1-7 days) cannot be reactive
- [01-01] RLS policies use SELECT-wrapped jwt_tenant_id() for per-statement Postgres caching (not per-row)
- [01-01] Service role client uses SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix) — never browser-exposed
- [01-01] custom_access_token_hook declared STABLE — reads tenant_users once at login, not on every query
- [Phase 01-02]: getClaims() used over getSession() — getSession() does not validate JWT signature server-side (security vulnerability)
- [Phase 01-02]: Signup action uses service client for tenant provisioning — new user JWT has no tenant_id yet, RLS would deny inserts without service role
- [Phase 01-02]: bot_config created with active=false at signup — prevents bot responding before owner completes setup
- [02-01]: upsert(ignoreDuplicates:true, count:'exact') for dedup — .insert().onConflict().ignore() not valid in Supabase JS v2
- [02-01]: Non-text messages get French polite reply rather than silent drop — client must know bot is text-only
- [02-01]: processMessage() extracted as separate function — Plan 02-02 replaces sendStubReply without touching route logic
- [02-01]: Meta must always receive 200 — unknown phone_number_id and inactive bot both return 200 silently to prevent retries
- [02-02]: sendTextMessage throws on non-200 (not silent skip) — caller decides whether to swallow errors
- [02-02]: SKIP_WEBHOOK_SIGNATURE env var bypasses signature check in dev/test; must never be set in prod
- [02-02]: webhook.test.ts mocks sendTextMessage entirely (not fetch) — route tests stay focused on routing/DB logic
- [04.5-01]: reply.ts uses plain text Gemini (no JSON schema) — reply generation is freeform prose, not structured data
- [04.5-01]: callGeminiForReply is NOT exported — tests mock @google/genai at module level
- [04.5-01]: FALLBACK_REPLIES keyed by string (not enum) — allows 'conflict' and 'default' as extra keys beyond FSM_STEPS
- [04.5-01]: vi.fn() constructor mock uses regular function (not arrow) for new-able classes
- [Phase 04.5-02]: tenants.name fetched as separate query (not JOIN) — Supabase JS client idiomatic with .from() chaining
- [Phase 04.5-02]: All client-facing messages now go through generateReply() — single choke point for LLM reply quality
- [05-01]: phoneNumberId required in SendTemplatePayload (not global env) — multi-tenant support, fetched from phone_numbers.phone_number_id
- [05-01]: waba_id used for template submission to /{waba_id}/message_templates (not phone_number_id — different Meta IDs)
- [05-01]: category locked to UTILITY for all 3 standard templates — appointment reminders are not MARKETING
- [05-01]: example.body_text is nested array [[val1, val2]] — required by Meta for templates with {{n}} variables
- [05-02]: Optimistic-lock UPDATE with count:'exact' and .eq('reminder_sent', false) guard — same idempotency pattern as Phase 2 processed_messages
- [05-02]: Africa/Casablanca timezone hardcoded — Morocco-only product, no multi-timezone requirement
- [05-02]: pg_cron secrets via current_setting('app.cron_secret') — no literal secrets in migration SQL (git-safe)
- [05-02]: Test null-coalescing bug: null ?? fixture evaluates to fixture — use 'in' operator to distinguish explicit null from missing key
- [06-00]: Idempotent UNIQUE migration via DO/IF NOT EXISTS block — Postgres lacks ADD CONSTRAINT IF NOT EXISTS for UNIQUE; DO block is the correct idiom
- [06-00]: No @/ imports in Wave 0 test stubs — module-resolution fails before action files exist; stubs stay pure vitest until 06-01/02/03

### Pending Todos

- Execute Phase 6 Wave 1: plans 06-01, 06-02, 06-03 (services CRUD, schedules upsert, stats aggregation)
- Phase 7 onboarding setup: ALTER DATABASE postgres SET app.cron_secret and app.app_url before pg_cron migration apply
- Phase 7 onboarding setup: ALTER DATABASE postgres SET app.cron_secret and app.app_url before pg_cron migration apply

### Blockers/Concerns

- Phase 3 flag: Benchmark Gemini Flash vs GPT-4o-mini on French/Darija input before committing to a provider
- Phase 5 flag: Validate Meta template submission API and approval timing in sandbox before building automation
- Phase 7 flag: Meta embedded signup / WABA onboarding API changes frequently — verify current docs before Phase 7
- Pre-existing: llm-reply.test.ts "Gemini success" test failing (unrelated to 05-01, deferred)

## Session Continuity

Last session: 2026-05-05T21:11:27Z
Stopped at: Completed 06-00-PLAN.md (Wave 0 prerequisites)
Resume file: .planning/phases/06-dashboard-admin/06-01-PLAN.md
