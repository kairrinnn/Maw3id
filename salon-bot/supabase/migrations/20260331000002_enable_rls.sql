-- INFRA-02: RLS enabled by default DENY on all tenant-owned tables

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Helper: extract tenant_id from JWT custom claim
-- Wrapping in SELECT allows Postgres to cache per statement, not per row
CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::UUID
$$;

-- === services policies ===
CREATE POLICY "services_tenant_select" ON public.services
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "services_tenant_insert" ON public.services
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "services_tenant_update" ON public.services
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "services_tenant_delete" ON public.services
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));

-- === schedules policies ===
CREATE POLICY "schedules_tenant_select" ON public.schedules
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "schedules_tenant_insert" ON public.schedules
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "schedules_tenant_update" ON public.schedules
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "schedules_tenant_delete" ON public.schedules
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));

-- === conversations policies ===
CREATE POLICY "conversations_tenant_select" ON public.conversations
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "conversations_tenant_insert" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "conversations_tenant_update" ON public.conversations
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));

-- === bookings policies ===
CREATE POLICY "bookings_tenant_select" ON public.bookings
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "bookings_tenant_insert" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "bookings_tenant_update" ON public.bookings
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));

-- === bot_configs policies ===
CREATE POLICY "bot_configs_tenant_select" ON public.bot_configs
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "bot_configs_tenant_insert" ON public.bot_configs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "bot_configs_tenant_update" ON public.bot_configs
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));

-- === phone_numbers policies ===
CREATE POLICY "phone_numbers_tenant_select" ON public.phone_numbers
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "phone_numbers_tenant_insert" ON public.phone_numbers
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));

-- === whatsapp_templates policies ===
CREATE POLICY "whatsapp_templates_tenant_select" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "whatsapp_templates_tenant_insert" ON public.whatsapp_templates
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));
CREATE POLICY "whatsapp_templates_tenant_update" ON public.whatsapp_templates
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));

-- === tenant_users: user can only see their own membership ===
CREATE POLICY "tenant_users_select_own" ON public.tenant_users
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
