// СГЕНЕРИРОВАНО из shared/ командой pnpm functions:sync — не редактируйте.
/**
 * Помощник без языковой модели. Работает, когда на сервере не задан OPENAI_API_KEY,
 * и в демо-режиме. Понимает типичные вопросы и задаёт уточняющие, если данных не хватает.
 */
import { formatDuration, formatPrice, formatServicePrice, type Service, type StudioSettings } from '../schema.ts';
import { formatDateLong, formatWhen, plural } from '../format.ts';
import { addDaysToDate, localDateOf, nearestFreeSlots, slotsForDate, zonedToInstant } from '../slots.ts';
import { periodStats } from '../stats.ts';
import { matchServices, normalize, resolvePeriod, type Period } from './text.ts';
import {
  activeServices,
  scheduleText,
  toolGetBookings,
  type AssistantContext,
  type AssistantReply,
  type ChatMessage,
} from './tools.ts';
import { cancellationText } from '../policy.ts';

type ClientIntent = 'price' | 'slot' | 'location' | 'hours' | 'phone' | 'cancel' | 'services' | 'greeting';

function clientIntents(text: string): Set<ClientIntent> {
  const t = normalize(text);
  const s = new Set<ClientIntent>();
  if (/сколько стои|цен[аыу]|стоимост|почем|прайс|по деньгам/.test(t)) s.add('price');
  if (/ближайш|окн[оа]|свободн|когда можно|можно записат|записат|время на|успеете|есть место|места/.test(t)) s.add('slot');
  if (/где|адрес|как (вас |к вам )?(найти|добрат|доехат|проехат)|как найти|найти студ|куда ехать|карт[аеу]|парковк|въезд/.test(t)) s.add('location');
  if (/график|часы работы|во сколько|до скольки|работаете|открыт|выходн/.test(t)) s.add('hours');
  if (/телефон|позвонить|номер|связат/.test(t)) s.add('phone');
  if (/отмен|перенест|перенос/.test(t)) s.add('cancel');
  if (/какие услуги|что (вы )?делаете|список услуг|услуги/.test(t) && !s.has('price')) s.add('services');
  if (/^(привет|здравствуй|добрый|доброе|хай|hello)/.test(t.trim())) s.add('greeting');
  return s;
}

function serviceLine(s: Service): string {
  return `${s.name} — ${formatServicePrice(s.price, s.priceFrom)}, ${formatDuration(s.durationMinutes)}`;
}

function nearestText(ctx: AssistantContext, service: Service, periodDate?: string): string {
  const tz = ctx.settings.timezone;
  const q = { settings: ctx.settings, durationMinutes: service.durationMinutes, busy: ctx.busy, now: ctx.now };
  if (periodDate) {
    const slots = slotsForDate({ ...q, date: periodDate });
    const free = slots.filter((x) => x.status === 'free');
    if (slots.length === 0) return `${formatDateLong(periodDate)} на «${service.name}» записи нет — сервис не работает или день уже закрыт.`;
    if (free.length === 0) return `${formatDateLong(periodDate)} на «${service.name}» всё занято. Посмотрите другой день.`;
    return `${formatDateLong(periodDate)} на «${service.name}» свободно: ${free.map((x) => x.time).slice(0, 12).join(', ')}.`;
  }
  const slots = nearestFreeSlots({ ...q, limit: 3 });
  if (slots.length === 0) return `На «${service.name}» в ближайший месяц свободного времени нет. Позвоните: ${ctx.settings.contacts.phone}.`;
  const first = slots[0];
  const ready = first.multiDay ? ` Машина будет готова ${formatWhen(first.workEnd, ctx.now, tz)}.` : '';
  const others = slots.slice(1).map((x) => formatWhen(x.start, ctx.now, tz));
  return `Ближайшее окно на «${service.name}» — ${formatWhen(first.start, ctx.now, tz)}.${ready}${others.length ? ` Ещё есть: ${others.join(', ')}.` : ''}`;
}

function lastUserMessages(messages: ChatMessage[]): string[] {
  return messages.filter((m) => m.role === 'user').map((m) => m.content);
}

/** Примеры вопросов для клиента — по услугам этого сервиса. */
export function clientExamples(settings: Pick<StudioSettings, 'services'>): string[] {
  const active = settings.services.filter((s) => s.active);
  const paid = active.find((s) => s.price > 0) ?? active[0];
  const name = paid ? paid.name.charAt(0).toLowerCase() + paid.name.slice(1) : '';
  return ['Когда ближайшее окно?', ...(name ? [`Сколько стоит ${name}?`] : []), 'Как вас найти?'];
}

export function clientFallback(messages: ChatMessage[], ctx: AssistantContext): AssistantReply {
  const users = lastUserMessages(messages);
  const text = users[users.length - 1] ?? '';
  const services = activeServices(ctx.settings);
  let intents = clientIntents(text);
  const matched = matchServices(text, services);
  const today = localDateOf(ctx.now, ctx.settings.timezone);
  let period = resolvePeriod(text, today);

  // Ответ на уточняющий вопрос: «полировка» после «Когда ближайшее окно?»
  if (intents.size === 0 && users.length > 1) {
    const prev = users[users.length - 2];
    const prevIntents = clientIntents(prev);
    if (matched.length > 0 || period) {
      intents = new Set([...prevIntents].filter((i) => i === 'price' || i === 'slot'));
      period ??= resolvePeriod(prev, today);
    }
    if (matched.length === 0 && intents.size > 0) {
      const prevMatched = matchServices(prev, services);
      if (prevMatched.length === 1) matched.push(prevMatched[0]);
    }
  }
  if (intents.size === 0 && matched.length > 0) {
    intents = new Set(['price', 'slot']);
  }
  if (intents.size === 0 && period) intents.add('slot');

  const parts: string[] = [];
  let suggestions: string[] | undefined;

  if (intents.has('greeting') && intents.size === 1) {
    return {
      text: `Здравствуйте! Я помощник автосервиса «${ctx.settings.name}». Подскажу цены, свободное время и как нас найти.`,
      suggestions: clientExamples(ctx.settings),
    };
  }

  if (intents.has('price') || intents.has('slot')) {
    if (matched.length === 1) {
      const s = matched[0];
      if (intents.has('price')) parts.push(`${serviceLine(s)}.${s.description ? ` ${s.description}` : ''}`);
      if (intents.has('slot')) parts.push(nearestText(ctx, s, period && period.to === addDaysToDate(period.from, 1) ? period.from : undefined));
      suggestions = [`Записаться на «${s.name}»`];
    } else if (matched.length > 1) {
      const lines = matched.map((s) => `- ${serviceLine(s)}`).join('\n');
      parts.push(`Уточните, пожалуйста, какой вариант вас интересует:\n${lines}`);
      suggestions = matched.map((s) => (intents.has('slot') && !intents.has('price') ? `Ближайшее окно на «${s.name}»` : `Сколько стоит «${s.name}»?`));
    } else if (intents.has('slot')) {
      parts.push('Для какой услуги подобрать время? От неё зависит, сколько машина пробудет в боксе.');
      suggestions = services.slice(0, 4).map((s) => `Ближайшее окно на «${s.name}»`);
    } else {
      parts.push(`Какая услуга вас интересует? Вот наши цены:\n${services.map((s) => `- ${serviceLine(s)}`).join('\n')}`);
      suggestions = services.slice(0, 4).map((s) => `Сколько стоит «${s.name}»?`);
    }
  }

  if (intents.has('services') && !intents.has('price')) {
    parts.push(`Что мы делаем:\n${services.map((s) => `- ${serviceLine(s)}`).join('\n')}`);
  }

  if (intents.has('location')) {
    const c = ctx.settings.contacts;
    parts.push(
      [`Адрес: ${c.address}.`, c.howToFind, c.mapUrl ? `[Открыть карту](${c.mapUrl})` : ''].filter(Boolean).join(' '),
    );
  }
  if (intents.has('hours')) parts.push(`Работаем: ${scheduleText(ctx.settings)}.`);
  if (intents.has('phone') || (intents.has('location') && !parts.join(' ').includes(ctx.settings.contacts.phone))) {
    parts.push(`Телефон: ${ctx.settings.contacts.phone}.`);
  }
  if (intents.has('cancel')) parts.push(`${cancellationText(ctx.settings)} Свою запись можно открыть в разделе «Моя запись».`);

  if (parts.length === 0) {
    return {
      text: 'Я могу подсказать цены, ближайшее свободное время и как нас найти. Что вас интересует?',
      suggestions: clientExamples(ctx.settings),
    };
  }
  return { text: parts.join('\n\n'), suggestions };
}

// ---------------------------------------------------------------------------
// Владелец
// ---------------------------------------------------------------------------

function rub(n: number): string {
  return formatPrice(Math.round(n));
}

function statsFor(ctx: AssistantContext, p: Period) {
  const tz = ctx.settings.timezone;
  return periodStats(ctx.bookings ?? [], ctx.payments ?? [], zonedToInstant(p.from, '00:00', tz), zonedToInstant(p.to, '00:00', tz));
}

function bookingsText(ctx: AssistantContext, p: Period): string {
  const list = toolGetBookings(ctx, { from: p.from, to: addDaysToDate(p.to, -1) }).filter((b) => b.status !== 'Отменена');
  if (list.length === 0) return `${capitalize(p.label)} записей нет.`;
  const oneDay = p.to === addDaysToDate(p.from, 1);
  const lines = list.map(
    (b) =>
      `- ${oneDay ? '' : `${b.date}, `}${b.time} — ${b.service}, ${b.car}, ${b.customer} ${b.phone} (${b.status.toLowerCase()})`,
  );
  return `${capitalize(p.label)} ${list.length} ${plural(list.length, ['запись', 'записи', 'записей'])}:\n${lines.join('\n')}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ownerFallback(messages: ChatMessage[], ctx: AssistantContext): AssistantReply {
  const users = lastUserMessages(messages);
  const text = users[users.length - 1] ?? '';
  const t = normalize(text);
  const tz = ctx.settings.timezone;
  const today = localDateOf(ctx.now, tz);
  let period = resolvePeriod(text, today);

  const wantsMoney = /денег|деньг|выручк|получен|заработ|оплат|касс|доход|возврат/.test(t);
  const wantsCars = /машин|заезд|клиент|авто|сколько записей|сколько было/.test(t);
  const wantsDone = /готов|заверш|сделал/.test(t);
  let wantsList = /что у меня|кто записан|какие записи|расписани|план|что завтра|что сегодня|запис/.test(t) && !wantsCars && !wantsMoney;

  // Уточнение после вопроса «за какой период?»
  if (!wantsMoney && !wantsCars && !wantsDone && !wantsList && period && users.length > 1) {
    const prev = users[users.length - 2];
    if (!resolvePeriod(prev, today)) return ownerFallback([{ role: 'user', content: `${prev} ${text}` }], ctx);
  }
  if (!wantsMoney && !wantsCars && !wantsDone && !wantsList && period) wantsList = true;

  if (wantsList) {
    period ??= { from: today, to: addDaysToDate(today, 1), label: 'сегодня' };
    return { text: bookingsText(ctx, period), suggestions: ['Что у меня завтра?', 'Сколько денег получено на неделе?'] };
  }

  if (wantsMoney || wantsCars || wantsDone) {
    const periods: Period[] = period
      ? [period]
      : [
          { from: today, to: addDaysToDate(today, 1), label: 'сегодня' },
          resolvePeriod('на неделе', today)!,
          resolvePeriod('в этом месяце', today)!,
        ];
    const lines = periods.map((p) => {
      const s = statsFor(ctx, p);
      const bits: string[] = [];
      if (wantsCars || wantsDone) {
        bits.push(`${s.bookings} ${plural(s.bookings, ['запись', 'записи', 'записей'])}, приехали ${s.arrivals} ${plural(s.arrivals, ['машина', 'машины', 'машин'])}, готово ${s.completed}`);
        if (s.cancelled) bits.push(`отменено ${s.cancelled}`);
      }
      if (wantsMoney) {
        bits.push(`получено ${rub(s.net)}${s.refunded ? ` (оплаты ${rub(s.received)}, возвраты ${rub(s.refunded)})` : ''}`);
      }
      return `${capitalize(p.label)}: ${bits.join(', ')}.`;
    });
    return { text: lines.join('\n'), suggestions: period ? undefined : ['Сколько денег получено вчера?', 'Сколько машин было на прошлой неделе?'] };
  }

  // Слоты и цены владельцу тоже полезны
  const client = clientFallback(messages, { ...ctx, mode: 'client' });
  if (!client.text.startsWith('Я могу подсказать')) return client;
  return {
    text: 'Я отвечаю по записям, машинам и деньгам вашего автосервиса. Например:',
    suggestions: ['Что у меня завтра?', 'Сколько машин было на неделе?', 'Сколько денег получено?'],
  };
}

export function fallbackReply(messages: ChatMessage[], ctx: AssistantContext): AssistantReply {
  return ctx.mode === 'owner' ? ownerFallback(messages, ctx) : clientFallback(messages, ctx);
}

