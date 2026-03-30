# Project Research Summary

**Project:** Salon Bot Maroc
**Domain:** Multi-tenant WhatsApp booking bot SaaS — beauty salon market (Morocco)
**Researched:** 2026-03-31
**Confidence:** HIGH (stack and architecture); MEDIUM (LLM routing specifics, Meta API edge cases)

## Executive Summary

Salon Bot Maroc is a multi-tenant SaaS product that replaces the manual WhatsApp booking workflow already used by Moroccan beauty salons. Experts build this class of product with a monorepo Next.js 15 app (webhook handler + dashboard in one deploy on Vercel), a Supabase Postgres database with Row-Level Security for tenant isolation, and the Meta WhatsApp Cloud API accessed directly — no third-party resellers. The conversation bot is implemented as a deterministic finite state machine (FSM) with structured state persistence, not a raw LLM conversation loop. LLM calls serve only for natural language extraction, routed to a cheap model (Gemini Flash / GPT-4o-mini) for simple intents and a capable model for ambiguous ones.

The recommended approach is to build the bot pipeline first (webhook → FSM → booking DB) end-to-end before adding LLM or the admin dashboard. This lets the core value — 24/7 automated booking — be validated cheaply and in isolation. Template management and reminders are handled as a distinct phase because they depend on Meta approval timelines (1-7 days) and must be submitted at tenant onboarding, not reactively. The dashboard comes last; it is high-value for retention but not required for the bot to function.

The primary risks are: (1) LLM cost explosion if structured state is abandoned in favour of raw history — the fix is enforced at architecture level with the FSM pattern; (2) Multi-tenant data leakage if Supabase RLS is configured incorrectly — mitigate by enabling default-deny RLS from day 1 and testing cross-tenant isolation before launching; (3) WhatsApp Business Account suspension from a shared WABA serving all tenants — mitigate by giving each salon its own WABA, isolating blast radius.

---

## Key Findings

### Recommended Stack

The entire product runs in a single Next.js 15 monorepo deployed to Vercel. The webhook handler uses Edge Runtime to eliminate cold-start delays. Supabase provides Postgres (with RLS), Auth (magic link for salon owners), and Storage (logos, future docs). The Meta WhatsApp Cloud API is used directly — no Twilio, WATI, or 360dialog margin. Background reminder scheduling uses Upstash QStash (serverless cron) or Vercel Cron + pg_cron on Supabase. LLM orchestration is handled via the Vercel AI SDK wrapping two provider tiers.

**Core technologies:**
- Next.js 15 (App Router): dashboard frontend + API routes + webhook handler — single-repo deploy
- TypeScript 5.x: type-safe FSM state objects and webhook payload parsing
- Supabase (Postgres + Auth + Storage): multi-tenant RLS isolation, free-tier entry, realtime dashboard
- Meta WhatsApp Cloud API: direct integration, no reseller margin, template management
- Vercel AI SDK: unified LLM interface across Gemini Flash / GPT-4o-mini (cheap) and GPT-4o / Gemini Pro (standard)
- Upstash QStash: serverless async reminder scheduling with retry logic
- Zod 3.x: runtime validation of webhook payloads and API inputs
- Tailwind CSS + shadcn/ui: rapid dashboard build with accessible components

**What not to use:** Prisma (conflicts with Supabase RLS patterns), Redis for session state (Postgres sufficient at this scale), LangChain (over-engineered for routing + extraction), raw LLM history (cost explosion), separate Node.js server (Next.js API Routes handle it all).

### Expected Features

The Morocco market context shapes priorities directly: salons already manage bookings on WhatsApp, so the bot replaces an existing workflow rather than introducing a new habit. Darija is spoken but French is written — the bot must respond in French and understand informal Darija input. The key selling point is late-cancellation reduction via reminder templates.

**Must have (table stakes):**
- Booking flow via WhatsApp (book, modify, cancel) — salons won't pay without this
- 24/7 availability — replaces the owner's manual phone monitoring
- Automatic 24h reminder (WhatsApp approved template) — highest-value pain point
- Service + hours configuration in admin dashboard — bot cannot function without it
- Day-view appointments dashboard — minimum viable salon management UI
- Graceful fallback for unknown inputs — bot must not leave clients in silence

**Should have (differentiators):**
- LLM routing for imprecise date/time inputs ("demain apres-midi" → slot proposals)
- Multi-service booking in one conversation
- Client history across conversations (remembered name)
- Real-time booking list + no-show tracking in dashboard
- Revenue stats per period

**Defer to v2+:**
- Online payment integration — Moroccan gateway complexity, not core value
- Multi-staff team calendar — V1 targets solo or small salons
- Instagram / Facebook booking channels
- Full Arabic (Fusha) support — better to do French well than Arabic badly
- WhatsApp marketing campaign features — policy risk, not booking-bot value

### Architecture Approach

The system uses a single Meta Cloud API webhook URL for all tenants, with tenant resolution via an indexed `phone_number_id` lookup in the first database call. Conversation state is stored as a compact JSONB object in Postgres (not raw message history), enabling the FSM to operate without sending full chat history to the LLM. The five-layer pipeline — Webhook Ingestion → Tenant Router → State Machine → LLM Router → Action Executor — runs sequentially within a single Next.js API route, with Upstash QStash providing the async queue buffer between webhook ingestion (must return 200 in under 5 seconds) and the potentially slow LLM processing.

**Major components:**
1. Webhook Ingestion (`app/api/webhook/route.ts`) — HMAC-SHA256 verification, immediate 200, enqueue for processing
2. Tenant Router (`lib/webhook/tenantRouter.ts`) — maps `phone_number_id` to `tenant_id` via indexed DB lookup
3. Conversation State Machine (`lib/bot/stateMachine.ts`) — FSM with states: IDLE / COLLECTING_SERVICE / COLLECTING_DATETIME / CONFIRMING / BOOKED / MODIFYING / CANCELLING
4. LLM Routing Layer (`lib/llm/router.ts`) — classifies intent complexity, routes to cheap or standard model, extracts entities
5. Action Executor (`lib/bot/actionExecutor.ts`) — DB writes (bookings, state), 24h window check, Meta API calls
6. Dashboard API Routes (`app/api/dashboard/`) — tenant-scoped REST, authenticated via Supabase Auth
7. Reminder Scheduler (`lib/scheduler/reminderJob.ts`) — cron query on upcoming bookings, sends approved templates

Multi-tenant isolation uses shared Postgres schema with RLS on all tables. Dashboard routes use the Supabase server client (user session + RLS). The webhook pipeline uses the service-role key (no user session) with explicit `tenant_id` filters on every query.

### Critical Pitfalls

1. **LLM cost explosion** — Do not send raw conversation history to the LLM. Enforce the FSM pattern: LLM receives only the current structured state object + one new user message. Use cheap model (GPT-4o-mini / Gemini Flash) for 90% of calls; escalate to standard model only for ambiguous inputs. Estimated saving: 60-80% of LLM token cost.

2. **Multi-tenant data leakage** — Enable RLS with default DENY on all tenant-owned tables from day 1. Write integration tests that verify tenant A cannot read tenant B's bookings before going live. Use service-role key only in the webhook pipeline, never on the client side.

3. **Duplicate message processing** — Meta retries failed webhooks. Without deduplication on the `wamid` (WhatsApp message ID), the bot sends double confirmations and creates double bookings. Store `wamid` with a unique constraint; use `INSERT ... ON CONFLICT DO NOTHING`.

4. **WhatsApp template rejection delays** — Submit the 3 standard templates (reminder, confirmation, cancellation) at tenant onboarding time, not when the first reminder is due. Keep template language non-promotional. Without approved templates, the 24h-window reminder feature is dead.

5. **WhatsApp Business Account suspension** — Give each salon its own WABA to isolate blast radius. A single shared WABA means one suspended salon takes all tenants offline. Enforce strict opt-in: bot only responds to clients who initiated contact.

6. **Booking race conditions** — Use Postgres row-level locking (`SELECT ... FOR UPDATE`) during slot availability checks, or enforce a unique constraint on `(tenant_id, appointment_at)`. Confirm booking only after the DB write succeeds.

7. **Missing salon config crashes** — Bot crashes with a 500 if it checks availability before the salon has configured services or hours. Require minimum config (at least one service + one working day) before activating the bot. Check a tenant `is_active` flag in the webhook handler before processing.

---

## Implications for Roadmap

Based on combined research, the build order follows strict dependency chains: the bot cannot work without schema, the LLM layer cannot work without the FSM, reminders cannot work without templates being pre-approved. The dashboard is deliberately last — it delivers retention value but the bot operates without it.

### Phase 1: Foundation — Schema, Auth, and Tenant Onboarding

**Rationale:** Every subsequent component requires the database schema, RLS policies, and tenant records to exist. Building this first prevents the most critical pitfall (data leakage) from ever appearing.
**Delivers:** Multi-tenant Postgres schema with RLS, Supabase Auth for salon owners, tenant creation flow, phone_number_id registration
**Addresses:** Salon configuration (services, hours) — must exist before bot can check availability
**Avoids:** Multi-tenant data leakage (Pitfall 4), Missing salon config crashes (Pitfall 10)
**Research flag:** Standard patterns — Supabase RLS is well-documented

### Phase 2: Webhook Pipeline — Bot Core (Rule-Based)

**Rationale:** The webhook must exist and be live before any testing is possible. Building it rule-based first (no LLM) allows end-to-end validation cheaply, isolates the FSM logic, and avoids conflating webhook bugs with LLM bugs.
**Delivers:** Working webhook endpoint (GET verification + POST ingestion), HMAC signature verification, tenant routing, FSM with rule-based transitions (IDLE → COLLECTING_SERVICE → COLLECTING_DATETIME → CONFIRMING → BOOKED), Meta API text reply
**Implements:** Webhook Ingestion, Tenant Router, Conversation State Machine, Action Executor (no-LLM path)
**Avoids:** Webhook verification failure (Pitfall 2), Duplicate message processing (Pitfall 3)
**Research flag:** Standard patterns for Next.js webhook; verify Meta webhook payload structure against official docs before implementation

### Phase 3: LLM Intent Engine

**Rationale:** Only added after the FSM works rule-based. Swapping the NLU layer in after a working pipeline means any regression is traceable to the LLM integration specifically.
**Delivers:** Cheap model intent classification and entity extraction (service name, date/time in natural language including Darija approximations), standard model fallback for ambiguous inputs, prompt templates with tenant config injection
**Uses:** Vercel AI SDK, Gemini Flash / GPT-4o-mini (cheap tier), GPT-4o / Gemini Pro (standard tier)
**Avoids:** LLM cost explosion (Pitfall 1) — structured state enforced from Phase 2, never raw history
**Research flag:** Needs validation — LLM model choices shift rapidly; benchmark cheap vs standard model on Darija + French mixed inputs before committing to a provider

### Phase 4: Booking Core — Availability and Conflict Handling

**Rationale:** Availability checking requires the schema (Phase 1) and the bot pipeline (Phase 2-3) to be in place. Race conditions must be handled at the DB layer — this is a discrete chunk of booking logic.
**Delivers:** Real-time slot availability check, booking creation with conflict prevention (Postgres row-level locking), modification flow (MODIFYING state), cancellation flow (CANCELLING state), client name memory across conversations
**Implements:** Full booking CRUD with unique constraint on `(tenant_id, appointment_at)`
**Avoids:** Booking race conditions (Pitfall 9)
**Research flag:** Standard Postgres locking patterns — no deeper research needed

### Phase 5: Templates and Reminders

**Rationale:** Template submission must happen during onboarding (not reactively), so this phase defines the onboarding-to-template flow and the reminder scheduler. Templates must be approved before the scheduler can fire.
**Delivers:** WhatsApp template management per tenant (reminder, confirmation, cancellation), 24h window detection + automatic template fallback in Action Executor, reminder cron job (Upstash QStash or Vercel Cron), onboarding template submission automation
**Avoids:** Template rejection delays (Pitfall 5), 24h window violation (Pitfall 6)
**Research flag:** Needs validation — Meta's template approval API behavior and timing; test template submission flow in sandbox before building onboarding automation

### Phase 6: Admin Dashboard

**Rationale:** Dashboard adds retention and self-service value but the bot functions without it. Building it last means the API contracts are shaped by real data from live bot testing.
**Delivers:** Day-view bookings list, upcoming appointments, service + hours CRUD, bot settings (greeting, prompt), usage stats and revenue per period, no-show tracking, client history view
**Uses:** Next.js App Router dashboard pages (`app/(dashboard)/[tenantSlug]/`), shadcn/ui components, Supabase Realtime for live booking updates
**Research flag:** Standard SaaS dashboard patterns — well-established, no research needed

### Phase 7: Onboarding Flow

**Rationale:** Onboarding is the final glue: it connects a new salon to all the systems built in Phases 1-6. It is last because it references every prior component.
**Delivers:** Step-by-step guided setup (WhatsApp number connection, services, hours, template submission), test mode before go-live, bot activation gate (requires minimum config), phone number migration guidance
**Avoids:** Phone number migration friction (Pitfall 7), WABA suspension (Pitfall 8)
**Research flag:** Needs validation — Meta WABA onboarding API flow (embedded signup vs manual) changes frequently; verify current embedded signup API before implementation

### Phase Ordering Rationale

- Schema before everything: RLS bugs introduced late are catastrophically hard to fix; building it first means the security model is correct by default
- Rule-based bot before LLM: isolates debugging, avoids paying for LLM tokens during development, validates the FSM design against real webhook payloads
- LLM as an extraction layer, not a replacement for the FSM: this is the single most important architectural decision; it prevents Pitfall 1 and keeps the system deterministic
- Templates before reminders: Meta approval latency (1-7 days) means templates cannot be submitted just-in-time; the reminder feature has a hard dependency on template approval
- Dashboard last: avoids over-engineering admin UI for features that may change based on real bot behavior

### Research Flags

**Needs deeper research during planning:**
- Phase 3 (LLM Intent Engine): benchmark Gemini Flash vs GPT-4o-mini on French/Darija mixed input before committing; model pricing changes rapidly
- Phase 5 (Templates and Reminders): validate Meta template submission API behavior and approval timing in a sandbox environment
- Phase 7 (Onboarding): Meta's embedded signup / WABA onboarding API changes frequently; verify current state against official Cloud API docs before implementing onboarding automation

**Standard patterns (skip research-phase):**
- Phase 1 (Foundation): Supabase RLS + Auth is well-documented with official guides
- Phase 2 (Webhook Pipeline): Next.js route handler + HMAC verification is a documented pattern
- Phase 4 (Booking Core): Postgres locking and unique constraints are standard
- Phase 6 (Dashboard): standard SaaS admin UI, established patterns with shadcn/ui

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Next.js 15 + Supabase + Vercel is battle-tested for SaaS; Meta Cloud API is official path with active docs |
| Features | HIGH | Morocco market specifics well-understood; feature set derived from clear user pain points |
| Architecture | HIGH (core); MEDIUM (LLM routing) | FSM + RLS + single webhook are definitively the right patterns; LLM routing complexity estimates may shift |
| Pitfalls | HIGH | Critical pitfalls (LLM cost, RLS leakage, duplicate processing) are well-documented failure modes |

**Overall confidence:** HIGH

### Gaps to Address

- **LLM model selection**: Gemini Flash and GPT-4o-mini pricing and quality evolve fast. Benchmark both on French/Darija booking inputs before Phase 3 begins. Have a fallback if one provider degrades.
- **Meta WABA onboarding API**: The embedded signup flow for connecting a new WhatsApp Business number is the least-documented part of the stack. Validate the current API against official Meta docs before building Phase 7 onboarding automation.
- **Vercel serverless timeout risk**: LLM calls can exceed Vercel's 10s hobby-tier timeout. Decision point: use Upstash QStash async queue from Phase 2, or accept synchronous processing until scale demands it. Recommended: add QStash in Phase 2 to avoid rework.
- **Per-tenant WABA vs shared WABA**: Research suggests per-tenant WABA is safer (isolates suspension risk) but adds onboarding friction. This trade-off needs a product decision before Phase 7.

---

## Sources

### Primary (HIGH confidence)
- Next.js 15 Route Handlers — https://nextjs.org/docs/app/api-reference/file-conventions/route (official, fetched 2026-03-30)
- Supabase RLS performance recommendations — https://supabase.com/docs/guides/database/postgres/row-level-security (official, fetched 2026-03-30)
- Supabase Auth JWT / app_metadata patterns — https://supabase.com/docs/guides/auth/row-level-security (official, fetched 2026-03-30)
- Meta WhatsApp Cloud API — 24-hour customer service window constraint (HIGH confidence, platform constraint)

### Secondary (MEDIUM confidence)
- Meta WhatsApp Cloud API webhook structure — `phone_number_id` in `metadata` object; verify against https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
- Upstash QStash serverless cron — operational complexity at 50+ tenants requires validation
- LLM routing tiered cost estimates (60-80% savings) — derived from token cost modeling, not empirically validated for this project

### Tertiary (LOW confidence — needs validation)
- Meta WABA embedded signup onboarding API — frequently changing, verify current state before Phase 7 implementation
- LLM model quality on French/Darija mixed inputs — no benchmark data available; must be tested empirically in Phase 3

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes*
