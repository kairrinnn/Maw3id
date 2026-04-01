---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in-progress
stopped_at: Completed 02-01-PLAN.md — webhook handler, tenant routing, deduplication done. Phase 2 plan 1 complete.
last_updated: "2026-04-01T07:09:20Z"
last_activity: 2026-04-01 — Completed 02-01 (webhook GET+POST, processed_messages migration, WhatsApp types)
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Un client peut réserver un créneau au salon à n'importe quelle heure, et le salon ne rate plus aucun rendez-vous faute de réponse manuelle.
**Current focus:** Phase 2 — Webhook Pipeline

## Current Position

Phase: 2 of 8 (Webhook Pipeline) — IN PROGRESS
Plan: 1 of 2 in current phase (02-01 complete, 02-02 next)
Status: Phase 2 plan 1 complete, ready for Plan 02-02 (send helper + stub reply)
Last activity: 2026-04-01 — Completed 02-01 (webhook GET+POST, processed_messages migration, WhatsApp types)

Progress: [██░░░░░░░░] 25% (3 of ~16 plans complete across all phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 11.5 min
- Total execution time: 0.38 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | 23 min | 11.5 min |
| 02-webhook-pipeline | 1 | 3 min | 3 min |

**Recent Trend:**
- Last 5 plans: 01-01 (8 min), 01-02 (15 min), 02-01 (3 min)
- Trend: webhook plan was tight-scoped, fast execution

*Updated after each plan completion*

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

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3 flag: Benchmark Gemini Flash vs GPT-4o-mini on French/Darija input before committing to a provider
- Phase 5 flag: Validate Meta template submission API and approval timing in sandbox before building automation
- Phase 7 flag: Meta embedded signup / WABA onboarding API changes frequently — verify current docs before Phase 7

## Session Continuity

Last session: 2026-04-01T07:09:20Z
Stopped at: Completed 02-01-PLAN.md — webhook handler, tenant routing, deduplication done. Phase 2 plan 1 complete.
Resume file: None
