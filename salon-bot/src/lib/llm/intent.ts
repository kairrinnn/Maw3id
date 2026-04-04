import { buildSystemPrompt } from './prompts'
import { tryGemini, tryOpenAI } from './models'
import type { ConversationState, IntentResult, Service } from './types'

const FALLBACK_INTENT: IntentResult = {
  intent: 'unknown',
  confidence: 'low',
  service_name: null,
  date_raw: null,
  time_raw: null,
}

function hasRequiredFields(intent: IntentResult, step: string): boolean {
  if (step === 'awaiting_service') return intent.service_name !== null
  if (step === 'awaiting_datetime') return intent.date_raw !== null || intent.time_raw !== null
  return true
}

export async function extractIntent(
  message: string,
  state: ConversationState,
  services: Service[]
): Promise<IntentResult> {
  if (process.env.SKIP_LLM === 'true') return FALLBACK_INTENT

  const prompt = buildSystemPrompt(services, state.step)

  const cheap = await tryGemini(message, prompt)
  if (cheap && cheap.confidence === 'high' && hasRequiredFields(cheap, state.step)) {
    return cheap
  }

  const standard = await tryOpenAI(message, prompt)
  if (standard) return standard

  return FALLBACK_INTENT
}
