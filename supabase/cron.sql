-- Расписание push-напоминаний. Выполните один раз в SQL Editor Supabase,
-- подставив адрес проекта и значение CRON_SECRET (то же, что в секретах функций).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-booking-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
