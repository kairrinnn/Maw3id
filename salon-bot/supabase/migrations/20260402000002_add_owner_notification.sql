-- Phase 4: Add owner notification WhatsApp ID to bot_configs (BOOK-07)
ALTER TABLE public.bot_configs
  ADD COLUMN owner_notification_wa_id TEXT;

COMMENT ON COLUMN public.bot_configs.owner_notification_wa_id IS
  'Owner WhatsApp number for receiving cancellation/booking notifications. NULL = no notifications.';
