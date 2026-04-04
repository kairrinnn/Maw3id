import { resolveDate, resolveTime } from './resolver'
import { type ConversationState, type IntentResult, type Service } from './types'

export interface ProcessResult {
  nextState: ConversationState
  replyText: string
}

// Exported for testing
export const MODIFY_KEYWORDS = /\b(modifier|changer|reporter|deplacer|nouvelle\s*heure|changer.*heure)\b/i

// Steps where no DB booking exists yet — global cancel override applies here only
const IN_PROGRESS_STEPS = ['awaiting_service', 'awaiting_datetime', 'confirming']

export function processIntent(
  state: ConversationState,
  intent: IntentResult,
  services: Service[],
  confirmText?: string
): ProcessResult {
  // Global override: cancel intent for IN-PROGRESS steps only (no DB booking yet)
  if (intent.intent === 'cancel' && IN_PROGRESS_STEPS.includes(state.step)) {
    return {
      nextState: { step: 'cancelled', status: 'failed' },
      replyText: "D'accord, j'annule votre demande en cours.",
    }
  }

  const serviceList = services.map(s => `- ${s.name}`).join('\n')

  switch (state.step) {
    case 'greeting': {
      if (intent.intent === 'book' || intent.service_name) {
        return processIntent({ ...state, step: 'awaiting_service' }, intent, services, confirmText)
      }
      if (intent.intent === 'greeting') {
        return {
          nextState: state,
          replyText: 'Bonjour! Comment puis-je vous aider? Vous pouvez reserver un rendez-vous.',
        }
      }
      if (intent.intent === 'cancel') {
        return {
          nextState: state,
          replyText: "Vous n'avez pas de reservation en cours.",
        }
      }
      if (intent.intent === 'query') {
        return {
          nextState: state,
          replyText: 'UPCOMING_BOOKINGS_PLACEHOLDER',
        }
      }
      return {
        nextState: state,
        replyText: "Je n'ai pas compris. Vous pouvez me dire quel service vous souhaitez reserver.",
      }
    }

    case 'awaiting_service': {
      if (!intent.service_name) {
        return {
          nextState: state,
          replyText: `Quel service souhaitez-vous?\n${serviceList}`,
        }
      }

      const query = intent.service_name.toLowerCase()
      const matches = services.filter(s =>
        s.name.toLowerCase().includes(query) || query.includes(s.name.toLowerCase())
      )

      if (matches.length === 1) {
        const service = matches[0]
        const newState: ConversationState = {
          ...state,
          step: 'awaiting_datetime',
          service_id: service.id,
          service_name: service.name,
        }
        return processIntent(newState, intent, services, confirmText)
      }

      if (matches.length === 0) {
        return {
          nextState: state,
          replyText: `Je ne trouve pas ce service. Voici nos services:\n${serviceList}`,
        }
      }

      const matchNames = matches.map(m => `- ${m.name}`).join('\n')
      return {
        nextState: state,
        replyText: `Plusieurs services correspondent. Lequel souhaitez-vous?\n${matchNames}`,
      }
    }

    case 'awaiting_datetime': {
      const resolvedDate = resolveDate(intent.date_raw) || state.date
      const resolvedTime = resolveTime(intent.time_raw) || state.time

      const newState: ConversationState = {
        ...state,
        date: resolvedDate || undefined,
        time: resolvedTime || undefined,
      }

      if (resolvedDate && resolvedTime) {
        return {
          nextState: { ...newState, step: 'confirming' },
          replyText: `Vous souhaitez ${newState.service_name} le ${resolvedDate} a ${resolvedTime}. C'est bien ca? (oui/non)`,
        }
      }

      if (resolvedDate && !resolvedTime) {
        return {
          nextState: newState,
          replyText: 'A quelle heure souhaitez-vous votre rendez-vous?',
        }
      }

      if (!resolvedDate && resolvedTime) {
        return {
          nextState: newState,
          replyText: 'Quel jour souhaitez-vous votre rendez-vous?',
        }
      }

      return {
        nextState: state,
        replyText: 'Quand souhaitez-vous votre rendez-vous? (ex: demain a 15h)',
      }
    }

    case 'confirming': {
      const text = confirmText?.toLowerCase().trim() || ''
      const isYes = /^(oui|yes|ok|wakha|waxxa|d'accord|daccord|ouais)$/i.test(text)
      const isNo = /^(non|no|la|lala|annuler)$/i.test(text)

      if (isYes) {
        return {
          nextState: { ...state, step: 'confirmed', status: 'done' },
          replyText: `Parfait! Votre rendez-vous est confirme: ${state.service_name} le ${state.date} a ${state.time}.`,
        }
      }

      if (isNo) {
        return {
          nextState: { ...state, step: 'cancelled', status: 'failed' },
          replyText: "D'accord, votre rendez-vous a ete annule.",
        }
      }

      return {
        nextState: state,
        replyText: 'Veuillez repondre par oui ou non.',
      }
    }

    case 'confirmed': {
      // Cancel a confirmed booking -> transition to cancelling (route handles DB)
      if (intent.intent === 'cancel') {
        return {
          nextState: { ...state, step: 'cancelling', status: 'in_progress' },
          replyText: 'Votre rendez-vous va etre annule.',
        }
      }

      // Modify a confirmed booking
      if (intent.intent === 'modify' || (confirmText && MODIFY_KEYWORDS.test(confirmText))) {
        return {
          nextState: { ...state, step: 'modify_awaiting_datetime' },
          replyText: 'Quand souhaitez-vous deplacer votre rendez-vous? (ex: vendredi a 16h)',
        }
      }

      // Query upcoming bookings
      if (intent.intent === 'query') {
        return {
          nextState: state,
          replyText: 'UPCOMING_BOOKINGS_PLACEHOLDER',
        }
      }

      // Any other intent at confirmed: start a new booking flow
      return processIntent({ step: 'greeting', status: 'idle' }, intent, services, confirmText)
    }

    case 'cancelling': {
      // Route should handle DB before FSM reaches this again.
      return {
        nextState: { step: 'greeting', status: 'idle' },
        replyText: 'Votre annulation a ete traitee. Comment puis-je vous aider?',
      }
    }

    case 'modify_awaiting_datetime': {
      const resolvedDate = resolveDate(intent.date_raw) || state.date
      const resolvedTime = resolveTime(intent.time_raw) || state.time

      const newState: ConversationState = {
        ...state,
        date: resolvedDate || undefined,
        time: resolvedTime || undefined,
      }

      if (resolvedDate && resolvedTime) {
        return {
          nextState: { ...newState, step: 'confirming_modify' },
          replyText: `Vous souhaitez deplacer votre rendez-vous au ${resolvedDate} a ${resolvedTime}. C'est bien ca? (oui/non)`,
        }
      }

      if (resolvedDate && !resolvedTime) {
        return {
          nextState: newState,
          replyText: 'A quelle heure souhaitez-vous deplacer votre rendez-vous?',
        }
      }

      if (!resolvedDate && resolvedTime) {
        return {
          nextState: newState,
          replyText: 'Quel jour souhaitez-vous deplacer votre rendez-vous?',
        }
      }

      return {
        nextState: state,
        replyText: 'Quand souhaitez-vous deplacer votre rendez-vous? (ex: vendredi a 16h)',
      }
    }

    case 'confirming_modify': {
      const text = confirmText?.toLowerCase().trim() || ''
      const isYes = /^(oui|yes|ok|wakha|waxxa|d'accord|daccord|ouais)$/i.test(text)
      const isNo = /^(non|no|la|lala|annuler)$/i.test(text)

      if (isYes) {
        return {
          nextState: { ...state, step: 'confirmed', status: 'done' },
          replyText: `Votre rendez-vous a ete modifie: ${state.service_name} le ${state.date} a ${state.time}.`,
        }
      }

      if (isNo) {
        // Abandon modification — keep original booking, signal to route via distinct step
        // Route detects 'confirmed_modify_abandoned' and saves as 'confirmed' without calling modifyBooking()
        return {
          nextState: { ...state, step: 'confirmed_modify_abandoned', status: 'done' },
          replyText: 'Modification annulee. Votre rendez-vous original est maintenu.',
        }
      }

      return {
        nextState: state,
        replyText: 'Veuillez repondre par oui ou non.',
      }
    }

    case 'confirmed_modify_abandoned': {
      // Normalized to 'confirmed' by route before saving. If FSM sees this, reset to greeting.
      return processIntent({ step: 'greeting', status: 'idle' }, intent, services, confirmText)
    }

    case 'cancelled': {
      return processIntent({ step: 'greeting', status: 'idle' }, intent, services, confirmText)
    }

    default:
      return {
        nextState: { step: 'greeting', status: 'idle' },
        replyText: 'Bonjour! Comment puis-je vous aider?',
      }
  }
}
