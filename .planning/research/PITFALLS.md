# Pitfalls Research: Salon Bot Maroc

**Domain:** Multi-tenant WhatsApp bot SaaS for beauty salons
**Date:** 2026-03-31

---

## Pitfall 1: LLM Cost Explosion

**Risk level:** Critical
**Phase:** Phase 3 (LLM Intent Engine)

**What goes wrong:**
Sending full conversation history to the LLM for every message. A 10-turn conversation with 500 tokens/message = 5000 tokens per call. At 500 conversations/day across 20 salons = 50M tokens/month = hundreds of dollars.

**Warning signs:**
- No state machine implemented — LLM is the state
- `messages` array grows unbounded in DB
- Same context re-sent on every webhook call

**Prevention:**
- Store structured state in DB: `{ step, service, date, time, client_name, phone, status }`
- Send to LLM: last message + state summary + relevant salon config only
- Use cheap model (Gemini Flash / gpt-4o-mini) for 90% of calls
- Only escalate to better model for ambiguous/failed extractions
- Truncate after each confirmed booking step

---

## Pitfall 2: Meta Webhook Verification Failure at Deploy

**Risk level:** High
**Phase:** Phase 2 (WhatsApp Webhook)

**What goes wrong:**
Meta calls your webhook with a GET request to verify it. If your endpoint isn't live or returns wrong token, Meta rejects it. Many devs waste hours debugging.

**Warning signs:**
- Deploying webhook handler without testing GET verification first
- Vercel cold start too slow for Meta's timeout

**Prevention:**
- Implement GET handler FIRST: check `hub.verify_token` matches your env var, return `hub.challenge`
- Test webhook locally with ngrok before deploying
- Use Vercel Edge Runtime for webhook (no cold start)
- Add `WEBHOOK_VERIFY_TOKEN` to env vars early

---

## Pitfall 3: Duplicate Message Processing

**Risk level:** High
**Phase:** Phase 2 (WhatsApp Webhook)

**What goes wrong:**
Meta sends the same webhook event multiple times (retry logic). Without deduplication, your bot sends double responses, creates double bookings.

**Warning signs:**
- No `message_id` dedup check
- Booking created twice for same conversation turn

**Prevention:**
- Store `wamid` (WhatsApp message ID) in DB with unique constraint
- On each webhook: check if `wamid` already processed → skip if yes
- Use Postgres `INSERT ... ON CONFLICT DO NOTHING`

---

## Pitfall 4: Multi-Tenant Data Leakage via Supabase RLS

**Risk level:** Critical
**Phase:** Phase 1 (Infra & Auth)

**What goes wrong:**
Using Supabase client without proper RLS policies means one salon's API route could accidentally query another salon's bookings.

**Warning signs:**
- Using `supabase.from('bookings').select()` without `.eq('tenant_id', ...)`
- RLS policies not set as default deny
- Service role key used in frontend

**Prevention:**
- Set RLS on ALL tables from day 1: default DENY
- Use `tenant_id` on every table, indexed
- Pass `tenant_id` via JWT claims (Supabase Auth custom claims)
- NEVER expose service role key to client — use anon key + RLS only
- Integration test: verify tenant A cannot read tenant B's data

---

## Pitfall 5: WhatsApp Template Rejection Delays

**Risk level:** High
**Phase:** Phase 5 (Rappels & Templates)

**What goes wrong:**
Submitting templates reactively (when a reminder needs to be sent) means waiting 24-72h for Meta approval. Client misses their first reminder cycle.

**Warning signs:**
- Templates not submitted at onboarding
- Marketing-sounding template content (gets rejected faster)
- Templates submitted for each salon individually at go-live

**Prevention:**
- Submit 3 standard templates at onboarding day 1: reminder, confirmation, cancellation
- Keep templates simple, non-promotional language
- Create a template library — reuse approved templates across tenants when possible
- Fallback: if template not approved yet, flag in dashboard for manual follow-up

---

## Pitfall 6: 24-Hour Window Violation

**Risk level:** Medium-High
**Phase:** Phase 5 (Rappels & Templates)

**What goes wrong:**
Sending a free-text message (not a template) more than 24h after the client's last message. Meta blocks it silently or returns error 131047. Bot appears to work but messages aren't delivered.

**Warning signs:**
- Reminder sent as regular message instead of template
- No check of `last_message_at` before sending

**Prevention:**
- Always use approved templates for reminders (by definition they're scheduled, outside 24h window)
- Log `last_user_message_at` per conversation
- Before sending any non-template message: check if within 24h window, fallback to template otherwise

---

## Pitfall 7: Phone Number Migration Friction

**Risk level:** Medium**Phase:** Phase 7 (Onboarding)

**What goes wrong:**
Promising "easy migration" of existing WhatsApp Business App number. Reality: coexistence is not universally supported, migration means losing chat history, salon owner panics.

**Warning signs:**
- Selling "keep your number, no changes" without checking eligibility
- Not explaining history loss upfront

**Prevention:**
- Default V1 offer: new dedicated number for the bot
- Coexistence = premium option, verify eligibility before committing
- Migration of main number = accompanied project with contract clause
- Put in contract: "historical WhatsApp conversations not transferred"

---

## Pitfall 8: WhatsApp Number Ban / Business Account Suspension

**Risk level:** High (operational)
**Phase:** Phase 2 + ongoing

**What goes wrong:**
Sending promotional or spam-like messages, high block rate from users, or violating Meta policies. Entire WABA suspended = all salons on that account offline.

**Warning signs:**
- High "block" rate from recipients
- Using bot for marketing blasts
- Impersonating a business or misleading content

**Prevention:**
- Strict opt-in: bot only responds to clients who initiated contact
- No unsolicited outbound (except approved reminder templates to confirmed bookings)
- Each salon on their own WABA (not shared), to isolate blast radius
- Monitor message quality ratings in Meta Business Manager

---

## Pitfall 9: Booking Conflict / Race Condition

**Risk level:** Medium
**Phase:** Phase 4 (Booking Core)

**What goes wrong:**
Two clients book the same slot simultaneously. Without DB-level locking, double booking occurs.

**Prevention:**
- Use Postgres row-level locking on slot availability check: `SELECT ... FOR UPDATE`
- Or use a booking table with unique constraint on `(tenant_id, staff_id, datetime)`
- Confirm booking only after DB write succeeds

---

## Pitfall 10: Missing Salon Config = Bot Crashes

**Risk level:** Medium
**Phase:** Phase 3 + 4

**What goes wrong:**
Bot tries to check availability but salon hasn't configured services or hours yet. Unhandled null → 500 error → Meta retries → webhook flood.

**Prevention:**
- Require minimum config before activating bot (services + at least one working day)
- Dashboard shows "bot inactive — complete setup" state
- Webhook handler: check tenant `is_active` flag before processing

---

*Written: 2026-03-31*
