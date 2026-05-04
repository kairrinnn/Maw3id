---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Completed 05-01-PLAN.md — sendTemplateMessage implemented, submit route live, 115 tests passing
last_updated: "2026-05-04T18:10:00Z"
last_activity: 2026-05-04 — Completed 05-01 (sendTemplateMessage, /api/templates/submit, seed migration, 17 new tests)
progress:
  total_phases: 9
  completed_phases: 4
  total_plans: 12
  completed_plans: 7
  percent: 64
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Un client peut réserver un créneau au salon à n'importe quelle heure, et le salon ne rate plus aucun rendez-vous faute de réponse manuelle.
**Current focus:** Phase 5 — Templates & Reminders

## Current Position

Phase: 5 of 8 (Templates & Reminders) — IN PROGRESS
Plan: 1 of 2 in Phase 5 (05-01 complete, 05-02 pending)
Status: 05-01 complete — ready for 05-02 (reminder scheduler: pg_cron + /api/reminders/send)
Last activity: 2026-05-04 — Completed 05-01 (sendTemplateMessage, submit route, seed migration, 115 tests passing)

Progress: [██████░░░░] 64% (7 of ~11 plans complete across all phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 8.2 min
- Total execution time: ~49 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | 23 min | 11.5 min |
| 02-webhook-pipeline | 2 | 7 min | 3.5 min |
| 03-llm-intent | 2 | ~12 min | 6 min |
| 04-booking-core | 1 | ~7 min | 7 min |
| 04.5-llm-responses | 1 (of 2) | 7 min | 7 min |

**Recent Trend:**
- Last 5 plans: 03-01 (~6min), 03-02 (~6min), 04-01 (~7min), 04.5-01 (7min)
- Trend: consistent ~7min per plan on implementation phases

*Updated after each plan completion*
| Phase 04.5-llm-responses P02 | 12 | 2 tasks | 2 files |

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

### Pending Todos

- Execute 05-02: reminder scheduler — /api/reminders/send route + pg_cron migration

### Blockers/Concerns

- Phase 3 flag: Benchmark Gemini Flash vs GPT-4o-mini on French/Darija input before committing to a provider
- Phase 5 flag: Validate Meta template submission API and approval timing in sandbox before building automation
- Phase 7 flag: Meta embedded signup / WABA onboarding API changes frequently — verify current docs before Phase 7
- Pre-existing: llm-reply.test.ts "Gemini success" test failing (unrelated to 05-01, deferred)

## Session Continuity

Last session: 2026-05-04T18:10:00Z
Stopped at: Completed 05-01-PLAN.md — sendTemplateMessage implemented, submit route live, 115 tests passing
Resume file: None
