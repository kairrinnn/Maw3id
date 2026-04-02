---
phase: 2
name: Webhook Pipeline
status: planning
---

# Phase 2 Validation Context

## Phase Goal
WhatsApp messages reach the correct tenant's bot and the bot replies via text, with no LLM involved.

## Requirements In Scope
- **INFRA-05**: Webhook router identifies tenant from `phone_number_id` Meta, routes to correct bot config
- **WA-01**: GET `/api/webhook` returns `hub.challenge` if `hub.verify_token` matches
- **WA-02**: POST `/api/webhook` processes incoming messages with deduplication via `wamid`
- **WA-03**: Bot sends text replies and templates via Meta Cloud API

## Success Criteria
1. Meta can verify the webhook endpoint via GET challenge-response without manual intervention
2. An incoming WhatsApp message is routed to the correct tenant by `phone_number_id` within the same request
3. Sending the same WhatsApp message ID (`wamid`) twice does not create a duplicate or send a duplicate reply
4. The bot sends a text reply back to the client via Meta Cloud API

## Key Constraints
- No LLM in this phase — rule-based echo/stub reply is sufficient
- Webhook handler must return 200 immediately (Meta expects <5s response) — heavy work must be async
- Deduplication must use DB unique constraint on `wamid`, not in-memory
- `api/webhook` route is excluded from Next.js middleware auth check (already configured in Phase 1)
- Stack: Next.js 15 App Router, TypeScript, Supabase service client for DB writes (bypass RLS)
- Meta webhook verification uses `WEBHOOK_VERIFY_TOKEN` env variable
- Meta API calls use `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` env variables

## Phase 1 Context (Already Built)
- `phone_numbers` table: `id`, `tenant_id`, `number`, `wa_phone_number_id`, `waba_id`, `active`
- `conversations` table: `id`, `tenant_id`, `phone_number_id`, `client_phone`, `state` (JSONB), `last_message_at`
- `bot_configs` table: `tenant_id`, `active`, `system_prompt`, etc.
- Supabase clients: `src/lib/supabase/server.ts` (auth client), service client needed for webhook (no user JWT)
- Middleware excludes `/api/webhook` from auth

## Deliverables
- `GET /api/webhook` — Meta challenge verification
- `POST /api/webhook` — Message handler: parse, deduplicate, route to tenant, stub reply
- `src/lib/whatsapp/send.ts` — Meta Cloud API send helper
- `src/lib/whatsapp/types.ts` — TypeScript types for Meta webhook payload
- Supabase service client helper (if not already in Phase 1)
- Env variables: `WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`
- Tests: webhook verification, deduplication, tenant routing, send helper (vitest)
