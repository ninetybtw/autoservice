/**
 * Push-напоминания за сутки до записи. Вызывается по расписанию (pg_cron, см. supabase/cron.sql)
 * с заголовком Authorization: Bearer <CRON_SECRET>.
 * Переменные: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), CRON_SECRET, APP_URL.
 */
import webpush from 'web-push';
import { admin, fail, json, loadStudio } from '../_shared/http.ts';
import { formatWhen } from '../_shared/domain/format.ts';

const db = admin();
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);
const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) return fail('Forbidden', 403);

  const now = new Date();
  const until = new Date(now.getTime() + 24 * 3_600_000);
  const { data: due, error } = await db
    .from('bookings')
    .select('id, studio_id, service_name, start_at, push_subscriptions(id, endpoint, p256dh, auth), studios(slug)')
    .eq('status', 'booked')
    .is('reminder_sent_at', null)
    .gt('start_at', now.toISOString())
    .lte('start_at', until.toISOString())
    .limit(200);
  if (error) return fail(error.message, 500);

  let sent = 0;
  for (const b of due ?? []) {
    const subs = (b.push_subscriptions ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[];
    if (subs.length === 0) continue;
    const studio = await loadStudio(db, { id: b.studio_id });
    if (!studio) continue;
    const slug = (b.studios as unknown as { slug: string }).slug;
    const payload = JSON.stringify({
      title: `Напоминание: ${studio.settings.name}`,
      body: `${b.service_name} — ${formatWhen(b.start_at, now, studio.settings.timezone)}. Адрес: ${studio.settings.contacts.address}`,
      url: `${appUrl}/${slug}/my/${b.id}`,
      tag: `booking-${b.id}`,
    });
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
        else console.error('push failed', status, err);
      }
    }
    await db.from('bookings').update({ reminder_sent_at: now.toISOString() }).eq('id', b.id);
  }
  return json({ checked: due?.length ?? 0, sent });
});
