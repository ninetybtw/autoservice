/**
 * Единая схема данных студии. Используется:
 *  - для проверки файла studios/<slug>/studio.json;
 *  - в кабинете владельца перед сохранением;
 *  - в серверных функциях Supabase;
 *  - в формах клиента (имя, телефон, автомобиль).
 */
import { z } from 'zod';

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Время в формате ЧЧ:ММ');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД');

export const dayHoursSchema = z
  .object({ open: time, close: time })
  .refine((d) => d.open < d.close, { message: 'Время открытия должно быть раньше закрытия' });
export type DayHours = z.infer<typeof dayHoursSchema>;

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Понедельник',
  tue: 'Вторник',
  wed: 'Среда',
  thu: 'Четверг',
  fri: 'Пятница',
  sat: 'Суббота',
  sun: 'Воскресенье',
};

export const scheduleSchema = z.object({
  /** null — выходной */
  weekly: z.object({
    mon: dayHoursSchema.nullable(),
    tue: dayHoursSchema.nullable(),
    wed: dayHoursSchema.nullable(),
    thu: dayHoursSchema.nullable(),
    fri: dayHoursSchema.nullable(),
    sat: dayHoursSchema.nullable(),
    sun: dayHoursSchema.nullable(),
  }),
  /** Особые дни: праздники, короткие дни, отпуск. */
  exceptions: z
    .array(
      z.object({
        date: isoDate,
        hours: dayHoursSchema.nullable(),
        note: z.string().max(120).optional(),
      }),
    )
    .default([]),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const serviceSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Только латиница, цифры и дефис'),
  name: z.string().trim().min(2, 'Название слишком короткое').max(80),
  description: z.string().trim().max(400).default(''),
  /** Цена в рублях. */
  price: z.number().int().min(0).max(10_000_000),
  /** Показывать «от» перед ценой. */
  priceFrom: z.boolean().default(false),
  /** Чистое время работы в минутах (по рабочему графику студии). */
  durationMinutes: z.number().int().min(15).max(60 * 24 * 7),
  /** Альтернативные слова, по которым помощник узнаёт услугу. */
  keywords: z.array(z.string().max(40)).default([]),
  active: z.boolean().default(true),
});
export type Service = z.infer<typeof serviceSchema>;

export const workSchema = z.object({
  id: z.string().min(1).max(60),
  image: z.string().min(1),
  caption: z.string().trim().max(160).default(''),
});
export type Work = z.infer<typeof workSchema>;

export const INFO_ICONS = ['shield', 'clock', 'sparkle', 'drop', 'car', 'medal', 'wrench', 'coffee', 'camera', 'star'] as const;
export const infoCardSchema = z.object({
  icon: z.enum(INFO_ICONS).default('star'),
  title: z.string().trim().min(1).max(60),
  text: z.string().trim().max(200).default(''),
});
export type InfoCard = z.infer<typeof infoCardSchema>;

export const bookingRulesSchema = z.object({
  /** Количество боксов (постов), работающих параллельно. */
  bays: z.number().int().min(1).max(20),
  /** Шаг сетки времени записи, минут. */
  slotStepMinutes: z.number().int().min(10).max(240).default(30),
  /** Время на подготовку бокса между машинами, минут. */
  bufferMinutes: z.number().int().min(0).max(240).default(30),
  /** Минимум минут от текущего момента до начала записи. */
  minLeadMinutes: z.number().int().min(0).max(60 * 24 * 7).default(120),
  /** На сколько дней вперёд открыта запись. */
  horizonDays: z.number().int().min(1).max(120).default(30),
  /** Клиент может отменить запись не позднее чем за N часов. */
  cancelMinHoursBefore: z.number().int().min(0).max(24 * 14).default(24),
  /** Текст правил отмены для клиента. */
  cancellationPolicy: z.string().trim().max(500).default(''),
});
export type BookingRules = z.infer<typeof bookingRulesSchema>;

export const studioSettingsSchema = z.object({
  name: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(120).default(''),
  description: z.string().trim().max(800).default(''),
  timezone: z.string().min(3).default('Europe/Moscow'),
  contacts: z.object({
    phone: z.string().trim().min(5).max(30),
    address: z.string().trim().min(3).max(200),
    howToFind: z.string().trim().max(500).default(''),
    mapUrl: z.string().url().optional().or(z.literal('')),
    telegram: z.string().max(100).optional(),
    whatsapp: z.string().max(30).optional(),
  }),
  branding: z.object({
    logo: z.string().default(''),
    hero: z.string().default(''),
    /** Квадратные иконки приложения (генерируются из логотипа). */
    icon192: z.string().optional(),
    icon512: z.string().optional(),
  }),
  infoCards: z.array(infoCardSchema).length(3, 'Нужно ровно три карточки'),
  services: z.array(serviceSchema).min(1, 'Добавьте хотя бы одну услугу'),
  works: z.array(workSchema).default([]),
  schedule: scheduleSchema,
  booking: bookingRulesSchema,
});
export type StudioSettings = z.infer<typeof studioSettingsSchema>;

/** Формат файла studios/<slug>/studio.json */
export const studioFileSchema = studioSettingsSchema.extend({
  $schema: z.string().optional(),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'slug: только латиница, цифры и дефис'),
  owner: z.object({ email: z.string().email() }),
});
export type StudioFile = z.infer<typeof studioFileSchema>;

export interface Studio {
  id: string;
  slug: string;
  settings: StudioSettings;
}

// ---------------------------------------------------------------------------
// Записи и оплаты
// ---------------------------------------------------------------------------

export const BOOKING_STATUSES = ['booked', 'arrived', 'ready', 'cancelled', 'no_show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  booked: 'Записан',
  arrived: 'Машина принята',
  ready: 'Готово',
  cancelled: 'Отменена',
  no_show: 'Не приехал',
};

export interface Booking {
  id: string;
  studioId: string;
  serviceId: string;
  serviceName: string;
  price: number;
  bay: number;
  /** ISO, начало работ */
  startAt: string;
  /** ISO, когда машина будет готова */
  endAt: string;
  /** ISO, до какого момента бокс занят (с подготовкой) */
  blockEnd: string;
  status: BookingStatus;
  customerName: string;
  customerPhone: string;
  car: string;
  comment: string;
  source: 'client' | 'owner';
  createdAt: string;
  cancelledAt?: string | null;
}

/** То, что видит клиент о своей записи. */
export type PublicBooking = Omit<Booking, 'bay' | 'blockEnd' | 'source'>;

export interface Payment {
  id: string;
  studioId: string;
  bookingId: string | null;
  kind: 'payment' | 'refund';
  amount: number;
  method: 'cash' | 'card' | 'transfer';
  note: string;
  createdAt: string;
}

export interface BusyInterval {
  bay: number;
  start: string;
  end: string;
  bookingId?: string;
}

/** Нормализует российский номер к +7XXXXXXXXXX. Возвращает null, если номер некорректен. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return `+7${digits.slice(1)}`;
  if (digits.length === 10 && digits[0] === '9') return `+7${digits}`;
  if (raw.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function formatPhone(phone: string): string {
  const m = phone.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : phone;
}

export const customerSchema = z.object({
  customerName: z.string().trim().min(2, 'Укажите имя').max(60, 'Слишком длинное имя'),
  customerPhone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const p = normalizePhone(v);
      if (!p) {
        ctx.addIssue({ code: 'custom', message: 'Проверьте номер телефона' });
        return z.NEVER;
      }
      return p;
    }),
  car: z.string().trim().min(2, 'Укажите марку и модель').max(80),
  comment: z.string().trim().max(500).default(''),
});
export type CustomerInput = z.input<typeof customerSchema>;

export const createBookingSchema = customerSchema.extend({
  slug: z.string().min(1),
  serviceId: z.string().min(1),
  startAt: z.string().datetime({ offset: true }),
});
export type CreateBookingInput = z.input<typeof createBookingSchema>;

export const paymentInputSchema = z.object({
  bookingId: z.string().nullable(),
  kind: z.enum(['payment', 'refund']),
  amount: z.number().positive('Сумма должна быть больше нуля').max(10_000_000),
  method: z.enum(['cash', 'card', 'transfer']).default('card'),
  note: z.string().trim().max(200).default(''),
});
export type PaymentInput = z.input<typeof paymentInputSchema>;

export function formatPrice(price: number, from = false): string {
  const s = new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
  return from ? `от ${s}` : s;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}
