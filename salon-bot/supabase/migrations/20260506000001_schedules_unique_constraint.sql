-- Phase 6 / DASH-02: Add UNIQUE(tenant_id, day_of_week) so upsert with onConflict works
-- Without this constraint, supabase.upsert(...,{ onConflict: 'tenant_id,day_of_week' }) throws Postgres 42P10
-- Idempotent — uses ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS pattern via DO block

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedules_tenant_day_unique'
      AND conrelid = 'public.schedules'::regclass
  ) THEN
    ALTER TABLE public.schedules
      ADD CONSTRAINT schedules_tenant_day_unique UNIQUE (tenant_id, day_of_week);
  END IF;
END$$;
