import { describe, it, expect, vi } from 'vitest'
import { loadConversationState, saveConversationState } from '@/lib/fsm/state'
import { INITIAL_STATE } from '@/lib/fsm/types'

describe('loadConversationState', () => {
  it('returns initial state if no sequence found', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any

    const state = await loadConversationState(mockSupabase, 't1', 'wa1')
    expect(state).toEqual(INITIAL_STATE)
  })

  it('returns parsed state if found', async () => {
    const mockState = { step: 'awaiting_service', status: 'in_progress' }
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { state: mockState }, error: null }),
    } as any

    const state = await loadConversationState(mockSupabase, 't1', 'wa1')
    expect(state.step).toBe('awaiting_service')
  })
})

describe('saveConversationState', () => {
  it('updates the conversation state', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    } as any

    await saveConversationState(mockSupabase, 't1', 'wa1', INITIAL_STATE)
    expect(mockSupabase.from).toHaveBeenCalledWith('conversations')
    expect(mockSupabase.update).toHaveBeenCalled()
  })
})
