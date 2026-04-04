import type { SupabaseClient } from '@supabase/supabase-js'
import { ConversationStateSchema, INITIAL_STATE, type ConversationState } from './types'

export async function loadConversationState(
  supabase: SupabaseClient,
  tenantId: string,
  waId: string
): Promise<ConversationState> {
  const { data } = await supabase
    .from('conversations')
    .select('state')
    .eq('tenant_id', tenantId)
    .eq('wa_id', waId)
    .single()

  if (!data?.state) return INITIAL_STATE
  try {
    return ConversationStateSchema.parse(data.state)
  } catch {
    return INITIAL_STATE
  }
}

export async function saveConversationState(
  supabase: SupabaseClient,
  tenantId: string,
  waId: string,
  state: ConversationState
): Promise<void> {
  await supabase
    .from('conversations')
    .update({ state, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('wa_id', waId)
}
