import { z } from 'zod'

export const IntentResultSchema = z.object({
  service_name: z.string().nullable(),
  date_raw: z.string().nullable(),
  time_raw: z.string().nullable(),
  confidence: z.enum(['high', 'low']),
  intent: z.enum(['book', 'cancel', 'modify', 'query', 'greeting', 'unknown']),
})
export type IntentResult = z.infer<typeof IntentResultSchema>

export const FSM_STEPS = [
  'greeting', 'awaiting_service', 'awaiting_datetime',
  'confirming', 'confirmed',
  'cancelling', 'modify_awaiting_datetime', 'confirming_modify',
  'confirmed_modify_abandoned',
  'cancelled',
] as const

export const ConversationStateSchema = z.object({
  step: z.enum(FSM_STEPS),
  service_id: z.string().uuid().nullable().optional(),
  service_name: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  client_name: z.string().nullable().optional(),
  booking_id: z.string().uuid().nullable().optional(),
  status: z.enum(['idle', 'in_progress', 'done', 'failed']).default('idle'),
})
export type ConversationState = z.infer<typeof ConversationStateSchema>

export interface Service {
  id: string
  tenant_id: string
  name: string
  duration_minutes: number
  price_mad: number | null
  active: boolean
}

export const INITIAL_STATE: ConversationState = { step: 'greeting', status: 'idle' }

export interface ReplyContext {
  currentStep: string     // FSM step BEFORE transition
  nextStep: string        // FSM step AFTER transition
  intent: string          // 'book' | 'cancel' | 'modify' | 'query' | 'greeting' | 'unknown'
  userMessage: string     // what the client sent
  serviceName?: string | null
  date?: string | null    // ISO date e.g. "2026-04-09"
  time?: string | null    // "15:00"
  clientName?: string | null
  salonName: string       // from tenants.name JOIN in route.ts
  conflict?: boolean      // true when slot conflict detected
}
