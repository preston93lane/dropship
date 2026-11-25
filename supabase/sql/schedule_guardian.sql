-- Run once in the Supabase SQL editor AFTER deploying the guardian function.
-- Stores the function URL + cron secret in Supabase Vault, then schedules the
-- guardian every 30 minutes with pg_cron + pg_net.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co/functions/v1/guardian', 'guardian_url');
select vault.create_secret('YOUR_GUARDIAN_CRON_SECRET', 'guardian_cron_secret');

select cron.schedule(
  'dropship-guardian',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'guardian_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'guardian_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Inspect runs:   select * from cron.job_run_details order by start_time desc limit 20;
-- Pause:          select cron.unschedule('dropship-guardian');
