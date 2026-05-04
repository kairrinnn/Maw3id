export interface WebhookMetadata {
  display_phone_number: string
  phone_number_id: string
}

export interface WebhookContact {
  profile: { name: string }
  wa_id: string
}

export interface WebhookTextMessage {
  from: string
  id: string          // wamid
  timestamp: string   // Unix timestamp as string
  type: 'text'
  text: { body: string }
}

export interface WebhookNonTextMessage {
  from: string
  id: string
  timestamp: string
  type: 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contacts' | 'interactive' | 'button'
}

export type WebhookMessage = WebhookTextMessage | WebhookNonTextMessage

export interface WebhookValue {
  messaging_product: 'whatsapp'
  metadata: WebhookMetadata
  contacts?: WebhookContact[]
  messages?: WebhookMessage[]
}

export interface WebhookChange {
  value: WebhookValue
  field: string
}

export interface WebhookEntry {
  id: string
  changes: WebhookChange[]
}

export interface WebhookPayload {
  object: 'whatsapp_business_account'
  entry: WebhookEntry[]
}

// Template message types
export interface TemplateComponent {
  type: 'body' | 'header' | 'footer' | 'button'
  parameters?: Array<{ type: 'text'; text: string }>
}

export interface SendTemplatePayload {
  to: string
  templateName: string
  languageCode: string
  phoneNumberId: string  // required for multi-tenant — each tenant has own phone_number_id
  components?: TemplateComponent[]
}
