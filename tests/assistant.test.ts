import { describe, expect, it } from 'vitest';
import { fallbackReply } from '../shared/assistant/fallback.ts';
import { matchServices, resolvePeriod } from '../shared/assistant/text.ts';
import { runTool, type AssistantContext } from '../shared/assistant/tools.ts';
import { zonedToInstant } from '../shared/slots.ts';
import type { Booking, Payment } from '../shared/schema.ts';
import { loadStudio } from './fixtures.ts';

const settings = loadStudio('noir-detailing');
const tz = settings.timezone;
const now = zonedToInstant('2026-10-07', '12:00', tz); // среда
const ask = (ctx: AssistantContext, ...texts: string[]) =>
  fallbackReply(
    texts.flatMap((t, i) => (i < texts.length - 1 ? [{ role: 'user' as const, content: t }, { role: 'assistant' as const, content: '…' }] : [{ role: 'user' as const, content: t }])),
    ctx,
  );

const client: AssistantContext = { mode: 'client', settings, now, busy: [] };

describe('распознавание', () => {
  it('находит услуги по словоформам и просит уточнить при нескольких', () => {
    expect(matchServices('сколько стоит керамику нанести', settings.services).map((s) => s.id)).toEqual(['ceramic']);
    expect(matchServices('Сколько стоит полировка?', settings.services).map((s) => s.id)).toEqual(['polish-light', 'polish-restore', 'headlights']);
    expect(matchServices('Ближайшее окно на «Восстановительная полировка»', settings.services).map((s) => s.id)).toEqual(['polish-restore']);
    expect(matchServices('нужна химчистка', settings.services).map((s) => s.id)).toEqual(['interior']);
  });

  it('понимает периоды', () => {
    expect(resolvePeriod('Что у меня завтра?', '2026-10-07')).toMatchObject({ from: '2026-10-08', to: '2026-10-09' });
    expect(resolvePeriod('Сколько машин было на неделе?', '2026-10-07')).toMatchObject({ from: '2026-10-05', to: '2026-10-12' });
    expect(resolvePeriod('на прошлой неделе', '2026-10-07')).toMatchObject({ from: '2026-09-28', to: '2026-10-05' });
    expect(resolvePeriod('в этом месяце', '2026-10-07')).toMatchObject({ from: '2026-10-01', to: '2026-11-01' });
    expect(resolvePeriod('в пятницу', '2026-10-07')).toMatchObject({ from: '2026-10-09' });
    expect(resolvePeriod('12 октября', '2026-10-07')).toMatchObject({ from: '2026-10-12' });
    expect(resolvePeriod('15.01', '2026-12-20')).toMatchObject({ from: '2027-01-15' });
  });
});

describe('помощник клиента', () => {
  it('уточняет услугу, если вопрос о цене неоднозначен', () => {
    const r = ask(client, 'Сколько стоит полировка?');
    expect(r.text).toMatch(/Уточните/);
    expect(r.text).toMatch(/Лёгкая полировка — от 12\s000\s₽/);
    expect(r.suggestions).toHaveLength(3);
  });

  it('спрашивает услугу для ближайшего окна, а затем отвечает с учётом контекста', () => {
    const r = ask(client, 'Когда ближайшее окно?');
    expect(r.text).toMatch(/Для какой услуги/);
    const r2 = ask(client, 'Когда ближайшее окно?', 'химчистка');
    // сейчас среда 12:00, запас 2 часа — ближайшее 14:00 сегодня
    expect(r2.text).toMatch(/Ближайшее окно на «Химчистка салона» — сегодня в 14:00/);
  });

  it('по чипу отвечает сразу', () => {
    const r = ask(client, 'Ближайшее окно на «Керамическое покрытие»');
    expect(r.text).toMatch(/сегодня в 14:00/);
    expect(r.text).toMatch(/будет готова/);
  });

  it('объясняет, как найти студию', () => {
    const r = ask(client, 'Как найти студию?');
    expect(r.text).toContain(settings.contacts.address);
    expect(r.text).toContain('шлагбаум');
    expect(r.text).toContain(settings.contacts.phone);
  });

  it('свободное время в конкретный день', () => {
    const r = ask(client, 'Есть время на мойку завтра?');
    expect(r.text).toMatch(/четверг, 8 октября на «Комплексная мойка» свободно: 10:00, 10:30/);
  });
});

describe('помощник владельца', () => {
  const b = (id: string, date: string, time: string, status: Booking['status'], price = 1000): Booking => ({
    id,
    studioId: 's',
    serviceId: 'complex-wash',
    serviceName: 'Комплексная мойка',
    price,
    bay: 1,
    startAt: zonedToInstant(date, time, tz).toISOString(),
    endAt: zonedToInstant(date, time, tz).toISOString(),
    blockEnd: zonedToInstant(date, time, tz).toISOString(),
    status,
    customerName: `Клиент ${id}`,
    customerPhone: '+79990000000',
    car: 'Kia Rio',
    comment: '',
    source: 'client',
    createdAt: now.toISOString(),
  });
  const p = (id: string, date: string, amount: number, kind: Payment['kind'] = 'payment'): Payment => ({
    id,
    studioId: 's',
    bookingId: null,
    kind,
    amount,
    method: 'card',
    note: '',
    createdAt: zonedToInstant(date, '15:00', tz).toISOString(),
  });
  const owner: AssistantContext = {
    mode: 'owner',
    settings,
    now,
    busy: [],
    bookings: [
      b('1', '2026-10-05', '10:00', 'ready'),
      b('2', '2026-10-06', '10:00', 'arrived'),
      b('3', '2026-10-07', '10:00', 'cancelled'),
      b('4', '2026-10-08', '11:00', 'booked'),
      b('5', '2026-10-08', '15:30', 'booked'),
      b('6', '2026-09-30', '10:00', 'ready'),
    ],
    payments: [p('a', '2026-10-05', 2500), p('b', '2026-10-06', 9000), p('c', '2026-10-06', 1000, 'refund'), p('d', '2026-09-30', 5000)],
  };

  it('«Что у меня завтра?»', () => {
    const r = ask(owner, 'Что у меня завтра?');
    expect(r.text).toMatch(/Завтра 2 записи/);
    expect(r.text).toMatch(/11:00 — Комплексная мойка, Kia Rio, Клиент 4/);
  });

  it('«Сколько машин было на неделе?»', () => {
    const r = ask(owner, 'Сколько машин было на неделе?');
    expect(r.text).toBe('На этой неделе: 4 записи, приехали 2 машины, готово 1, отменено 1.');
  });

  it('«Сколько денег получено?» без периода — сводка', () => {
    const r = ask(owner, 'Сколько денег получено?');
    expect(r.text).toMatch(/Сегодня: получено 0\s₽/);
    expect(r.text).toMatch(/На этой неделе: получено 10\s500\s₽ \(оплаты 11\s500\s₽, возвраты 1\s000\s₽\)/);
    expect(r.text).toMatch(/В этом месяце: получено 10\s500/);
  });

  it('инструменты модели возвращают данные только своей роли', () => {
    expect(runTool(client, 'get_stats', { from: '2026-10-01', to: '2026-10-31' })).toEqual({ error: 'Недоступно' });
    expect(runTool(owner, 'get_stats', { from: '2026-10-05', to: '2026-10-11' })).toMatchObject({ net: 10500, arrivals: 2 });
  });
});
