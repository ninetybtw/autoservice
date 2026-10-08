/**
 * Демо-режим без сервера: студии из папки studios/, записи и оплаты — в localStorage браузера.
 * Повторяет поведение Supabase-версии, включая проверку свободного времени и правила отмены.
 */
import {
  createBookingSchema,
  paymentInputSchema,
  studioSettingsSchema,
  type Booking,
  type BookingStatus,
  type Payment,
  type Service,
  type Studio,
  type StudioSettings,
} from '@shared/schema.ts';
import { bookingsToBusy, generateToken, hashToken, toPublicBooking } from '@shared/db.ts';
import { checkSlot, hoursForDate, localDateOf, SLOT_ERROR_TEXT, addDaysToDate, zonedToInstant } from '@shared/slots.ts';
import { canClientCancel } from '@shared/policy.ts';
import { fallbackReply } from '@shared/assistant/fallback.ts';
import { bundledStudios } from './bundled.ts';
import { planOwnerBooking, UserError, type Backend } from './backend.ts';

export const DEMO_PASSWORD = 'demo1234';
const KEY = 'autoservice-demo:v2';

interface DemoBooking extends Booking {
  tokenHash?: string;
}
interface DemoState {
  settings: Record<string, StudioSettings>;
  /** С какой версии файла studio.json сделаны правки — если файл обновился, правки сбрасываются */
  settingsBase?: Record<string, string>;
  bookings: Record<string, DemoBooking[]>;
  payments: Record<string, Payment[]>;
  session: string | null;
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {
    /* хранилище недоступно */
  }
  return { settings: {}, bookings: {}, payments: {}, session: null };
}

let state = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('demo: не удалось сохранить', e);
    throw new UserError('Не хватает места в браузере. Попробуйте фото меньшего размера.');
  }
}

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

function studioById(id: string): Studio {
  const s = bundledStudios().find((f) => `demo-${f.slug}` === id);
  if (!s) throw new UserError('Автосервис не найден');
  return { id, slug: s.slug, settings: currentSettings(s) };
}

/** Настройки с учётом правок владельца — только если файл студии не менялся после этих правок. */
function currentSettings(file: ReturnType<typeof bundledStudios>[number]): StudioSettings {
  const override = state.settings[file.slug];
  if (override && state.settingsBase?.[file.slug] === JSON.stringify(strip(file))) return override;
  return strip(file);
}

function strip(file: ReturnType<typeof bundledStudios>[number]): StudioSettings {
  const { $schema: _s, slug: _slug, owner: _o, ...settings } = file;
  return settings;
}

/**
 * Демо-записи и оплаты, чтобы календарь и кабинет не были пустыми:
 * прошлые дни (готово и оплачено), сегодня (машина принята),
 * ближайший рабочий день (все посты заняты пару часов — видно «занято»)
 * и длинная многодневная работа.
 */
function seed(studio: Studio): void {
  if (state.bookings[studio.id]) return;
  const s = studio.settings;
  const now = new Date();
  const today = localDateOf(now, s.timezone);
  const bookings: DemoBooking[] = [];
  const payments: Payment[] = [];
  const people = [
    ['Алексей', 'BMW X5', '+79161234501'],
    ['Марина', 'Kia Rio', '+79161234502'],
    ['Игорь', 'Toyota Camry', '+79161234503'],
    ['Светлана', 'Hyundai Solaris', '+79161234504'],
    ['Дмитрий', 'Lada Vesta', '+79161234505'],
    ['Ольга', 'Volkswagen Polo', '+79161234506'],
    ['Сергей', 'Skoda Octavia', '+79161234507'],
    ['Наталья', 'Renault Duster', '+79161234508'],
  ];
  const byLength = s.services.slice().sort((a, b) => a.durationMinutes - b.durationMinutes);
  const medium = byLength[Math.floor(byLength.length / 2)];
  const longest = byLength[byLength.length - 1];

  const add = (date: string, minutesAfterOpen: number, service: Service, status: BookingStatus, bay?: number) => {
    const hours = hoursForDate(s.schedule, date);
    if (!hours) return;
    const [h, m] = hours.open.split(':').map(Number);
    const t = h * 60 + m + minutesAfterOpen;
    const start = zonedToInstant(date, `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, s.timezone);
    const check = checkSlot(s, service, start, bookingsToBusy(bookings), now, { ignoreLead: true, preferBay: bay });
    if (!check.ok || (bay && check.bay !== bay)) return;
    const i = bookings.length;
    const [name, car, phone] = people[i % people.length];
    const b: DemoBooking = {
      id: `seed-${i}`,
      studioId: studio.id,
      serviceId: service.id,
      serviceName: service.name,
      price: service.price,
      bay: check.bay,
      startAt: start.toISOString(),
      endAt: check.timing.workEnd.toISOString(),
      blockEnd: check.timing.blockEnd.toISOString(),
      status,
      customerName: name,
      customerPhone: phone,
      car,
      comment: '',
      source: i % 2 ? 'owner' : 'client',
      createdAt: new Date(start.getTime() - 3 * 86_400_000).toISOString(),
    };
    bookings.push(b);
    if (status === 'ready') {
      payments.push({
        id: `seed-p-${i}`,
        studioId: studio.id,
        bookingId: b.id,
        kind: 'payment',
        amount: service.price,
        method: i % 2 ? 'cash' : 'card',
        note: '',
        createdAt: check.timing.workEnd.toISOString(),
      });
    }
  };

  for (const d of [-3, -2, -1]) add(addDaysToDate(today, d), 60, s.services[(d + 3) % s.services.length], 'ready');
  add(today, 0, medium, 'arrived');
  // ближайший рабочий день после сегодняшнего: все посты заняты одновременно
  let next = addDaysToDate(today, 1);
  for (let i = 0; i < 7 && !hoursForDate(s.schedule, next); i++) next = addDaysToDate(next, 1);
  for (let bay = 1; bay <= s.booking.bays; bay++) add(next, 120, medium, 'booked', bay);
  add(next, 0, byLength[0], 'booked');
  // многодневная работа через день
  if (longest !== medium) add(addDaysToDate(next, 1), 0, longest, 'booked');

  state.bookings[studio.id] = bookings;
  state.payments[studio.id] = payments;
  save();
}

function findByToken(id: string, tokenHash: string): DemoBooking {
  for (const list of Object.values(state.bookings)) {
    const b = list.find((x) => x.id === id);
    if (b && b.tokenHash === tokenHash) return b;
  }
  throw new UserError('Запись не найдена', 'not_found');
}

export function createDemoBackend(): Backend {
  return {
    mode: 'demo',
    supportsPush: false,

    async listStudios() {
      return bundledStudios().map((s) => ({ slug: s.slug, name: currentSettings(s).name }));
    },

    async getStudio(slug) {
      const file = bundledStudios().find((s) => s.slug === slug);
      if (!file) return null;
      const studio: Studio = { id: `demo-${slug}`, slug, settings: currentSettings(file) };
      seed(studio);
      return studio;
    },

    async getBusy(studioId) {
      await delay(60);
      return bookingsToBusy(state.bookings[studioId] ?? []);
    },

    async createBooking(input) {
      await delay(300);
      const parsed = createBookingSchema.safeParse(input);
      if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? 'Проверьте данные', 'invalid');
      const data = parsed.data;
      const studio = await this.getStudio(data.slug);
      if (!studio) throw new UserError('Автосервис не найден');
      const service = studio.settings.services.find((s) => s.id === data.serviceId && s.active);
      if (!service) throw new UserError('Услуга не найдена');
      const list = state.bookings[studio.id] ?? [];
      const check = checkSlot(studio.settings, service, new Date(data.startAt), bookingsToBusy(list), new Date());
      if (!check.ok) throw new UserError(SLOT_ERROR_TEXT[check.reason], check.reason);
      const token = generateToken();
      const booking: DemoBooking = {
        id: uid(),
        studioId: studio.id,
        serviceId: service.id,
        serviceName: service.name,
        price: service.price,
        bay: check.bay,
        startAt: check.timing.start.toISOString(),
        endAt: check.timing.workEnd.toISOString(),
        blockEnd: check.timing.blockEnd.toISOString(),
        status: 'booked',
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        car: data.car,
        comment: data.comment,
        source: 'client',
        createdAt: new Date().toISOString(),
        tokenHash: await hashToken(token),
      };
      state.bookings[studio.id] = [...list, booking];
      save();
      return { booking: toPublicBooking(booking), token };
    },

    async getBooking(id, token) {
      await delay(60);
      const { tokenHash: _t, ...b } = findByToken(id, await hashToken(token));
      return toPublicBooking(b);
    },

    async cancelBooking(id, token) {
      await delay(200);
      const b = findByToken(id, await hashToken(token));
      const studio = studioById(b.studioId);
      const can = canClientCancel(studio.settings, b, new Date());
      if (!can.ok) throw new UserError(can.reason, 'cancel_forbidden');
      b.status = 'cancelled';
      b.cancelledAt = new Date().toISOString();
      save();
      const { tokenHash: _t, ...rest } = b;
      return toPublicBooking(rest);
    },

    async savePushSubscription() {
      throw new UserError('Напоминания недоступны в демо-режиме');
    },

    async ask(slug, mode, messages) {
      await delay(350);
      const studio = await this.getStudio(slug);
      if (!studio) throw new UserError('Автосервис не найден');
      const bookings = state.bookings[studio.id] ?? [];
      return fallbackReply(messages, {
        mode,
        settings: studio.settings,
        now: new Date(),
        busy: bookingsToBusy(bookings),
        bookings: mode === 'owner' ? bookings : undefined,
        payments: mode === 'owner' ? (state.payments[studio.id] ?? []) : undefined,
      });
    },

    async signIn(studio, email, password) {
      await delay(250);
      const file = bundledStudios().find((s) => s.slug === studio.slug);
      if (!file || email.trim().toLowerCase() !== file.owner.email.toLowerCase() || password !== DEMO_PASSWORD) {
        throw new UserError('Неверная почта или пароль');
      }
      state.session = studio.slug;
      save();
    },

    async signOut() {
      state.session = null;
      save();
    },

    async currentOwner(studio) {
      const file = bundledStudios().find((s) => s.slug === studio.slug);
      return state.session === studio.slug && file ? { email: file.owner.email } : null;
    },

    async listBookings(studioId, from, to) {
      await delay(60);
      return (state.bookings[studioId] ?? [])
        .filter((b) => new Date(b.startAt) < to && new Date(b.blockEnd) > from)
        .map(({ tokenHash: _t, ...b }) => b);
    },

    async listPayments(studioId, from, to) {
      return (state.payments[studioId] ?? []).filter((p) => new Date(p.createdAt) >= from && new Date(p.createdAt) < to);
    },

    async saveBooking(studio, draft) {
      await delay(200);
      const list = state.bookings[studio.id] ?? [];
      const current = draft.id ? list.find((b) => b.id === draft.id) : undefined;
      const plan = planOwnerBooking(studio, draft, bookingsToBusy(list), current);
      const fields = {
        serviceId: draft.serviceId,
        serviceName: plan.serviceName,
        price: plan.price,
        bay: plan.bay,
        startAt: plan.timing.start.toISOString(),
        endAt: plan.timing.workEnd.toISOString(),
        blockEnd: plan.timing.blockEnd.toISOString(),
        customerName: draft.customerName,
        customerPhone: draft.customerPhone,
        car: draft.car,
        comment: draft.comment,
      };
      let result: DemoBooking;
      if (current) {
        Object.assign(current, fields, current.status === 'cancelled' ? { status: 'booked', cancelledAt: null } : {});
        result = current;
      } else {
        result = { ...fields, id: uid(), studioId: studio.id, status: 'booked', source: 'owner', createdAt: new Date().toISOString() };
        state.bookings[studio.id] = [...list, result];
      }
      save();
      const { tokenHash: _t, ...b } = result;
      return b;
    },

    async setBookingStatus(studio, id, status: BookingStatus) {
      const b = (state.bookings[studio.id] ?? []).find((x) => x.id === id);
      if (!b) throw new UserError('Запись не найдена');
      b.status = status;
      b.cancelledAt = status === 'cancelled' ? new Date().toISOString() : null;
      save();
    },

    async addPayment(studio, input) {
      const p = paymentInputSchema.parse(input);
      state.payments[studio.id] = [
        ...(state.payments[studio.id] ?? []),
        { ...p, id: uid(), studioId: studio.id, createdAt: new Date().toISOString() },
      ];
      save();
    },

    async updateSettings(studio, settings) {
      await delay(200);
      const parsed = studioSettingsSchema.parse(settings);
      const prev = state.settings[studio.slug];
      const file = bundledStudios().find((f) => f.slug === studio.slug);
      state.settings[studio.slug] = parsed;
      if (file) state.settingsBase = { ...state.settingsBase, [studio.slug]: JSON.stringify(strip(file)) };
      try {
        save();
      } catch (e) {
        if (prev) state.settings[studio.slug] = prev;
        else delete state.settings[studio.slug];
        throw e;
      }
      return parsed;
    },

    async uploadMedia(_studio, file) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new UserError('Не удалось прочитать файл'));
        reader.readAsDataURL(file);
      });
    },
  };
}

/** Для тестов и кнопки «Сбросить демо-данные». */
export function resetDemo() {
  state = { settings: {}, bookings: {}, payments: {}, session: null };
  save();
}

