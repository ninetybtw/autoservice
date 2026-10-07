/** Работа с Supabase: база, вход владельца, хранилище фото и серверные функции. */
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { paymentInputSchema, studioSettingsSchema, type Booking, type BusyInterval, type Studio } from '@shared/schema.ts';
import { BOOKING_COLUMNS, bookingToRow, bookingsToBusy, rowToBooking, rowToPayment, type BookingRow, type PaymentRow } from '@shared/db.ts';
import { SUPABASE_ANON_KEY, SUPABASE_URL, VAPID_PUBLIC_KEY } from '../config.ts';
import { planOwnerBooking, UserError, type Backend } from './backend.ts';

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'autoservice-auth' },
  });
  return client;
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new UserError('Нет подключения к интернету', 'offline');
  const { data, error } = await supabase().functions.invoke(fn, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new UserError(payload?.error ?? 'Ошибка сервера', payload?.code);
    }
    throw new UserError('Не удалось связаться с сервером. Проверьте интернет.', 'network');
  }
  return data as T;
}

function dbError(error: { code?: string; message: string } | null): never | void {
  if (!error) return;
  if (error.code === '23P01') throw new UserError('В это время бокс уже занят.', 'busy');
  if (error.code === '42501' || error.code === 'PGRST301') throw new UserError('Нет доступа. Войдите заново.', 'auth');
  throw new UserError(error.message);
}

async function busy(studioId: string, from: Date, to: Date): Promise<BusyInterval[]> {
  const { data, error } = await supabase().rpc('get_busy', { p_studio: studioId, p_from: from.toISOString(), p_to: to.toISOString() });
  dbError(error);
  return ((data ?? []) as { bay: number; start_at: string; block_end: string }[]).map((r) => ({
    bay: r.bay,
    start: new Date(r.start_at).toISOString(),
    end: new Date(r.block_end).toISOString(),
  }));
}

export function createSupabaseBackend(): Backend {
  const db = supabase();
  return {
    mode: 'supabase',
    supportsPush: Boolean(VAPID_PUBLIC_KEY),

    async listStudios() {
      const { data } = await db.from('studios').select('slug, settings->>name').order('slug');
      return ((data ?? []) as unknown as { slug: string; name: string }[]).map((r) => ({ slug: r.slug, name: r.name }));
    },

    async getStudio(slug) {
      const { data, error } = await db.from('studios').select('id, slug, settings').eq('slug', slug).maybeSingle();
      dbError(error);
      if (!data) return null;
      const parsed = studioSettingsSchema.safeParse(data.settings);
      if (!parsed.success) {
        console.error('Ошибка в настройках автосервиса', parsed.error.issues);
        throw new UserError('Настройки автосервиса повреждены');
      }
      return { id: data.id, slug: data.slug, settings: parsed.data };
    },

    getBusy: busy,

    createBooking: (input) => invoke('booking', { action: 'create', ...input }),
    getBooking: async (id, token) => (await invoke<{ booking: never }>('booking', { action: 'get', id, token })).booking,
    cancelBooking: async (id, token) => (await invoke<{ booking: never }>('booking', { action: 'cancel', id, token })).booking,
    savePushSubscription: async (id, token, subscription) => {
      await invoke('booking', { action: 'push', id, token, subscription });
    },
    ask: (slug, mode, messages) => invoke('assistant', { slug, mode, messages }),

    async signIn(studio, email, password) {
      const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new UserError(error.message === 'Invalid login credentials' ? 'Неверная почта или пароль' : error.message);
      if (!(await this.currentOwner(studio))) {
        await db.auth.signOut();
        throw new UserError('Эта учётная запись не привязана к этому автосервису');
      }
    },

    async signOut() {
      await db.auth.signOut();
    },

    async currentOwner(studio) {
      const { data } = await db.auth.getSession();
      const user = data.session?.user;
      if (!user) return null;
      const { data: link } = await db.from('studio_owners').select('user_id').eq('studio_id', studio.id).eq('user_id', user.id).maybeSingle();
      return link ? { email: user.email ?? '' } : null;
    },

    async listBookings(studioId, from, to) {
      const { data, error } = await db
        .from('bookings')
        .select(BOOKING_COLUMNS)
        .eq('studio_id', studioId)
        .lt('start_at', to.toISOString())
        .gt('block_end', from.toISOString())
        .order('start_at');
      dbError(error);
      return ((data ?? []) as BookingRow[]).map(rowToBooking);
    },

    async listPayments(studioId, from, to) {
      const { data, error } = await db
        .from('payments')
        .select('*')
        .eq('studio_id', studioId)
        .gte('created_at', from.toISOString())
        .lt('created_at', to.toISOString())
        .order('created_at');
      dbError(error);
      return ((data ?? []) as PaymentRow[]).map(rowToPayment);
    },

    async saveBooking(studio: Studio, draft) {
      const start = new Date(draft.startAt);
      const nearby = await this.listBookings(studio.id, new Date(start.getTime() - 30 * 86_400_000), new Date(start.getTime() + 30 * 86_400_000));
      let current: Booking | undefined = nearby.find((b) => b.id === draft.id);
      if (draft.id && !current) {
        const { data } = await db.from('bookings').select(BOOKING_COLUMNS).eq('id', draft.id).single();
        current = data ? rowToBooking(data as BookingRow) : undefined;
      }
      const plan = planOwnerBooking(studio, draft, bookingsToBusy(nearby), current);
      const row = bookingToRow({
        studioId: studio.id,
        serviceId: draft.serviceId,
        serviceName: plan.serviceName,
        price: plan.price,
        bay: plan.bay,
        startAt: plan.timing.start.toISOString(),
        endAt: plan.timing.workEnd.toISOString(),
        blockEnd: plan.timing.blockEnd.toISOString(),
        status: current && current.status !== 'cancelled' ? current.status : 'booked',
        customerName: draft.customerName,
        customerPhone: draft.customerPhone,
        car: draft.car,
        comment: draft.comment,
        source: current?.source ?? 'owner',
      });
      const q = current
        ? db.from('bookings').update({ ...row, cancelled_at: null, reminder_sent_at: null }).eq('id', current.id)
        : db.from('bookings').insert(row);
      const { data, error } = await q.select(BOOKING_COLUMNS).single();
      dbError(error);
      return rowToBooking(data as BookingRow);
    },

    async setBookingStatus(_studio, id, status) {
      const { error } = await db
        .from('bookings')
        .update({ status, cancelled_at: status === 'cancelled' ? new Date().toISOString() : null })
        .eq('id', id);
      dbError(error);
    },

    async addPayment(studio, input) {
      const p = paymentInputSchema.parse(input);
      const { error } = await db.from('payments').insert({
        studio_id: studio.id,
        booking_id: p.bookingId,
        kind: p.kind,
        amount: p.amount,
        method: p.method,
        note: p.note,
      });
      dbError(error);
    },

    async updateSettings(studio, settings) {
      const parsed = studioSettingsSchema.parse(settings);
      const { error } = await db.from('studios').update({ settings: parsed }).eq('id', studio.id);
      dbError(error);
      return parsed;
    },

    async uploadMedia(studio, file, name) {
      const path = `${studio.id}/${name}`;
      const { error } = await db.storage.from('studio-media').upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg',
        cacheControl: '31536000',
      });
      if (error) throw new UserError(`Не удалось загрузить фото: ${error.message}`);
      return `${db.storage.from('studio-media').getPublicUrl(path).data.publicUrl}?v=${Date.now().toString(36)}`;
    },
  };
}
