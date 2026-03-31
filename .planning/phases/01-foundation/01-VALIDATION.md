---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x |
| **Config file** | vitest.config.ts — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-schema | 01 | 1 | INFRA-01 | integration | `npx vitest run tests/schema.test.ts` | ❌ W0 | ⬜ pending |
| 1-rls | 01 | 1 | INFRA-02 | integration | `npx vitest run tests/rls.test.ts` | ❌ W0 | ⬜ pending |
| 1-auth | 01 | 2 | INFRA-03 | integration | `npx vitest run tests/auth.test.ts` | ❌ W0 | ⬜ pending |
| 1-config | 01 | 2 | INFRA-04 | integration | `npx vitest run tests/bot-config.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — vitest setup with Supabase test client
- [ ] `tests/helpers/supabase.ts` — test client factory (anon + service role)
- [ ] `tests/schema.test.ts` — stubs verifying INFRA-01 (all tables have tenant_id column)
- [ ] `tests/rls.test.ts` — stubs verifying INFRA-02 (cross-tenant query returns 0 rows)
- [ ] `tests/auth.test.ts` — stubs verifying INFRA-03 (signup + login flow)
- [ ] `tests/bot-config.test.ts` — stubs verifying INFRA-04 (bot_configs CRUD per tenant)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supabase Auth Hook (JWT custom claim) registration | INFRA-02 | Requires Supabase Dashboard UI — no CLI command | Log in to Supabase Dashboard → Database → Webhooks → Auth Hooks → register `set_tenant_id_claim` function |
| Tenant isolation in browser session | INFRA-02 | Requires real browser session with two accounts | Open two browser tabs, log in as different tenants, verify no cross-tenant data visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
