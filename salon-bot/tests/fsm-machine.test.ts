import { describe, it, expect } from 'vitest'
import { processIntent } from '@/lib/fsm/machine'
import type { ConversationState, IntentResult, Service } from '@/lib/fsm/types'

describe('processIntent', () => {
  const mockServices: Service[] = [
    { id: 's1', tenant_id: 't1', name: 'Coupe', duration_minutes: 30, price_mad: 100, active: true },
    { id: 's2', tenant_id: 't1', name: 'Coloration', duration_minutes: 60, price_mad: 300, active: true },
  ]

  it('greeting step -> handles greeting intent', () => {
    const state: ConversationState = { step: 'greeting', status: 'idle' }
    const intent: IntentResult = { intent: 'greeting', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { nextState, replyText } = processIntent(state, intent, mockServices)

    expect(nextState.step).toBe('greeting')
    expect(replyText).toContain('Bonjour')
  })

  it('greeting step -> switches to awaiting_service if booking intent', () => {
    const state: ConversationState = { step: 'greeting', status: 'idle' }
    const intent: IntentResult = { intent: 'book', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { nextState, replyText } = processIntent(state, intent, mockServices)

    expect(nextState.step).toBe('awaiting_service')
    expect(replyText).toContain('service')
  })

  it('awaiting_service -> matches service and moves to awaiting_datetime', () => {
    const state: ConversationState = { step: 'awaiting_service', status: 'idle' }
    const intent: IntentResult = { intent: 'book', confidence: 'high', service_name: 'coupe', date_raw: null, time_raw: null }
    const { nextState, replyText } = processIntent(state, intent, mockServices)

    expect(nextState.step).toBe('awaiting_datetime')
    expect(nextState.service_name).toBe('Coupe')
    expect(replyText).toContain('rendez-vous')
  })

  it('awaiting_datetime -> resolves date/time and moves to confirming', () => {
    const state: ConversationState = { step: 'awaiting_datetime', status: 'idle', service_name: 'Coupe' }
    const intent: IntentResult = { intent: 'book', confidence: 'high', service_name: null, date_raw: 'demain', time_raw: '15h' }
    const { nextState, replyText } = processIntent(state, intent, mockServices)

    expect(nextState.step).toBe('confirming')
    expect(nextState.date).toBeDefined()
    expect(nextState.time).toBe('15:00')
    expect(replyText).toContain("C'est bien ca")
  })

  it('confirming -> handles "oui"', () => {
    const state: ConversationState = { step: 'confirming', status: 'idle', service_name: 'Coupe', date: '2026-04-03', time: '15:00' }
    const intent: IntentResult = { intent: 'unknown', confidence: 'low', service_name: null, date_raw: null, time_raw: null }
    const { nextState, replyText } = processIntent(state, intent, mockServices, 'oui')

    expect(nextState.step).toBe('confirmed')
    expect(nextState.status).toBe('done')
    expect(replyText).toContain('confirme')
  })

  it('global override -> handles "cancel"', () => {
    const state: ConversationState = { step: 'awaiting_datetime', status: 'idle' }
    const intent: IntentResult = { intent: 'cancel', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { nextState, replyText } = processIntent(state, intent, mockServices)

    expect(nextState.step).toBe('cancelled')
    expect(replyText).toContain('annule')
  })
})

describe('cancel bug fix — global override scoping', () => {
  const mockServices: Service[] = [
    { id: 's1', tenant_id: 't1', name: 'Coupe', duration_minutes: 30, price_mad: 100, active: true },
  ]

  it('global cancel fires at awaiting_service', () => {
    const state: ConversationState = { step: 'awaiting_service', status: 'idle' }
    const intent: IntentResult = { intent: 'cancel', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { nextState } = processIntent(state, intent, mockServices)
    expect(nextState.step).toBe('cancelled')
  })

  it('global cancel fires at awaiting_datetime', () => {
    const state: ConversationState = { step: 'awaiting_datetime', status: 'idle' }
    const intent: IntentResult = { intent: 'cancel', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { nextState } = processIntent(state, intent, mockServices)
    expect(nextState.step).toBe('cancelled')
  })

  it('global cancel fires at confirming', () => {
    const state: ConversationState = { step: 'confirming', status: 'idle' }
    const intent: IntentResult = { intent: 'cancel', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { nextState } = processIntent(state, intent, mockServices)
    expect(nextState.step).toBe('cancelled')
  })

  it('global cancel does NOT fire at confirmed — falls through to cancelling step', () => {
    const state: ConversationState = {
      step: 'confirmed', status: 'done', service_name: 'Coupe',
      date: '2026-04-07', time: '15:00', booking_id: 'booking-uuid-1',
    }
    const intent: IntentResult = { intent: 'cancel', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { nextState } = processIntent(state, intent, mockServices)
    expect(nextState.step).toBe('cancelling')
    expect(nextState.booking_id).toBe('booking-uuid-1')
  })
})

describe('cancel from confirmed (BOOK-03)', () => {
  const mockServices: Service[] = [
    { id: 's1', tenant_id: 't1', name: 'Coupe', duration_minutes: 30, price_mad: 100, active: true },
  ]

  it('transitions to cancelling with booking_id preserved', () => {
    const state: ConversationState = {
      step: 'confirmed', status: 'done', service_name: 'Coupe',
      date: '2026-04-07', time: '15:00', booking_id: 'booking-uuid-1',
    }
    const intent: IntentResult = { intent: 'cancel', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { nextState } = processIntent(state, intent, mockServices)
    expect(nextState.step).toBe('cancelling')
    expect(nextState.booking_id).toBe('booking-uuid-1')
    expect(nextState.status).toBe('in_progress')
  })

  it('reply text confirms cancellation intent', () => {
    const state: ConversationState = {
      step: 'confirmed', status: 'done', service_name: 'Coupe',
      date: '2026-04-07', time: '15:00', booking_id: 'booking-uuid-1',
    }
    const intent: IntentResult = { intent: 'cancel', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { replyText } = processIntent(state, intent, mockServices)
    expect(replyText).toContain('annule')
  })
})

describe('query flow (BOOK-04)', () => {
  const mockServices: Service[] = [
    { id: 's1', tenant_id: 't1', name: 'Coupe', duration_minutes: 30, price_mad: 100, active: true },
  ]

  it('greeting + query returns UPCOMING_BOOKINGS_PLACEHOLDER', () => {
    const state: ConversationState = { step: 'greeting', status: 'idle' }
    const intent: IntentResult = { intent: 'query', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { nextState, replyText } = processIntent(state, intent, mockServices)
    expect(nextState.step).toBe('greeting')
    expect(replyText).toBe('UPCOMING_BOOKINGS_PLACEHOLDER')
  })

  it('confirmed + query returns UPCOMING_BOOKINGS_PLACEHOLDER', () => {
    const state: ConversationState = {
      step: 'confirmed', status: 'done', service_name: 'Coupe',
      date: '2026-04-07', time: '15:00', booking_id: 'booking-uuid-1',
    }
    const intent: IntentResult = { intent: 'query', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { nextState, replyText } = processIntent(state, intent, mockServices)
    expect(nextState.step).toBe('confirmed')
    expect(replyText).toBe('UPCOMING_BOOKINGS_PLACEHOLDER')
  })
})

describe('modify flow (BOOK-02)', () => {
  const mockServices: Service[] = [
    { id: 's1', tenant_id: 't1', name: 'Coupe', duration_minutes: 30, price_mad: 100, active: true },
  ]

  it('confirmed + intent=modify transitions to modify_awaiting_datetime', () => {
    const state: ConversationState = {
      step: 'confirmed', status: 'done', service_name: 'Coupe',
      date: '2026-04-07', time: '15:00', booking_id: 'booking-uuid-1',
    }
    const intent: IntentResult = { intent: 'modify', confidence: 'high', service_name: null, date_raw: null, time_raw: null }
    const { nextState, replyText } = processIntent(state, intent, mockServices)
    expect(nextState.step).toBe('modify_awaiting_datetime')
    expect(nextState.booking_id).toBe('booking-uuid-1')
    expect(replyText).toContain('deplacer')
  })

  it('confirmed + MODIFY_KEYWORDS in confirmText transitions to modify_awaiting_datetime', () => {
    const state: ConversationState = {
      step: 'confirmed', status: 'done', service_name: 'Coupe',
      date: '2026-04-07', time: '15:00', booking_id: 'booking-uuid-1',
    }
    const intent: IntentResult = { intent: 'unknown', confidence: 'low', service_name: null, date_raw: null, time_raw: null }
    const { nextState } = processIntent(state, intent, mockServices, 'je veux modifier mon rdv')
    expect(nextState.step).toBe('modify_awaiting_datetime')
  })

  it('modify_awaiting_datetime + date + time transitions to confirming_modify', () => {
    const state: ConversationState = {
      step: 'modify_awaiting_datetime', status: 'done', service_name: 'Coupe',
      booking_id: 'booking-uuid-1',
    }
    const intent: IntentResult = { intent: 'book', confidence: 'high', service_name: null, date_raw: 'demain', time_raw: '16h' }
    const { nextState, replyText } = processIntent(state, intent, mockServices)
    expect(nextState.step).toBe('confirming_modify')
    expect(nextState.date).toBeDefined()
    expect(nextState.time).toBe('16:00')
    expect(replyText).toContain('deplacer')
  })

  it('modify_awaiting_datetime + date only stays and asks for time', () => {
    const state: ConversationState = {
      step: 'modify_awaiting_datetime', status: 'done', service_name: 'Coupe',
      booking_id: 'booking-uuid-1',
    }
    const intent: IntentResult = { intent: 'book', confidence: 'high', service_name: null, date_raw: 'vendredi', time_raw: null }
    const { nextState, replyText } = processIntent(state, intent, mockServices)
    expect(nextState.step).toBe('modify_awaiting_datetime')
    expect(replyText).toContain('heure')
  })

  it('confirming_modify + oui transitions to confirmed with updated date/time', () => {
    const state: ConversationState = {
      step: 'confirming_modify', status: 'done', service_name: 'Coupe',
      date: '2026-04-08', time: '16:00', booking_id: 'booking-uuid-1',
    }
    const intent: IntentResult = { intent: 'unknown', confidence: 'low', service_name: null, date_raw: null, time_raw: null }
    const { nextState, replyText } = processIntent(state, intent, mockServices, 'oui')
    expect(nextState.step).toBe('confirmed')
    expect(nextState.status).toBe('done')
    expect(replyText).toContain('modifie')
  })

  it('confirming_modify + non transitions to confirmed_modify_abandoned (no DB update signal)', () => {
    const state: ConversationState = {
      step: 'confirming_modify', status: 'done', service_name: 'Coupe',
      date: '2026-04-08', time: '16:00', booking_id: 'booking-uuid-1',
    }
    const intent: IntentResult = { intent: 'unknown', confidence: 'low', service_name: null, date_raw: null, time_raw: null }
    const { nextState, replyText } = processIntent(state, intent, mockServices, 'non')
    expect(nextState.step).toBe('confirmed_modify_abandoned')
    expect(nextState.booking_id).toBe('booking-uuid-1')
    expect(replyText).toContain('maintenu')
  })
})
