-- Phase 5 / TPL-02: Schedule reminder dispatch every 5 minutes via pg_cron + pg_net
-- HOSTED SUPABASE ONLY — pg_cron in local dev cannot reach localhost:3000 (research pitfall #3)
--
-- Prerequisites (set ONCE in hosted Supabase Studio -> Project Settings -> Database -> Custom Postgres Config,
-- or via SQL as a superuser before applying this migration):
--   ALTER DATABASE postgres SET app.cron_secret = '<same value as CRON_SECRET env var on Vercel/host>';
--   ALTER DATABASE postgres SET app.app_url    = 'https://<production-host>';
--
-- Local dev: SKIP this migration (trigger reminders manually via curl):
--   curl -X POST http://localhost:3000/api/reminders/send -H "x-cron-secret: $CRON_SECRET"

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any pre-existing job with the same name (idempotent re-apply)
SELECT cron.unschedule('send-appointment-reminders')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-appointment-reminders'
);

SELECT cron.schedule(
  'send-appointment-reminders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.app_url') || '/api/reminders/send',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Phase 5: schedules reminder dispatch every 5 minutes';
