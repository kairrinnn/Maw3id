export interface Tenant {
  id: string
  slug: string
  name: string
  plan: 'starter' | 'booking_ai' | 'pro'
  is_active: boolean
  created_at: string
}

export interface PhoneNumber {
  id: string
  tenant_id: string
  phone_number_id: string
  waba_id: string
  display_phone: string
  status: 'pending' | 'active' | 'suspended'
  created_at: string
}

export interface TenantUser {
  id: string
  tenant_id: string
  user_id: string
  role: 'admin' | 'staff'
}

export interface BotConfig {
  id: string
  tenant_id: string
  system_prompt: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Service {
  id: string
  tenant_id: string
  name: string
  duration_minutes: number
  price_mad: number | null
  active: boolean
}

export interface Schedule {
  id: string
  tenant_id: string
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6
  open_time: string
  close_time: string
  closed: boolean
}

export type ConversationStatus =
  | 'IDLE'
  | 'COLLECTING_SERVICE'
  | 'COLLECTING_DATETIME'
  | 'CONFIRMING'
  | 'BOOKED'
  | 'MODIFYING'
  | 'CANCELLING'

export interface ConversationState {
  status: ConversationStatus
  serviceId?: string
  serviceName?: string
  date?: string
  time?: string
  slotId?: string
  bookingId?: string
}

export interface Conversation {
  id: string
  tenant_id: string
  wa_id: string
  state: ConversationState
  last_customer_message_at: string | null
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  tenant_id: string
  conversation_id: string | null
  service_id: string
  client_wa_id: string
  client_name: string | null
  appointment_at: string
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  reminder_sent: boolean
  created_at: string
}

export interface WhatsappTemplate {
  id: string
  tenant_id: string
  template_name: string
  meta_status: 'pending' | 'approved' | 'rejected'
  language: string
  body_text: string
  created_at: string
}
