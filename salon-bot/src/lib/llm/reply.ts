import { GoogleGenAI } from '@google/genai'
import type { ReplyContext } from './types'

export const REPLY_TIMEOUT_MS = 3000

export const FALLBACK_REPLIES: Record<string, string> = {
  greeting: 'Bonjour! Comment puis-je vous aider?',
  awaiting_service: 'Quel service souhaitez-vous?',
  awaiting_datetime: 'Quand souhaitez-vous votre rendez-vous? (ex: demain a 15h)',
  confirming: "C'est bien ca? (oui/non)",
  confirmed: 'Votre rendez-vous est confirme.',
  cancelling: 'Votre annulation a ete traitee.',
  cancelled: "D'accord, j'annule votre demande en cours.",
  modify_awaiting_datetime: 'Quand souhaitez-vous deplacer votre rendez-vous?',
  confirming_modify: 'Confirmer ce changement? (oui/non)',
  confirmed_modify_abandoned: 'Modification annulee. Votre rendez-vous original est maintenu.',
  conflict: 'Ce creneau est deja pris. Voulez-vous choisir une autre heure?',
  default: "Je n'ai pas compris. Puis-je vous aider a reserver un rendez-vous?",
}

export function buildReplySystemPrompt(salonName: string): string {
  return `Tu es l'assistante virtuelle de ${salonName}, un salon de beaute marocain.
Tu reponds en francais avec une touche chaleureuse marocaine.
Tu peux ajouter une expression darija (inshallah, mabrook, wakha) au maximum une fois par message, et seulement si c'est naturel.
Tes reponses sont courtes (1-3 phrases maximum), chaleureuses, et directes.
Tu ne dois jamais mentionner que tu es une IA ou un bot.
Tu ne dois jamais utiliser de markdown, d'emojis, ou de mise en forme speciale.
Reponds uniquement en texte brut.`
}

export function buildReplyPrompt(context: ReplyContext): string {
  let prompt: string

  if (context.conflict === true) {
    prompt = 'Ce creneau est deja pris. Demande-lui de choisir une autre heure avec empathie.'
  } else {
    switch (context.nextStep) {
      case 'awaiting_service':
        prompt = 'Le client veut reserver. Demande-lui quel service il souhaite.'
        break
      case 'awaiting_datetime':
        prompt = `Le client a choisi ${context.serviceName}. Demande-lui quand il souhaite son rendez-vous (date et heure).`
        break
      case 'confirming':
        prompt = `Confirme les details au client: ${context.serviceName} le ${context.date} a ${context.time}. Demande-lui de confirmer oui ou non.`
        break
      case 'confirmed':
        prompt = `La reservation est confirmee: ${context.serviceName} le ${context.date} a ${context.time}. Felicite le client chaleureusement.`
        break
      case 'cancelling':
        prompt = "Le client annule son rendez-vous. Confirme l'annulation avec empathie."
        break
      case 'cancelled':
        prompt = "Le client a annule sa demande en cours. Confirme et propose de l'aider autrement."
        break
      case 'modify_awaiting_datetime':
        prompt = 'Le client veut modifier son rendez-vous. Demande-lui la nouvelle date et heure.'
        break
      case 'confirming_modify':
        prompt = `Confirme le deplacement: ${context.serviceName} au ${context.date} a ${context.time}. Demande oui ou non.`
        break
      case 'confirmed_modify_abandoned':
        prompt = "Le client a refuse la modification. Son rendez-vous original est maintenu. Rassure-le."
        break
      default:
        prompt = `Le client a dit: '${context.userMessage}'. Aide-le a reserver un rendez-vous.`
    }
  }

  return `${prompt}\n\nLe client a ecrit: '${context.userMessage}'`
}

async function callGeminiForReply(context: ReplyContext): Promise<string | undefined> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: buildReplyPrompt(context) }] }],
    config: {
      systemInstruction: buildReplySystemPrompt(context.salonName),
      temperature: 0.7,
      maxOutputTokens: 120,
    },
  })
  return response.text
}

export async function generateReply(context: ReplyContext): Promise<string> {
  const fallback =
    FALLBACK_REPLIES[context.conflict ? 'conflict' : context.nextStep] ?? FALLBACK_REPLIES.default

  if (process.env.SKIP_LLM === 'true') return fallback

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini reply timeout')), REPLY_TIMEOUT_MS)
    )
    const result = await Promise.race([callGeminiForReply(context), timeoutPromise])
    return result ?? fallback
  } catch (err) {
    console.error('[reply] Gemini reply failed, using fallback:', err)
    return fallback
  }
}
