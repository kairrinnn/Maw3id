# Stack Research: Salon Bot Maroc

**Domain:** Multi-tenant WhatsApp bot SaaS for beauty salons
**Date:** 2026-03-31
**Confidence:** High (validated against official docs and market analysis)

---

## Recommended Stack

### Frontend / Dashboard

| Layer | Choice | Version | Rationale |
|-------|--------|---------|-----------|
| Framework | Next.js | 15.x | App Router, Server Components, API Routes — single repo for dashboard + webhook handler |
| Language | TypeScript | 5.x | Type safety for multi-tenant data structures, critical for state machine |
| UI | Tailwind CSS + shadcn/ui | latest | Rapid dashboard build, accessible components, no custom CSS overhead |
| State | Zustand or React Query | latest | Light client state; React Query for server state (bookings, salon config) |

### Backend / API

| Layer | Choice | Version | Rationale |
|-------|--------|---------|-----------|
| Runtime | Next.js API Routes (Edge-compatible) | 15.x | Unified repo, no separate server; Edge runtime for webhook low-latency |
| Validation | Zod | 3.x | Runtime type validation for webhook payloads and API inputs |
| Job Queue | Upstash QStash or Inngest | latest | Async reminders scheduler, retry logic — serverless-compatible |
| Cron / Reminders | Upstash QStash | latest | Send WhatsApp reminders N hours before appointment |

### Database

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Primary DB | Supabase (Postgres) | RLS for multi-tenant isolation, Auth included, Realtime for dashboard, free tier to start |
| Auth | Supabase Auth | Admin dashboard login, salon owner login — no additional auth library |
| File Storage | Supabase Storage | Logo salon, documents onboarding |

### WhatsApp Integration

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Channel | Meta WhatsApp Business Cloud API | Direct — no Twilio/WATI margin. Free service messages, low cost utility messages |
| Webhook | Next.js API Route `/api/webhook/whatsapp` | Handles GET (verification) + POST (incoming messages) |
| Templates | Meta Business Manager API | Programmatic template submission at onboarding |

### LLM / AI

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Routing layer | Custom classifier | Rule-based first, LLM fallback — keeps costs low |
| Cheap model (intent) | Google Gemini 2.0 Flash / OpenAI gpt-4o-mini | Simple extraction: service name, date, time, name |
| Better model (ambiguous) | Claude claude-haiku-4-5 or gpt-4o | Complex cases, multi-step clarification, fallback |
| SDK | Vercel AI SDK | Unified interface across providers, streaming support |

**DO NOT:** Send raw conversation history to LLM. Only send: last user message + structured state summary + relevant salon config.

### Infrastructure

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Hosting | Vercel | Zero-config Next.js deploy, edge functions, automatic HTTPS |
| Secrets | Vercel env vars + Supabase Vault | Per-tenant WhatsApp tokens in Supabase Vault, not in .env |
| Monitoring | Vercel Analytics + Sentry | Error tracking per tenant, webhook failure alerts |

---

## What NOT to Use

| Avoid | Why |
|-------|-----|
| Twilio / WATI / 360dialog | Adds margin per message, less control on Meta API features |
| Prisma ORM | Conflicts with Supabase RLS patterns; use Supabase client directly |
| Redis for session state | Supabase Postgres is sufficient for conversation state at this scale |
| LangChain | Over-engineered for routing + extraction; direct SDK calls are simpler |
| Full raw LLM history | Cost explosion — send structured state only |
| Separate Node.js server | Next.js API Routes + Vercel handles webhook + dashboard in one deploy |

---

## Confidence Levels

- **Next.js 15 + Supabase + Vercel** : Very High — battle-tested for SaaS
- **Meta Cloud API direct** : High — official path, active docs
- **Vercel AI SDK for LLM routing** : High — simplifies multi-provider
- **Upstash QStash for reminders** : Medium-High — serverless cron, some operational complexity
- **LLM model choices** : Medium — prices and models evolve fast; verify at build time

---

*Written: 2026-03-31*
