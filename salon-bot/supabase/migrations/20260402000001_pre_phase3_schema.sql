-- Pre-Phase 3 schema corrections
-- Fixes: broken bookings UNIQUE, missing staff table, per-tenant token, message history

-- ============================================================
-- 1. staff table
-- ============================================================
CREATE TABLE public.staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_staff_tenant_id ON public.staff(tenant_id);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_tenant_select" ON public.staff
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "staff_tenant_insert" ON public.staff
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "staff_tenant_update" ON public.staff
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "staff_tenant_delete" ON public.staff
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));

-- ============================================================
-- 2. bookings: add staff_id, fix broken UNIQUE constraint
-- ============================================================
ALTER TABLE public.bookings
  ADD COLUMN staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT bookings_tenant_id_appointment_at_key;

-- When staff is assigned: one slot per (salon, coiffeur, time)
CREATE UNIQUE INDEX bookings_tenant_staff_time_uq
  ON public.bookings(tenant_id, staff_id, appointment_at)
  WHERE staff_id IS NOT NULL;

-- When no staff assigned (solo salon): one slot per (salon, time)
CREATE UNIQUE INDEX bookings_tenant_time_nostaff_uq
  ON public.bookings(tenant_id, appointment_at)
  WHERE staff_id IS NULL;

CREATE INDEX idx_bookings_staff_id ON public.bookings(staff_id);

-- ============================================================
-- 3. phone_numbers: per-tenant encrypted token (Phase 7)
-- ============================================================
ALTER TABLE public.phone_numbers
  ADD COLUMN access_token_enc TEXT;

-- ============================================================
-- 4. messages table — conversation history for LLM context
-- ============================================================
CREATE TABLE public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type    TEXT NOT NULL DEFAULT 'text',
  content         JSONB NOT NULL,
  wamid           TEXT UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_tenant_id       ON public.messages(tenant_id);
CREATE INDEX idx_messages_created_at      ON public.messages(conversation_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_tenant_select" ON public.messages
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "messages_tenant_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));
