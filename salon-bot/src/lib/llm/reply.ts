import Anthropic from '@anthropic-ai/sdk'
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

export function buildReplySystemPrompt(salonName: string, services: string[] = [], lang: 'fr' | 'ar' = 'fr'): string {
  const langInstruction = lang === 'ar'
    ? 'Reponds en arabe marocain (darija). Tu peux melanger avec le francais si c\'est naturel.'
    : 'Reponds en francais.'
  const servicesRule = services.length > 0
    ? `- Services proposes par le salon : ${services.join(', ')}. Ne mentionne AUCUN autre service.\n- Si le client demande un service absent de cette liste, dis que vous ne le proposez pas et cite les services disponibles.`
    : `- Ne mentionne aucun service specifique.`
  return `Tu es la receptionniste de ${salonName}. Tu reponds comme une vraie personne, pas comme un chatbot.
Regles :
- Maximum 2 phrases. Chaque phrase : 10 mots maximum. Courtes, naturelles.
- Interdit : "que puis-je vous proposer", "comment puis-je vous aider", "n hesitez pas", et toute formule generique de chatbot.
- ${langInstruction}
${servicesRule}
- Ne jamais mentionner de prix. Si le client demande un prix, dis-lui de contacter le salon.
- Texte brut. Pas d'emojis, pas de markdown.
- Ne jamais reveler que tu es une IA.
- Une expression darija (inshallah, mabrook) au maximum, seulement si vraiment naturelle.`
}

export function buildReplyPrompt(context: ReplyContext): string {
  let prompt: string

  if (context.conflict === true) {
    prompt = 'Ce creneau est deja pris. Demande-lui de choisir une autre heure avec empathie.'
  } else {
    switch (context.nextStep) {
      case 'awaiting_service': {
        const list = context.services?.length ? context.services.join(', ') : null
        if (context.currentStep === 'greeting') {
          prompt = list
            ? `Le client vient de saluer. Reponds par un bonjour court et naturel, puis annonce les services (${list}) et demande ce qu'il souhaite.`
            : `Le client vient de saluer. Reponds par un bonjour court et demande ce qu'il souhaite reserver.`
        } else {
          prompt = list
            ? `Le client veut reserver. Annonce les services disponibles (${list}) et demande lequel il choisit.`
            : `Le client veut reserver. Demande-lui quel service il souhaite.`
        }
        break
      }
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
        prompt = `Le client dit: '${context.userMessage}'. Si c'est hors sujet ou incomprehensible, recentre poliment sur la prise de rendez-vous.`
    }
  }

  return `${prompt}\n\nLe client a ecrit: '${context.userMessage}'`
}

async function callHaikuForReply(context: ReplyContext): Promise<string | undefined> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    system: buildReplySystemPrompt(context.salonName, context.services ?? [], context.lang ?? 'fr'),
    messages: [{ role: 'user', content: buildReplyPrompt(context) }],
  })
  const block = message.content[0]
  return block.type === 'text' ? block.text.trim() : undefined
}

export async function generateReply(context: ReplyContext): Promise<string> {
  const fallback =
    FALLBACK_REPLIES[context.conflict ? 'conflict' : context.nextStep] ?? FALLBACK_REPLIES.default

  if (process.env.SKIP_LLM === 'true') return fallback

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Haiku reply timeout')), REPLY_TIMEOUT_MS)
    )
    const result = await Promise.race([callHaikuForReply(context), timeoutPromise])
    return result ?? fallback
  } catch (err) {
    console.error('[reply] Haiku reply failed, using fallback:', err)
    return fallback
  }
}
