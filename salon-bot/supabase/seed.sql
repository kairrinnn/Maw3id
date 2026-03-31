-- Dev seed: creates a test tenant and bot config
-- NOTE: tenant_users row requires a real auth.users ID — created after first signup

INSERT INTO public.tenants (id, slug, name, plan, is_active)
VALUES ('a0000000-0000-0000-0000-000000000001', 'salon-test', 'Salon Test Dev', 'starter', true);

INSERT INTO public.bot_configs (tenant_id, system_prompt, active)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Tu es un assistant de réservation pour un salon de coiffure.', false);

INSERT INTO public.services (tenant_id, name, duration_minutes, price_mad, active)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Coupe Homme', 30, 50.00, true),
  ('a0000000-0000-0000-0000-000000000001', 'Coupe Femme', 45, 80.00, true),
  ('a0000000-0000-0000-0000-000000000001', 'Coloration', 60, 150.00, true);

INSERT INTO public.schedules (tenant_id, day_of_week, open_time, close_time, closed)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 0, '09:00', '18:00', false),
  ('a0000000-0000-0000-0000-000000000001', 1, '09:00', '18:00', false),
  ('a0000000-0000-0000-0000-000000000001', 2, '09:00', '18:00', false),
  ('a0000000-0000-0000-0000-000000000001', 3, '09:00', '18:00', false),
  ('a0000000-0000-0000-0000-000000000001', 4, '09:00', '18:00', false),
  ('a0000000-0000-0000-0000-000000000001', 5, '09:00', '13:00', false),
  ('a0000000-0000-0000-0000-000000000001', 6, '00:00', '00:00', true);
