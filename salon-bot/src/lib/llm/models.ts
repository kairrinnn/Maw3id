import { GoogleGenAI } from '@google/genai'
import { zodToJsonSchema } from 'zod-to-json-schema'
import OpenAI from 'openai'
import { IntentResultSchema, type IntentResult } from './types'

export async function tryGemini(message: string, systemPrompt: string): Promise<IntentResult | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: message }] }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseJsonSchema: zodToJsonSchema(IntentResultSchema as any),
      },
    })
    return IntentResultSchema.parse(JSON.parse(result.text ?? '{}'))
  } catch (err) {
    console.error('[llm] Gemini extraction failed:', err)
    return null
  }
}

export async function tryOpenAI(message: string, systemPrompt: string): Promise<IntentResult | null> {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    // NOTE: zodResponseFormat peut être incompatible avec Zod v4.
    // Si ça échoue, utilise le fallback json_schema ci-dessous.
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'intent_result',
          strict: true,
          schema: zodToJsonSchema(IntentResultSchema as any) as Record<string, unknown>,
        },
      },
    })
    const content = completion.choices[0]?.message?.content ?? '{}'
    return IntentResultSchema.parse(JSON.parse(content))
  } catch (err) {
    console.error('[llm] OpenAI extraction failed:', err)
    return null
  }
}
