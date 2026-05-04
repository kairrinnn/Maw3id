import Anthropic from '@anthropic-ai/sdk'
import { IntentResultSchema, type IntentResult } from './types'

export async function tryAnthropic(message: string, systemPrompt: string): Promise<IntentResult | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      tools: [{
        name: 'extract_intent',
        description: 'Extraire l\'intention du client depuis son message',
        input_schema: {
          type: 'object' as const,
          properties: {
            intent: { type: 'string', enum: ['book', 'cancel', 'modify', 'query', 'greeting', 'unknown'] },
            confidence: { type: 'string', enum: ['high', 'low'] },
            service_name: { type: ['string', 'null'] },
            date_raw: { type: ['string', 'null'] },
            time_raw: { type: ['string', 'null'] },
          },
          required: ['intent', 'confidence', 'service_name', 'date_raw', 'time_raw'],
        },
      }],
      tool_choice: { type: 'tool', name: 'extract_intent' },
      messages: [{ role: 'user', content: message }],
    })
    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return null
    return IntentResultSchema.parse(toolUse.input)
  } catch (err) {
    console.error('[llm] Anthropic extraction failed:', err)
    return null
  }
}
