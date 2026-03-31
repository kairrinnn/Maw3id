-- INFRA-01: Multi-tenant schema with tenant_id indexed on all tables

CREATE TABLE public.tenants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  plan         TEXT DEFAULT 'starter',
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.phone_numbers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_number_id  TEXT UNIQUE NOT NULL,
  waba_id          TEXT NOT NULL,
  display_phone    TEXT NOT NULL,
  status           TEXT DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_phone_numbers_phone_number_id ON public.phone_numbers(phone_number_id);
CREATE INDEX idx_phone_numbers_tenant_id ON public.phone_numbers(tenant_id);

CREATE TABLE public.tenant_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT DEFAULT 'admin',
  UNIQUE(tenant_id, user_id)
);
CREATE INDEX idx_tenant_users_user_id ON public.tenant_users(user_id);
CREATE INDEX idx_tenant_users_tenant_id ON public.tenant_users(tenant_id);

CREATE TABLE public.bot_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID UNIQUE NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  system_prompt   TEXT,
  active          BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.services (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  price_mad        NUMERIC(10,2),
  active           BOOLEAN DEFAULT true
);
CREATE INDEX idx_services_tenant_id ON public.services(tenant_id);

CREATE TABLE public.schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time    TIME NOT NULL,
  close_time   TIME NOT NULL,
  closed       BOOLEAN DEFAULT false
);
CREATE INDEX idx_schedules_tenant_id ON public.schedules(tenant_id);

CREATE TABLE public.conversations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id),
  wa_id                    TEXT NOT NULL,
  state                    JSONB NOT NULL DEFAULT '{"status":"IDLE"}',
  last_customer_message_at TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, wa_id)
);
CREATE INDEX idx_conversations_tenant_wa ON public.conversations(tenant_id, wa_id);

CREATE TABLE public.bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id),
  conversation_id UUID REFERENCES public.conversations(id),
  service_id      UUID NOT NULL REFERENCES public.services(id),
  client_wa_id    TEXT NOT NULL,
  client_name     TEXT,
  appointment_at  TIMESTAMPTZ NOT NULL,
  status          TEXT DEFAULT 'confirmed',
  reminder_sent   BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, appointment_at)
);
CREATE INDEX idx_bookings_tenant_appointment ON public.bookings(tenant_id, appointment_at);
CREATE INDEX idx_bookings_reminder ON public.bookings(appointment_at, reminder_sent)
  WHERE status = 'confirmed' AND reminder_sent = false;

CREATE TABLE public.whatsapp_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id),
  template_name   TEXT NOT NULL,
  meta_status     TEXT DEFAULT 'pending',
  language        TEXT DEFAULT 'fr',
  body_text       TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, template_name)
);
CREATE INDEX idx_whatsapp_templates_tenant_id ON public.whatsapp_templates(tenant_id);
