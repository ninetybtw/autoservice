/**
 * Публичная запись клиента без регистрации.
 * POST { action: 'create' | 'get' | 'cancel' | 'push', ... }
 * Свободное время перепроверяется на сервере, а пересечения в боксе
 * дополнительно запрещены ограничением bookings_no_overlap в базе.
 */
import { z } from 'zod';
import { admin, corsHeaders, fail, json, loadStudio } from '../_shared/http.ts';
import { createBookingSchema, type Booking, type BusyInterval } from '../_shared/domain/schema.ts';
import { busyQueryRange, checkSlot, SLOT_ERROR_TEXT } from '../_shared/domain/slots.ts';
import { canClientCancel } from '../_shared/domain/policy.ts';
import { BOOKING_COLUMNS, bookingToRow, generateToken, hashToken, rowToBooking, toPublicBooking, type BookingRow } from '../_shared/domain/db.ts';

const db = admin();

const accessSchema = z.object({ id: z.string().uuid(), token: z.string().min(10).max(100) });
const pushSchema = accessSchema.extend({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(4) }),
  }),
});

async function busyFor(studioId: string, from: Date, to: Date): Promise<BusyInterval[]> {
  const { data, error } = await db.rpc('get_busy', { p_studio: studioId, p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw error;
  return (data ?? []).map((r: { bay: number; start_at: string; block_end: string }) => ({ bay: r.bay, start: r.start_at, end: r.block_end }));
}

async function findBooking(id: string, token: string): Promise<{ booking: Booking; slug: string } | null> {
  const { data } = await db
    .from('bookings')
    .select(`${BOOKING_COLUMNS}, manage_token_hash, studios(slug)`)
    .eq('id', id)
    .maybeSingle();
  if (!data || data.manage_token_hash !== (await hashToken(token))) return null;
  return { booking: rowToBooking(data as unknown as BookingRow), slug: (data as unknown as { studios: { slug: string } }).studios.slug };
}

async function create(body: unknown): Promise<Response> {
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте данные', 422, 'invalid');
  const input = parsed.data;
  const studio = await loadStudio(db, { slug: input.slug });
  if (!studio) return fail('Студия не найдена', 404);
  const service = studio.settings.services.find((s) => s.id === input.serviceId && s.active);
  if (!service) return fail('Услуга не найдена', 404);

  const now = new Date();
  const startAt = new Date(input.startAt);
  const range = busyQueryRange(studio.settings, now);
  const token = generateToken();
  const tokenHash = await hashToken(token);

  // Две попытки: если бокс заняли между проверкой и вставкой, пробуем другой
  for (let attempt = 0; attempt < 2; attempt++) {
    const busy = await busyFor(studio.id, range.from, range.to);
    const check = checkSlot(studio.settings, service, startAt, busy, now);
    if (!check.ok) return fail(SLOT_ERROR_TEXT[check.reason], 409, check.reason);
    const row = {
      ...bookingToRow({
        studioId: studio.id,
        serviceId: service.id,
        serviceName: service.name,
        price: service.price,
        bay: check.bay,
        startAt: check.timing.start.toISOString(),
        endAt: check.timing.workEnd.toISOString(),
        blockEnd: check.timing.blockEnd.toISOString(),
        status: 'booked',
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        car: input.car,
        comment: input.comment,
        source: 'client',
      }),
      manage_token_hash: tokenHash,
    };
    const { data, error } = await db.from('bookings').insert(row).select(BOOKING_COLUMNS).single();
    if (!error && data) return json({ booking: toPublicBooking(rowToBooking(data as BookingRow)), token });
    if (error?.code !== '23P01') {
      console.error('insert booking failed', error);
      return fail('Не удалось создать запись. Попробуйте ещё раз.', 500);
    }
  }
  return fail(SLOT_ERROR_TEXT.busy, 409, 'busy');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Некорректный запрос');
  }

  try {
    switch (body.action) {
      case 'create':
        return await create(body);
      case 'get': {
        const a = accessSchema.safeParse(body);
        if (!a.success) return fail('Запись не найдена', 404);
        const found = await findBooking(a.data.id, a.data.token);
        if (!found) return fail('Запись не найдена', 404);
        return json({ booking: toPublicBooking(found.booking), slug: found.slug });
      }
      case 'cancel': {
        const a = accessSchema.safeParse(body);
        if (!a.success) return fail('Запись не найдена', 404);
        const found = await findBooking(a.data.id, a.data.token);
        if (!found) return fail('Запись не найдена', 404);
        const studio = await loadStudio(db, { id: found.booking.studioId });
        if (!studio) return fail('Студия не найдена', 404);
        const can = canClientCancel(studio.settings, found.booking, new Date());
        if (!can.ok) return fail(can.reason, 409, 'cancel_forbidden');
        const { data, error } = await db
          .from('bookings')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('id', a.data.id)
          .select(BOOKING_COLUMNS)
          .single();
        if (error) throw error;
        return json({ booking: toPublicBooking(rowToBooking(data as BookingRow)) });
      }
      case 'push': {
        const a = pushSchema.safeParse(body);
        if (!a.success) return fail('Некорректная подписка');
        const found = await findBooking(a.data.id, a.data.token);
        if (!found) return fail('Запись не найдена', 404);
        const { error } = await db.from('push_subscriptions').upsert(
          {
            booking_id: a.data.id,
            endpoint: a.data.subscription.endpoint,
            p256dh: a.data.subscription.keys.p256dh,
            auth: a.data.subscription.keys.auth,
          },
          { onConflict: 'booking_id,endpoint' },
        );
        if (error) throw error;
        return json({ ok: true });
      }
      default:
        return fail('Неизвестное действие');
    }
  } catch (err) {
    console.error(err);
    return fail('Ошибка сервера', 500);
  }
});
