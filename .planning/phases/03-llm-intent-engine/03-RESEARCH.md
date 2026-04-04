# Phase 3: LLM Intent Engine - Research

**Researched:** 2026-04-02
**Domain:** LLM structured output, FSM conversation state, French/Darija NLP, cost routing
**Confidence:** HIGH (stack), MEDIUM (Darija quality), HIGH (architecture patterns)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BOT-01 | Conversation state persisted in DB with structured fields (step, service_id, date, time, client_name, phone, status) — never raw message history | conversations.state JSONB already exists in schema; ConversationState Zod type defined here drives upsert shape |
| BOT-02 | LLM routing: cheap model (Gemini 2.5 Flash) for clear intents; standard model (GPT-4.1-mini) for ambiguous or failed extractions | Dual-model routing pattern documented; confidence signal from extraction result drives escalation |
| BOT-03 | Graceful fallback reply for unrecognized inputs — client never left in silence | Three-tier fallback ladder: cheap model tries → standard model tries → static French fallback string |
</phase_requirements>

---

## Summary

Phase 3 replaces the stub reply in `processMessage()` with an LLM-powered intent extraction layer. The architecture is a stateless extraction call: the model receives only the current message, the current FSM step, and the tenant's service list — never raw conversation history. This keeps token costs low and state clean.

The chosen stack is `@google/genai` (Gemini 2.5 Flash) as the primary cheap model, with `openai` (GPT-4.1-mini) as the escalation model. Both support Zod-based structured output natively. The FSM state is a typed JSONB blob in `conversations.state` — the schema is already present from the pre-phase-3 migration.

Date/time is extracted by the LLM itself (not by chrono-node) because Darija expressions like "bach ndir nhar lkhamis" cannot be handled by any existing library. The LLM returns a partial ISO date string or a relative marker; the application layer resolves it to an absolute `TIMESTAMPTZ` using a deterministic resolver function before persisting.

**Primary recommendation:** Use `@google/genai` with `gemini-2.5-flash` + Zod structured output as the primary extraction path. Mock the LLM module in unit tests; add one real integration smoke test behind a `INTEGRATION_TEST=true` guard.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/genai` | 1.48.0 | Gemini API client (primary cheap model) | GA since May 2025, replaces `@google/generative-ai`; supports Zod via `zodToJsonSchema` |
| `openai` | 6.33.0 | OpenAI client (escalation model) | Industry standard; `zodResponseFormat` helper ships in the package |
| `zod` | 4.3.6 | Schema definition + runtime validation | Already in project; used by both SDKs for structured output |
| `zod-to-json-schema` | 3.25.2 | Converts Zod schema to JSON Schema for `@google/genai` | Required because Gemini SDK uses raw JSON Schema, not Zod directly |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `chrono-node` | 2.9.0 | French natural language date parsing fallback | Only if LLM returns a relative marker ("demain", "lundi prochain") and you want a deterministic resolver; optional — LLM may return ISO directly |

**Note on chrono-node:** French locale is fully supported (`import chrono from 'chrono-node/fr'`). It handles "demain à 15h" and "vendredi prochain". It does NOT handle Darija. If you include it, use it only as a post-LLM resolver for relative French expressions — never as the primary parser.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@google/genai` | `@google/generative-ai` | Old SDK — deprecated in favor of `@google/genai`. Do not use. |
| `openai` | `@ai-sdk/google` + `@ai-sdk/openai` (Vercel AI SDK) | Vercel AI SDK unifies both providers with one API; adds ~50KB; reasonable for Phase 3+ if provider flexibility is desired |
| GPT-4.1-mini | `gpt-4o-mini` | gpt-4o-mini is $0.15/$0.60 per 1M tokens — GPT-4.1-mini is $0.40/$1.60 but significantly smarter. Use gpt-4.1-mini for escalation |
| LLM date extraction | `chrono-node` only | chrono-node has zero Darija support; LLM is required |

**Installation:**
```bash
npm install @google/genai openai zod-to-json-schema
# chrono-node is optional:
npm install chrono-node
```

**Version verification (run before coding):**
```bash
npm view @google/genai version       # 1.48.0 as of 2026-04-02
npm view openai version              # 6.33.0 as of 2026-04-02
npm view zod-to-json-schema version  # 3.25.2 as of 2026-04-02
npm view chrono-node version         # 2.9.0 as of 2026-04-02
```

---

## Model Selection: Gemini 2.5 Flash vs GPT-4.1-mini

### Pricing Comparison (verified 2026-04-02)

| Model | Input ($/1M) | Output ($/1M) | Structured Output | Free Tier |
|-------|-------------|--------------|------------------|-----------|
| `gemini-2.5-flash` | $0.30 | $2.50 | YES (responseJsonSchema + Zod) | YES |
| `gpt-4o-mini` | $0.15 | $0.60 | YES (zodResponseFormat) | NO |
| `gpt-4.1-mini` | $0.40 | $1.60 | YES | NO |

**Decision rationale:**
- Use `gemini-2.5-flash` as the primary cheap model: it has a free tier (good for dev/staging), strong multilingual support including French, and Zod-native structured output.
- Use `gpt-4.1-mini` (not gpt-4o-mini) as the escalation model: released April 2025, beats gpt-4o on many benchmarks, significantly better reasoning for ambiguous French/Darija inputs.
- Gemini 2.0 Flash is deprecated (shutdown June 1, 2026) — do NOT use `gemini-2.0-flash`.

### Darija Language Quality Assessment

**Confidence: MEDIUM** — No French/Darija-specific benchmark data found for these exact models. Evidence from research:

- Academic research (DarijaBanking, 2024) found GPT-4 achieves only "mediocre" performance on Darija intent classification compared to fine-tuned BERT models.
- However, those evaluations tested full intent classification, not structured field extraction with a constrained schema. The extraction task here is simpler: extract service name from a list, extract a date/time approximation.
- Gemini 2.5 Flash has documented multilingual support for 70+ languages. Darija (Latin-script romanized) is not in official language lists but LLMs trained on web data have significant Moroccan internet content exposure.
- **Recommendation:** Include a manual benchmark step in Wave 0: test 20 real salon messages in French+Darija against the extraction schema. This is the open blocker from Phase 2 and must be resolved before the phase gate.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── llm/
│   │   ├── intent.ts          # extractIntent() — primary entry point
│   │   ├── models.ts          # model client factory (Gemini + OpenAI)
│   │   ├── prompts.ts         # system prompt templates
│   │   ├── routing.ts         # cheap vs escalation routing logic
│   │   └── types.ts           # IntentResult, ConversationState Zod schemas
│   ├── fsm/
│   │   ├── machine.ts         # FSM transitions: step + intent → next step + reply
│   │   ├── state.ts           # load/save conversation state from Supabase
│   │   └── resolver.ts        # relative date → absolute TIMESTAMPTZ
│   └── whatsapp/              # existing (send.ts, verify.ts, types.ts)
├── app/
│   └── api/
│       └── webhook/
│           └── route.ts       # existing — processMessage() calls extractIntent()
```

### Pattern 1: Stateless Intent Extraction (BOT-01, BOT-02)

**What:** The LLM receives a self-contained prompt — no conversation history, only the current message, the current FSM step, and the tenant's service list. It returns a typed JSON object or a `confidence: "low"` signal.

**When to use:** Every incoming text message after step identification.

**Routing signal:**
- If extraction returns `confidence: "high"` and all required fields for the current step are present → use cheap model result, advance FSM
- If extraction returns `confidence: "low"` OR required fields are missing → re-send to escalation model
- If escalation model also fails → static fallback (BOT-03)

```typescript
// Source: @google/genai official docs + zod-to-json-schema pattern
import { GoogleGenAI } from '@google/genai'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { z } from 'zod'

const IntentResultSchema = z.object({
  service_name: z.string().nullable(),
  date_raw: z.string().nullable(),   // e.g. "demain", "2026-04-05", null
  time_raw: z.string().nullable(),   // e.g. "15h", "apres-midi", null
  confidence: z.enum(['high', 'low']),
  intent: z.enum(['book', 'cancel', 'query', 'greeting', 'unknown']),
})

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

const result = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [{ role: 'user', parts: [{ text: userMessage }] }],
  config: {
    systemInstruction: buildSystemPrompt(services, currentStep),
    responseMimeType: 'application/json',
    responseJsonSchema: zodToJsonSchema(IntentResultSchema),
  },
})

const intent = IntentResultSchema.parse(JSON.parse(result.text ?? '{}'))
```

### Pattern 2: Escalation to OpenAI (BOT-02)

```typescript
// Source: openai npm package docs — zodResponseFormat helper
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const completion = await client.beta.chat.completions.parse({
  model: 'gpt-4.1-mini',
  messages: [
    { role: 'system', content: buildSystemPrompt(services, currentStep) },
    { role: 'user', content: userMessage },
  ],
  response_format: zodResponseFormat(IntentResultSchema, 'intent_result'),
})

const intent = completion.choices[0].message.parsed
```

### Pattern 3: FSM Conversation State (BOT-01)

The `conversations.state` column is already a JSONB field in the schema. The FSM state type:

```typescript
// Source: schema migration 20260331000001_create_schema.sql (conversations.state)
const ConversationStateSchema = z.object({
  step: z.enum([
    'greeting',
    'awaiting_service',
    'awaiting_datetime',
    'confirming',
    'confirmed',
    'cancelled',
  ]),
  service_id: z.string().uuid().nullable().optional(),
  service_name: z.string().nullable().optional(),
  date: z.string().nullable().optional(),      // ISO date string YYYY-MM-DD
  time: z.string().nullable().optional(),      // HH:MM
  client_name: z.string().nullable().optional(),
  status: z.enum(['idle', 'in_progress', 'done', 'failed']).default('idle'),
})

type ConversationState = z.infer<typeof ConversationStateSchema>
```

**State is NEVER stored with raw message text.** The messages table (added in pre-phase-3 migration) stores message log for audit/admin, but the FSM state contains only structured extracted fields.

### Pattern 4: FSM Transition Table

```
Step: greeting
  + intent=book → reply: ask which service → step: awaiting_service
  + intent=unknown → fallback reply → step: greeting (unchanged)

Step: awaiting_service
  + service_name extracted → match against services list → step: awaiting_datetime
  + service_name null/low confidence → ask to clarify → step: awaiting_service

Step: awaiting_datetime
  + date_raw + time_raw extracted → resolve to ISO → step: confirming
  + partial (date only or time only) → ask for missing part → step: awaiting_datetime

Step: confirming
  + "oui"/"yes"/"wakha" → create booking record → step: confirmed
  + "non"/"la" → step: cancelled

Step: confirmed / cancelled
  + any message → brief reply + step: greeting (reset)
```

### Pattern 5: Date Resolver

```typescript
// Deterministic resolver — no LLM call
import chrono from 'chrono-node/fr'

function resolveDate(raw: string | null, referenceDate: Date = new Date()): string | null {
  if (!raw) return null
  // Try ISO first
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw
  // Try chrono-node French
  const parsed = chrono.parseDate(raw, referenceDate)
  if (parsed) return parsed.toISOString().split('T')[0]
  // LLM gave something unparseable — return null (trigger re-ask)
  return null
}
```

### Prompt Engineering Pattern for French/Darija

The system prompt must:
1. List services by name (exact match enables entity linking)
2. Specify the current FSM step so the model focuses on what's needed
3. Instruct the model to return `null` for missing fields (not hallucinate)
4. Include 2-3 few-shot examples with Darija-style inputs

```typescript
function buildSystemPrompt(services: Service[], step: string): string {
  const serviceList = services.map(s => `- ${s.name}`).join('\n')
  return `Tu es un assistant de réservation pour un salon de beauté marocain.
Tu extrais des informations structurées des messages clients.
Les clients écrivent en français ou en darija (arabe marocain en lettres latines).

Services disponibles:
${serviceList}

Étape actuelle: ${step}

RÈGLES:
- Retourne null pour tout champ non mentionné explicitement
- Ne devine pas la date si elle n'est pas mentionnée
- Pour "demain", "lundi prochain", "apres-midi" etc., retourne la formulation exacte du client dans date_raw/time_raw
- confidence=high seulement si tu es certain de l'extraction

Exemples:
Message: "coupe demain apres-midi"
Résultat: {"service_name":"coupe","date_raw":"demain","time_raw":"apres-midi","confidence":"high","intent":"book"}

Message: "bghit ndir nhar lkhamis"  
Résultat: {"service_name":null,"date_raw":"lundi","time_raw":null,"confidence":"low","intent":"book"}

Message: "bonjour"
Résultat: {"service_name":null,"date_raw":null,"time_raw":null,"confidence":"high","intent":"greeting"}`
}
```

### Anti-Patterns to Avoid

- **Sending message history to the LLM:** Breaks BOT-01, explodes token costs, makes deduplication meaningless. The FSM state replaces the need for history.
- **Storing extracted text strings in `conversations.state`:** Only store UUIDs, ISO dates, and enum values. Never `service_name: "coupe"` — only `service_id: "uuid"` after matching.
- **Single-model architecture:** One model means you can't have a cost tier. The cheap/escalation split is a core requirement (BOT-02).
- **Using `gemini-2.0-flash`:** Deprecated, shuts down June 2026. Use `gemini-2.5-flash`.
- **Catching all LLM errors silently:** If both models fail, the client must still get a reply (BOT-03). Errors must propagate to the fallback ladder.
- **Parsing dates with chrono-node as primary:** Darija date expressions will silently return `null`. LLM extraction is the primary path; chrono-node is a post-processing resolver only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured JSON from LLM | Custom regex/JSON parsing | `zodResponseFormat` (OpenAI) or `responseJsonSchema` (Gemini) | Models can still hallucinate structure; SDK helpers enforce schema at API level |
| LLM client with retry/backoff | Custom fetch wrapper | `openai` / `@google/genai` SDKs | Both SDKs include automatic retry, timeout, and error handling |
| Schema validation of LLM output | Manual field checking | Zod `.parse()` — throw on invalid shape | LLMs occasionally return unexpected shapes; Zod catches this cleanly |
| French date resolution | Custom regex | `chrono-node/fr` | Handles "vendredi prochain", "dans 2 jours", ordinals, etc. |

**Key insight:** LLM output is probabilistic — treat it as untrusted external input and validate with Zod every time. A missing field or wrong type from the LLM would corrupt FSM state if not caught.

---

## Common Pitfalls

### Pitfall 1: Service Name Matching — Fuzzy vs Exact
**What goes wrong:** Client writes "coupe cheveux" but service is stored as "Coupe Femme". LLM returns "coupe cheveux" in `service_name`. Direct string match fails. Booking cannot proceed.
**Why it happens:** LLMs paraphrase; service names vary between salons.
**How to avoid:** After LLM extraction, use a simple case-insensitive substring match or Levenshtein distance (< 3 edits) against the tenant's service list. If ambiguous, ask the client to choose. Do NOT do fuzzy matching inside the LLM prompt — it hallucsinates confirmations.
**Warning signs:** "service not found" errors in FSM even when client clearly named a service.

### Pitfall 2: The "Confident But Wrong" Extraction
**What goes wrong:** Model returns `confidence: "high"` but extracts the wrong service or wrong date.
**Why it happens:** The model optimizes for appearing helpful. Few-shot examples calibrate this but don't eliminate it.
**How to avoid:** Add a confirming step in the FSM before saving any booking. The bot repeats back: "Vous souhaitez une Coupe Femme le mardi 7 avril à 15h — c'est bien ça?" and requires an affirmative before writing to DB.
**Warning signs:** Bookings created without confirmation step.

### Pitfall 3: Gemini Structured Output Schema Depth Limits
**What goes wrong:** Zod schema with nested objects or `z.union()` types fails to parse after `zodToJsonSchema` conversion.
**Why it happens:** Gemini supports a subset of JSON Schema. `anyOf`, `oneOf`, `allOf` have partial support. Nullable fields must use specific patterns.
**How to avoid:** Keep `IntentResultSchema` flat (max 1 level deep). Use `z.string().nullable()` not `z.union([z.string(), z.null()])`. Test schema conversion before coding FSM logic.
**Warning signs:** `Invalid schema` errors from Gemini API on the first call.

### Pitfall 4: Meta 5-Second Response Deadline
**What goes wrong:** LLM call (especially escalation to gpt-4.1-mini) takes > 5 seconds. Meta marks the webhook as failed and retries. Bot sends duplicate replies.
**Why it happens:** Escalation adds a second sequential LLM call. Deduplication via `processed_messages` protects against double-processing but the 5s deadline is a hard Meta constraint.
**How to avoid:** Measure p95 latency of both models in sandbox. If escalation path routinely exceeds 4s, consider: (a) return 200 immediately and process async via queue (Supabase Edge Function or background job), or (b) set a 3.5s timeout on the cheap model and skip escalation if the total budget is exceeded (use static fallback instead).
**Warning signs:** Meta webhook delivery failures in the developer console; duplicate messages to clients.

### Pitfall 5: Darija Latin Script Variation
**What goes wrong:** "wakha" (ok), "waxxa", "ouaxxa" are all the same word. "ghda" (tomorrow), "ghedda" — multiple spellings.
**Why it happens:** Darija has no standardized orthography.
**How to avoid:** The few-shot examples in the system prompt should cover common variants. Do NOT enumerate all variants — instead, instruct the model: "les clients écrivent le darija de manière phonétique en lettres latines, plusieurs orthographes existent pour le même mot."
**Warning signs:** `intent: "unknown"` on clearly affirmative messages.

### Pitfall 6: OpenAI `zodResponseFormat` Zod v4 Incompatibility
**What goes wrong:** `zodResponseFormat` from `openai/helpers/zod` may not work with Zod v4 (currently installed in this project as `^4.3.6`). A Vitest issue report from 2025 flagged this.
**Why it happens:** `openai` SDK's Zod helper was originally written for Zod v3. Zod v4 has internal API changes.
**How to avoid:** Verify compatibility immediately after installing `openai`. If incompatible: use `response_format: { type: 'json_schema', json_schema: { ... } }` directly with `zodToJsonSchema` instead of `zodResponseFormat`.
**Warning signs:** TypeScript errors when calling `zodResponseFormat(schema, name)`.

---

## Code Examples

### Gemini Structured Output (verified pattern)

```typescript
// Source: https://ai.google.dev/gemini-api/docs/structured-output
import { GoogleGenAI } from '@google/genai'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { z } from 'zod'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

const ResponseSchema = z.object({
  service_name: z.string().nullable(),
  date_raw: z.string().nullable(),
  time_raw: z.string().nullable(),
  confidence: z.enum(['high', 'low']),
  intent: z.enum(['book', 'cancel', 'query', 'greeting', 'unknown']),
})

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [{ role: 'user', parts: [{ text: userMessage }] }],
  config: {
    systemInstruction: systemPrompt,
    responseMimeType: 'application/json',
    responseJsonSchema: zodToJsonSchema(ResponseSchema),
  },
})

const parsed = ResponseSchema.parse(JSON.parse(response.text ?? '{}'))
```

### OpenAI Escalation (verified pattern — check Zod v4 compat first)

```typescript
// Source: openai npm package — zodResponseFormat helper
// IMPORTANT: Verify this works with zod ^4.x before using. If not, use json_schema directly.
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const completion = await client.beta.chat.completions.parse({
  model: 'gpt-4.1-mini',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ],
  response_format: zodResponseFormat(ResponseSchema, 'intent_result'),
})

const parsed = completion.choices[0].message.parsed  // already validated
```

### Routing Logic

```typescript
async function extractIntent(
  message: string,
  state: ConversationState,
  services: Service[]
): Promise<IntentResult> {
  const prompt = buildSystemPrompt(services, state.step)

  // Attempt cheap model first
  const cheap = await tryGemini(message, prompt)
  if (cheap && cheap.confidence === 'high' && hasRequiredFields(cheap, state.step)) {
    return cheap
  }

  // Escalate to standard model
  const standard = await tryOpenAI(message, prompt)
  if (standard) return standard

  // Both failed — return unknown intent (triggers BOT-03 fallback)
  return { intent: 'unknown', confidence: 'low', service_name: null, date_raw: null, time_raw: null }
}
```

### Vitest Mock Pattern (consistent with existing tests)

```typescript
// Pattern from tests/webhook.test.ts — mock at module boundary
vi.mock('@/lib/llm/intent', () => ({
  extractIntent: vi.fn().mockResolvedValue({
    intent: 'book',
    service_name: 'Coupe Femme',
    date_raw: 'demain',
    time_raw: 'apres-midi',
    confidence: 'high',
  }),
}))
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@google/generative-ai` | `@google/genai` | GA May 2025 | Old package deprecated; new SDK is the official path |
| `gemini-2.0-flash` | `gemini-2.5-flash` | Flash 2.5 released 2025 | 2.0 Flash deprecated June 2026; 2.5 Flash is stable and smarter |
| `gpt-4o-mini` | `gpt-4.1-mini` | April 14, 2025 | 4.1-mini beats gpt-4o on many benchmarks; better for ambiguous extraction |
| JSON mode (`response_format: {type:"json_object"}`) | Structured output with schema | 2024-2025 | JSON mode doesn't enforce schema shape; structured output guarantees it |
| Sending full conversation history | Structured state only | (architectural) | History-free extraction is a core BOT-01 requirement |

**Deprecated/outdated:**
- `@google/generative-ai`: superseded by `@google/genai`. Do not install.
- `gemini-2.0-flash`: shuts down June 1, 2026. Do not use.
- `gpt-3.5-turbo`: not structured-output capable.

---

## Open Questions

1. **Darija quality without benchmarking**
   - What we know: Gemini 2.5 Flash handles 70+ languages; Darija is not formally listed; LLM web data includes Moroccan Latin-script Darija
   - What's unclear: Actual extraction accuracy on real salon messages (partial service names, mixed French/Darija in one sentence)
   - Recommendation: Add a mandatory benchmark step in Wave 0 — 20 test messages, manual review of extraction. Gate the phase on >= 80% correct extractions before connecting to live bot.

2. **`zodResponseFormat` + Zod v4 compatibility**
   - What we know: This project uses `zod ^4.3.6`. A community bug report flagged incompatibility.
   - What's unclear: Whether `openai` 6.33.0 has fixed this.
   - Recommendation: Install `openai` and run a quick type-check + runtime test before building the escalation path. Fallback: use raw `json_schema` response format with `zodToJsonSchema` output.

3. **Async processing for Meta 5-second deadline**
   - What we know: Two sequential LLM calls (cheap + escalation) can easily exceed 5s.
   - What's unclear: Real-world p95 latency of Gemini 2.5 Flash + gpt-4.1-mini in sequence.
   - Recommendation: For Phase 3, process synchronously and measure. If p95 > 4s, plan async queue in Phase 3 or 4.

4. **`bot_configs.system_prompt` field usage**
   - What we know: `bot_configs` has a `system_prompt TEXT` field (from Phase 1 schema).
   - What's unclear: Should the per-tenant system prompt override the default prompt, or append to it?
   - Recommendation: Default to appending. The base prompt handles extraction logic; the tenant override adds salon-specific context (opening hours, cancellation policy). This is Claude's discretion.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `salon-bot/vitest.config.ts` |
| Quick run command | `cd salon-bot && npm test -- --reporter=verbose tests/llm-intent.test.ts` |
| Full suite command | `cd salon-bot && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOT-01 | `ConversationState` Zod schema parses valid state objects | unit | `npm test -- tests/fsm-state.test.ts` | ❌ Wave 0 |
| BOT-01 | FSM transition table: step+intent → correct next step | unit | `npm test -- tests/fsm-machine.test.ts` | ❌ Wave 0 |
| BOT-01 | `saveConversationState` writes only structured fields to Supabase JSONB | unit (mock Supabase) | `npm test -- tests/fsm-state.test.ts` | ❌ Wave 0 |
| BOT-02 | `extractIntent` calls Gemini for high-confidence input, skips OpenAI | unit (mock LLM modules) | `npm test -- tests/llm-intent.test.ts` | ❌ Wave 0 |
| BOT-02 | `extractIntent` escalates to OpenAI when Gemini returns `confidence: "low"` | unit (mock LLM modules) | `npm test -- tests/llm-intent.test.ts` | ❌ Wave 0 |
| BOT-02 | `extractIntent` returns `intent: "unknown"` when both models fail | unit (mock LLM modules) | `npm test -- tests/llm-intent.test.ts` | ❌ Wave 0 |
| BOT-03 | `processMessage` sends a non-empty fallback reply when intent is `unknown` | unit (mock send + LLM) | `npm test -- tests/webhook.test.ts` | ❌ extend existing |
| BOT-03 | Fallback reply is in French and does not leave client in silence | unit assertion on reply text | `npm test -- tests/webhook.test.ts` | ❌ extend existing |
| BOT-01 | Gemini actual extraction of "coupe demain apres-midi" → correct fields | integration (real API) | `INTEGRATION_TEST=true npm test -- tests/llm-integration.test.ts` | ❌ Wave 0 |
| BOT-01 | Darija sample: "bghit ndir nhar lkhamis" → intent detected | manual benchmark | human review of 20 test messages | N/A |

### Sampling Rate
- **Per task commit:** `cd salon-bot && npm test -- tests/llm-intent.test.ts tests/fsm-machine.test.ts tests/fsm-state.test.ts`
- **Per wave merge:** `cd salon-bot && npm test`
- **Phase gate:** Full suite green + manual Darija benchmark review before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/llm-intent.test.ts` — covers BOT-02 routing logic (mock Gemini + OpenAI modules)
- [ ] `tests/fsm-machine.test.ts` — covers BOT-01 FSM state transitions
- [ ] `tests/fsm-state.test.ts` — covers BOT-01 state persistence (mock Supabase)
- [ ] `tests/llm-integration.test.ts` — covers real Gemini call; gated on `INTEGRATION_TEST=true`
- [ ] Extend `tests/webhook.test.ts` — add BOT-03 fallback reply assertions

*(No framework install needed — Vitest 4.1.2 already configured)*

---

## Token Cost Estimation

Approximate token budget per message exchange at scale (Gemini 2.5 Flash, primary path):

| Component | Tokens |
|-----------|--------|
| System prompt (services list 5 items, FSM step, rules, 3 few-shot examples) | ~400 input |
| User message | ~30 input |
| LLM response (JSON intent object) | ~60 output |
| **Total per exchange (happy path)** | **~490 tokens** |

At $0.30/1M input + $2.50/1M output:
- Happy path cost: 0.000430 × $0.30 + 0.00006 × $2.50 = ~$0.0001 per message
- With escalation (10% of messages): adds ~490 tokens at $0.40/$1.60 → ~$0.0003 total for escalated message
- **At 1,000 messages/day across all tenants: ~$0.12/day** (well within acceptable range)

---

## Sources

### Primary (HIGH confidence)
- `https://ai.google.dev/gemini-api/docs/structured-output` — Gemini structured output with JSON schema, Zod integration
- `https://ai.google.dev/gemini-api/docs/pricing` — Gemini 2.5 Flash pricing verified 2026-04-02
- `https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash` — Model name, capabilities, deprecation notice for 2.0 Flash
- `https://github.com/googleapis/js-genai` — `@google/genai` SDK (GA May 2025, replaces `@google/generative-ai`)
- `https://github.com/wanasit/chrono` — chrono-node French locale support confirmed
- Supabase migration files (read directly) — schema confirmation for conversations.state JSONB

### Secondary (MEDIUM confidence)
- `https://pricepertoken.com/pricing-page/model/openai-gpt-4o-mini` — gpt-4o-mini pricing ($0.15/$0.60) corroborated with OpenAI pricing page link
- `https://artificialanalysis.ai/models/gpt-4-1-mini` — GPT-4.1-mini release April 2025, pricing, benchmark comparison
- `https://llm-stats.com/models/gpt-4.1-mini-2025-04-14` — GPT-4.1-mini specs
- `https://arxiv.org/html/2405.16482v1` (DarijaBanking) — LLM performance on Darija intent detection (GPT-4 mediocre vs fine-tuned BERT)
- `https://openrouter.ai/google/gemini-2.5-flash` — Gemini 2.5 Flash availability confirmed

### Tertiary (LOW confidence — needs validation)
- Community bug report: `zodResponseFormat` + Zod v4 incompatibility — flagged for immediate verification in Wave 0
- Darija extraction quality with Gemini 2.5 Flash — no authoritative benchmark found; manual validation required

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions verified against npm registry 2026-04-02
- Model selection: HIGH for pricing/availability; MEDIUM for Darija quality (no benchmark data)
- Architecture patterns: HIGH — FSM+LLM pattern is well-established; schemas derived directly from existing DB migration
- Pitfalls: HIGH — Zod v4 compat issue, Meta 5s deadline, date parsing are all well-evidenced

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (LLM pricing changes frequently; re-verify before starting if > 2 weeks)
