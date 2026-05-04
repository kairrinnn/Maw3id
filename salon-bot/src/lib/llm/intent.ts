import { buildSystemPrompt } from './prompts'
import { tryAnthropic } from './models'
import type { ConversationState, IntentResult, Service } from './types'

const FALLBACK_INTENT: IntentResult = {
  intent: 'unknown',
  confidence: 'low',
  service_name: null,
  date_raw: null,
  time_raw: null,
}


export async function extractIntent(
  message: string,
  state: ConversationState,
  services: Service[]
): Promise<IntentResult> {
  if (process.env.SKIP_LLM === 'true') return FALLBACK_INTENT

  const prompt = buildSystemPrompt(services, state.step)

  const result = await tryAnthropic(message, prompt)
  if (result) return result

  return FALLBACK_INTENT
}
