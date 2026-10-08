// СГЕНЕРИРОВАНО из shared/ командой pnpm functions:sync — не редактируйте.
/**
 * Инструменты помощника. Одни и те же функции вызывает модель OpenAI на сервере
 * и запасной (без модели) помощник — поэтому ответы всегда опираются на данные студии.
 */
import type { Booking, BusyInterval, Payment, Service, StudioSettings } from '../schema.ts';
import { BOOKING_STATUS_LABELS, WEEKDAYS, formatDuration, formatServicePrice } from '../schema.ts';
import { addDaysToDate, localDateOf, nearestFreeSlots, slotsForDate, zonedToInstant } from '../slots.ts';
import { formatDateLong, formatTime, formatWhen } from '../format.ts';
import { periodStats, bookingPaid } from '../stats.ts';
import { cancellationText } from '../policy.ts';

export type AssistantMode = 'client' | 'owner';

export interface AssistantContext {
  mode: AssistantMode;
  settings: StudioSettings;
  now: Date;
  busy: BusyInterval[];
  bookings?: Booking[];
  payments?: Payment[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantReply {
  text: string;
  suggestions?: string[];
}

export function activeServices(settings: StudioSettings): Service[] {
  return settings.services.filter((s) => s.active);
}

export function scheduleText(settings: StudioSettings): string {
  const groups: { days: string[]; hours: string }[] = [];
  for (const d of WEEKDAYS) {
    const h = settings.schedule.weekly[d];
    const hours = h ? `${h.open}–${h.close}` : 'выходной';
    const last = groups[groups.length - 1];
    if (last && last.hours === hours) last.days.push(d);
    else groups.push({ days: [d], hours });
  }
  const short: Record<string, string> = { mon: 'пн', tue: 'вт', wed: 'ср', thu: 'чт', fri: 'пт', sat: 'сб', sun: 'вс' };
  return groups
    .map((g) => `${g.days.length > 1 ? `${short[g.days[0]]}–${short[g.days[g.days.length - 1]]}` : short[g.days[0]]}: ${g.hours}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Описание инструментов для OpenAI (function calling)
// ---------------------------------------------------------------------------

const dateParam = { type: 'string', description: 'Дата в формате ГГГГ-ММ-ДД (часовой пояс сервиса)' };

export const CLIENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_services',
      description: 'Список услуг автосервиса с ценами и длительностью.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_free_slots',
      description:
        'Свободное время для записи на конкретную услугу. Без даты — ближайшие окна. С датой — все свободные времена в этот день.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string', description: 'id услуги из get_services' },
          date: dateParam,
          limit: { type: 'integer', description: 'Сколько ближайших окон вернуть (по умолчанию 3)' },
        },
        required: ['service_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_studio_info',
      description: 'Адрес, как найти автосервис, телефон, график работы и правила отмены.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];

export const OWNER_TOOLS = [
  ...CLIENT_TOOLS,
  {
    type: 'function' as const,
    function: {
      name: 'get_bookings',
      description: 'Записи автосервиса за период: время, клиент, машина, услуга, статус, цена и оплачено.',
      parameters: {
        type: 'object',
        properties: { from: dateParam, to: { ...dateParam, description: 'Последний день периода включительно, ГГГГ-ММ-ДД' } },
        required: ['from', 'to'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_stats',
      description:
        'Итоги за период: записи, заезды (машины приняты), завершённые работы, отмены, получено денег (оплаты минус возвраты, по дате платежа).',
      parameters: {
        type: 'object',
        properties: { from: dateParam, to: { ...dateParam, description: 'Последний день периода включительно, ГГГГ-ММ-ДД' } },
        required: ['from', 'to'],
        additionalProperties: false,
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Исполнение инструментов
// ---------------------------------------------------------------------------

export function toolGetServices(ctx: AssistantContext) {
  return activeServices(ctx.settings).map((s) => ({
    id: s.id,
    name: s.name,
    price: formatServicePrice(s.price, s.priceFrom),
    duration: formatDuration(s.durationMinutes),
    description: s.description,
  }));
}

export function toolFindFreeSlots(ctx: AssistantContext, args: { service_id: string; date?: string; limit?: number }) {
  const service = activeServices(ctx.settings).find((s) => s.id === args.service_id);
  if (!service) return { error: 'Нет такой услуги. Вызовите get_services и уточните услугу.' };
  const tz = ctx.settings.timezone;
  const q = { settings: ctx.settings, durationMinutes: service.durationMinutes, busy: ctx.busy, now: ctx.now };
  if (args.date) {
    const slots = slotsForDate({ ...q, date: args.date });
    return {
      service: service.name,
      date: formatDateLong(args.date),
      free_times: slots.filter((s) => s.status === 'free').map((s) => s.time),
      busy_times: slots.filter((s) => s.status === 'busy').map((s) => s.time),
      closed: slots.length === 0,
    };
  }
  const slots = nearestFreeSlots({ ...q, limit: Math.min(args.limit ?? 3, 10) });
  return {
    service: service.name,
    nearest: slots.map((s) => ({
      when: formatWhen(s.start, ctx.now, tz),
      start: s.start.toISOString(),
      ready: formatWhen(s.workEnd, ctx.now, tz),
    })),
  };
}

export function toolStudioInfo(ctx: AssistantContext) {
  const s = ctx.settings;
  const today = localDateOf(ctx.now, s.timezone);
  return {
    name: s.name,
    address: s.contacts.address,
    how_to_find: s.contacts.howToFind,
    map_url: s.contacts.mapUrl || null,
    phone: s.contacts.phone,
    hours: scheduleText(s),
    special_days: s.schedule.exceptions
      .filter((e) => e.date >= today)
      .slice(0, 5)
      .map((e) => ({ date: formatDateLong(e.date), hours: e.hours ? `${e.hours.open}–${e.hours.close}` : 'выходной', note: e.note })),
    cancellation: cancellationText(s),
  };
}

function rangeFromArgs(ctx: AssistantContext, from: string, toInclusive: string) {
  const tz = ctx.settings.timezone;
  return { from: zonedToInstant(from, '00:00', tz), to: zonedToInstant(addDaysToDate(toInclusive, 1), '00:00', tz) };
}

export function toolGetBookings(ctx: AssistantContext, args: { from: string; to: string }) {
  const { from, to } = rangeFromArgs(ctx, args.from, args.to);
  const tz = ctx.settings.timezone;
  return (ctx.bookings ?? [])
    .filter((b) => new Date(b.startAt) >= from && new Date(b.startAt) < to)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map((b) => ({
      date: formatDateLong(localDateOf(new Date(b.startAt), tz)),
      time: formatTime(b.startAt, tz),
      ready: formatWhen(b.endAt, ctx.now, tz),
      service: b.serviceName,
      customer: b.customerName,
      phone: b.customerPhone,
      car: b.car,
      status: BOOKING_STATUS_LABELS[b.status],
      price: b.price,
      paid: bookingPaid(b.id, ctx.payments ?? []),
      bay: b.bay,
    }));
}

export function toolGetStats(ctx: AssistantContext, args: { from: string; to: string }) {
  const { from, to } = rangeFromArgs(ctx, args.from, args.to);
  return periodStats(ctx.bookings ?? [], ctx.payments ?? [], from, to);
}

export function runTool(ctx: AssistantContext, name: string, rawArgs: unknown): unknown {
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  const isOwner = ctx.mode === 'owner';
  switch (name) {
    case 'get_services':
      return toolGetServices(ctx);
    case 'find_free_slots':
      return toolFindFreeSlots(ctx, args as { service_id: string; date?: string; limit?: number });
    case 'get_studio_info':
      return toolStudioInfo(ctx);
    case 'get_bookings':
      return isOwner ? toolGetBookings(ctx, args as { from: string; to: string }) : { error: 'Недоступно' };
    case 'get_stats':
      return isOwner ? toolGetStats(ctx, args as { from: string; to: string }) : { error: 'Недоступно' };
    default:
      return { error: `Неизвестный инструмент ${name}` };
  }
}

export function systemPrompt(ctx: AssistantContext): string {
  const s = ctx.settings;
  const today = localDateOf(ctx.now, s.timezone);
  const common = [
    `Сегодня ${formatDateLong(today)} (${today}), сейчас ${formatTime(ctx.now, s.timezone)}. Часовой пояс сервиса: ${s.timezone}.`,
    'Отвечай по-русски, коротко и по делу: 1–5 предложений или короткий список.',
    'Бери факты только из инструментов. Ничего не придумывай: ни услуг, ни цен, ни скидок, ни свободного времени.',
  ];
  if (ctx.mode === 'owner') {
    return [
      `Ты — помощник владельца автосервиса «${s.name}» в его кабинете.`,
      ...common,
      'Для вопросов о записях вызывай get_bookings, для итогов и денег — get_stats.',
      '«Получено денег» — это оплаты минус возвраты по дате платежа. «Заезды» — машины, принятые в работу (статусы «Машина принята» и «Готово»).',
      '«На неделе» — текущая неделя с понедельника по воскресенье. Если период не указан и его нельзя понять, задай уточняющий вопрос.',
    ].join('\n');
  }
  return [
    `Ты — помощник автосервиса «${s.name}». Помогаешь клиентам узнать цены, свободное время и как добраться.`,
    ...common,
    'Цены — из get_services, свободное время — из find_free_slots, адрес, график и правила — из get_studio_info.',
    'Свободное время зависит от длительности услуги. Если клиент спрашивает про время или цену, а услуга неясна или подходит несколько услуг, задай уточняющий вопрос и перечисли подходящие варианты.',
    'Чтобы записаться, клиенту нужно нажать кнопку «Записаться» — не собирай имя и телефон в чате.',
  ].join('\n');
}
