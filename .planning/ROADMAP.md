# Roadmap: Salon Bot Maroc

## Overview

Eight phases that build the product in strict dependency order. The foundation (schema, auth, RLS) comes first because every subsequent component depends on it. The webhook pipeline with a rule-based FSM comes next, validating the core booking flow before any LLM tokens are spent. The LLM layer slots in on top of a working FSM so regressions are attributable. Booking conflicts and edge cases are hardened in Phase 4. Templates and reminders require Meta approval lead-time so they are submitted during onboarding, not reactively. The admin dashboard is built on real API contracts shaped by live bot testing. Onboarding glues all prior systems together. Billing and subscription enforcement close the loop, making the product a functioning SaaS.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Multi-tenant schema, RLS isolation, Supabase Auth, and per-tenant bot config (completed 2026-03-31)
- [x] **Phase 2: Webhook Pipeline** - Rule-based FSM webhook handler with tenant routing and Meta API send (completed 2026-04-01)
- [ ] **Phase 3: LLM Intent Engine** - Natural language extraction layer on top of working FSM
- [ ] **Phase 4: Booking Core** - Full booking CRUD with conflict prevention, modify, cancel, and notifications
- [ ] **Phase 5: Templates & Reminders** - Meta-approved template management and 24h reminder scheduler
- [ ] **Phase 6: Dashboard Admin** - Service/hours CRUD, bookings list, and revenue stats per salon
- [ ] **Phase 7: Onboarding Flow** - Guided setup, WhatsApp number connection, and test mode before go-live
- [ ] **Phase 8: Offres & Facturation** - Subscription records, bot deactivation on expiry, and Stripe billing

## Phase Details

### Phase 1: Foundation
**Goal**: The multi-tenant data layer exists, is secure by default, and salon owners can authenticate
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. A salon owner can create an account and log in to the dashboard with email and password
  2. All tenant-owned tables have RLS enabled with default DENY — a cross-tenant query returns zero rows
  3. Tenant A's bookings, services, and conversations are invisible to Tenant B even with a valid auth token
  4. A salon can have its own bot configuration stored (system prompt, services list, opening hours, active status)
**Plans:** 2/2 plans complete
Plans:
- [x] 01-01-PLAN.md — Bootstrap project, schema migrations, RLS policies, test infrastructure
- [ ] 01-02-PLAN.md — Auth flow (signup/login), middleware, dashboard shell, bot config scoping

### Phase 2: Webhook Pipeline
**Goal**: WhatsApp messages reach the correct tenant's bot and the bot replies via text, with no LLM involved
**Depends on**: Phase 1
**Requirements**: INFRA-05, WA-01, WA-02, WA-03
**Success Criteria** (what must be TRUE):
  1. Meta can verify the webhook endpoint via GET challenge-response without manual intervention
  2. An incoming WhatsApp message is routed to the correct tenant by phone_number_id within the same request
  3. Sending the same WhatsApp message ID twice does not create a duplicate booking or send a duplicate reply
  4. The bot sends a text reply back to the client via Meta Cloud API
**Plans:** 2/2 plans complete
Plans:
- [ ] 02-01-PLAN.md — Webhook route (GET + POST), tenant routing, deduplication, processed_messages migration
- [ ] 02-02-PLAN.md — sendTextMessage helper, HMAC-SHA256 signature verification, env var documentation

### Phase 3: LLM Intent Engine
**Goal**: The bot understands natural language inputs in French and approximate Darija, extracting structured booking intent without sending raw history to the model
**Depends on**: Phase 2
**Requirements**: BOT-01, BOT-02, BOT-03
**Success Criteria** (what must be TRUE):
  1. A client writing "coupe demain apres-midi" has their intent (service + date/time approximation) correctly extracted
  2. Simple intents (clear service + date) route to the cheap model; ambiguous or failed extractions escalate to the standard model
  3. A completely unrecognized input receives a graceful fallback reply that does not leave the client in silence
  4. Conversation state stored in DB contains only structured fields (step, service_id, date, time, status) — never raw message history
**Plans**: TBD

### Phase 4: Booking Core
**Goal**: Clients can book, modify, and cancel appointments end-to-end through WhatsApp with no double-bookings
**Depends on**: Phase 3
**Requirements**: BOOK-01, BOOK-02, BOOK-03, BOOK-04, BOOK-05, BOOK-06, BOOK-07
**Success Criteria** (what must be TRUE):
  1. A client can complete a booking (service + date + time) via WhatsApp and receive an immediate confirmation message
  2. A client can change the date or time of a confirmed appointment and receive an updated confirmation
  3. A client can cancel a confirmed appointment and the salon owner is notified
  4. Two clients attempting to book the same slot simultaneously results in only one confirmed booking — the other receives a conflict message
  5. A client typing "mes rdv" receives a list of their upcoming appointments
**Plans**: TBD

### Phase 5: Templates & Reminders
**Goal**: Clients receive automated WhatsApp reminders before appointments using Meta-approved templates
**Depends on**: Phase 4
**Requirements**: TPL-01, TPL-02
**Success Criteria** (what must be TRUE):
  1. The 3 standard templates (reminder, confirmation, cancellation) are stored per tenant and submittable to Meta from the dashboard
  2. A client with a confirmed appointment receives a WhatsApp reminder message 24 hours before their slot via an approved template
  3. A reminder is not sent twice for the same appointment even if the scheduler runs multiple times
**Plans**: TBD

### Phase 6: Dashboard Admin
**Goal**: Salon owners can manage their services, hours, and see booking stats without touching a database
**Depends on**: Phase 5
**Requirements**: DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):
  1. A salon owner can create, edit, and delete services (name, duration, price) from the dashboard
  2. A salon owner can define opening hours and mark specific days as closed
  3. The dashboard displays total bookings and estimated revenue for the current week and month
**Plans**: TBD

### Phase 7: Onboarding Flow
**Goal**: A new salon can go from account creation to a live bot on WhatsApp through a guided flow, including a test mode before go-live
**Depends on**: Phase 6
**Requirements**: ONB-01, ONB-02, ONB-03, WA-04
**Success Criteria** (what must be TRUE):
  1. A new salon owner completes a step-by-step setup (name, description, services, hours) before the bot is activated
  2. An admin can connect a WhatsApp number to the salon, choosing between a dedicated number or coexistence
  3. The bot can be activated in sandbox/test mode on a test number before going live on the production number
  4. The bot remains inactive until minimum configuration (at least one service and one open day) is confirmed
**Plans**: TBD

### Phase 8: Offres & Facturation
**Goal**: Each salon is on a subscription plan, the bot stops responding when the plan expires, and billing is handled automatically via Stripe
**Depends on**: Phase 7
**Requirements**: BIZ-01, BIZ-02, BIZ-03
**Success Criteria** (what must be TRUE):
  1. Each salon has a subscription record with a plan tier, start date, and status (trial/active/expired)
  2. When a salon's subscription expires, the bot stops processing incoming WhatsApp messages for that tenant
  3. A salon owner can subscribe, manage their plan, and access invoices via a Stripe customer portal without contacting support
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete   | 2026-03-31 |
| 2. Webhook Pipeline | 2/2 | Complete   | 2026-04-01 |
| 3. LLM Intent Engine | 0/? | Not started | - |
| 4. Booking Core | 0/? | Not started | - |
| 5. Templates & Reminders | 0/? | Not started | - |
| 6. Dashboard Admin | 0/? | Not started | - |
| 7. Onboarding Flow | 0/? | Not started | - |
| 8. Offres & Facturation | 0/? | Not started | - |
