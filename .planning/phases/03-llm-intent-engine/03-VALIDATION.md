---
phase: 3
slug: llm-intent-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 |
| **Config file** | `salon-bot/vitest.config.mts` |
| **Quick run command** | `cd salon-bot && npx vitest run tests/llm-intent.test.ts tests/fsm-machine.test.ts tests/fsm-state.test.ts` |
| **Full suite command** | `cd salon-bot && npx vitest run` |
| **Estimated runtime** | ~10 seconds (mocked LLM, no real API calls) |

---

## Sampling Rate

- **After every task commit:** Run quick run command above
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green + manual Darija benchmark passed
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 03-01 | 1 | BOT-01, BOT-02 | unit | `npx vitest run tests/llm-intent.test.ts` | ❌ W0 | ⬜ pending |
| 3-01-02 | 03-01 | 1 | BOT-02 | unit | `npx vitest run tests/llm-intent.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-01 | 03-02 | 1 | BOT-01 | unit | `npx vitest run tests/fsm-machine.test.ts tests/fsm-state.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03-03 | 2 | BOT-01, BOT-02, BOT-03 | unit | `npx vitest run` | ❌ extend existing | ⬜ pending |
| 3-int-01 | 03-01 | gate | BOT-01 | integration | `INTEGRATION_TEST=true npx vitest run tests/llm-integration.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/llm-intent.test.ts` — BOT-02 routing (mock Gemini + OpenAI, test cheap path, escalation path, both-fail path)
- [ ] `tests/fsm-machine.test.ts` — BOT-01 FSM transitions (step+intent → next step, all valid transitions)
- [ ] `tests/fsm-state.test.ts` — BOT-01 state persistence (mock Supabase, verify only structured fields saved)
- [ ] `tests/llm-integration.test.ts` — Real Gemini API call gated on `INTEGRATION_TEST=true`

*Existing vitest infrastructure covers all framework needs — no install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Darija extraction accuracy ≥ 80% | BOT-01, BOT-02 | No automated Darija test corpus exists | Send 20 real salon messages (French + Darija mix) to the bot in sandbox, manually review extracted fields. Pass if ≥ 16/20 correct. Gate phase completion on this. |
| Bot replies are grammatically correct French | BOT-03 | LLM output quality is subjective | Review 5 fallback replies manually — must be intelligible French, not empty or garbled. |
| p95 response latency under 4.5s | BOT-02 | Requires real network + LLM timing | Send 10 test messages via ngrok, measure webhook-to-reply time. Escalation path must complete < 4.5s p95. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
