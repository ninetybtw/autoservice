/**
 * Помощник клиента и владельца.
 * POST { slug, mode: 'client' | 'owner', messages: [{ role, content }] }
 * Модель задаётся переменными окружения сервера:
 *   OPENAI_API_KEY  — ключ; без него работает встроенный помощник без модели
 *   OPENAI_MODEL    — модель (по умолчанию gpt-5-mini)
 *   OPENAI_BASE_URL — необязательно, для совместимых API
 */
import OpenAI from 'openai';
import { z } from 'zod';
import { admin, corsHeaders, fail, json, loadStudio, ownerOf } from '../_shared/http.ts';
import { fallbackReply } from '../_shared/domain/assistant/fallback.ts';
import { llmReply } from '../_shared/domain/assistant/llm.ts';
import type { AssistantContext } from '../_shared/domain/assistant/tools.ts';
import { busyQueryRange } from '../_shared/domain/slots.ts';
import { BOOKING_COLUMNS, rowToBooking, rowToPayment, type BookingRow, type PaymentRow } from '../_shared/domain/db.ts';

const db = admin();
const apiKey = Deno.env.get('OPENAI_API_KEY');
const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini';
const openai = apiKey ? new OpenAI({ apiKey, baseURL: Deno.env.get('OPENAI_BASE_URL') || undefined }) : null;

const bodySchema = z.object({
  slug: z.string().min(1),
  mode: z.enum(['client', 'owner']).default('client'),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .min(1)
    .max(30),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('Некорректный запрос');
  const { slug, mode, messages } = parsed.data;

  const studio = await loadStudio(db, { slug });
  if (!studio) return fail('Студия не найдена', 404);
  if (mode === 'owner' && !(await ownerOf(db, req, studio.id))) return fail('Нужно войти в кабинет', 401);

  const now = new Date();
  const range = busyQueryRange(studio.settings, now);
  const { data: busyRows } = await db.rpc('get_busy', { p_studio: studio.id, p_from: range.from.toISOString(), p_to: range.to.toISOString() });
  const ctx: AssistantContext = {
    mode,
    settings: studio.settings,
    now,
    busy: (busyRows ?? []).map((r: { bay: number; start_at: string; block_end: string }) => ({ bay: r.bay, start: r.start_at, end: r.block_end })),
  };

  if (mode === 'owner') {
    const from = new Date(now.getTime() - 400 * 86_400_000).toISOString();
    const to = new Date(now.getTime() + 120 * 86_400_000).toISOString();
    const [{ data: bookings }, { data: payments }] = await Promise.all([
      db.from('bookings').select(BOOKING_COLUMNS).eq('studio_id', studio.id).gte('start_at', from).lt('start_at', to),
      db.from('payments').select('*').eq('studio_id', studio.id).gte('created_at', from),
    ]);
    ctx.bookings = ((bookings ?? []) as BookingRow[]).map(rowToBooking);
    ctx.payments = ((payments ?? []) as PaymentRow[]).map(rowToPayment);
  }

  const reply = openai ? await llmReply(messages, ctx, { client: openai, model }) : fallbackReply(messages, ctx);
  return json({ ...reply, engine: openai ? model : 'builtin' });
});
