// СГЕНЕРИРОВАНО из shared/ командой pnpm functions:sync — не редактируйте.
/**
 * Расчёт свободного времени.
 *
 * Правила:
 *  - время работы считается по графику студии (часовой пояс студии);
 *  - если услуга помещается в рабочий день, она должна закончиться в тот же день;
 *  - если услуга длиннее рабочего дня, она продолжается в следующие рабочие дни,
 *    а бокс считается занятым всё это время, включая ночь (машина стоит в боксе);
 *    начать такую работу можно только в первой половине рабочего дня;
 *  - после работы бокс занят ещё bufferMinutes — подготовка к следующей машине;
 *  - слот свободен, если хотя бы в одном боксе нет пересечений с другими записями.
 */
import { addDays, format } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { BusyInterval, DayHours, Schedule, Service, StudioSettings, Weekday } from './schema.ts';

const MINUTE = 60_000;
const WEEKDAY_BY_INDEX: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Локальная дата (ГГГГ-ММ-ДД) момента времени в часовом поясе студии. */
export function localDateOf(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, 'yyyy-MM-dd');
}

export function localTimeOf(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, 'HH:mm');
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysToDate(date: string, days: number): string {
  return format(addDays(parseDate(date), days), 'yyyy-MM-dd');
}

export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAY_BY_INDEX[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Перевод локального «ГГГГ-ММ-ДД ЧЧ:ММ» студии в абсолютное время. */
export function zonedToInstant(date: string, time: string, tz: string): Date {
  if (time === '24:00') return zonedToInstant(addDaysToDate(date, 1), '00:00', tz);
  return fromZonedTime(`${date}T${time}:00`, tz);
}

export function hoursForDate(schedule: Schedule, date: string): DayHours | null {
  const exception = schedule.exceptions.find((e) => e.date === date);
  if (exception) return exception.hours;
  return schedule.weekly[weekdayOf(date)];
}

export interface Window {
  start: Date;
  end: Date;
}

export function workingWindow(schedule: Schedule, tz: string, date: string): Window | null {
  const hours = hoursForDate(schedule, date);
  if (!hours) return null;
  return { start: zonedToInstant(date, hours.open, tz), end: zonedToInstant(date, hours.close, tz) };
}

/**
 * Прибавляет рабочие минуты к моменту start, пропуская нерабочее время.
 * Возвращает null, если в ближайший год не найдено достаточно рабочего времени.
 */
export function addWorkingMinutes(schedule: Schedule, tz: string, start: Date, minutes: number): Date | null {
  let remaining = minutes;
  let date = localDateOf(start, tz);
  let cursor = start;
  for (let i = 0; i < 400; i++) {
    const w = workingWindow(schedule, tz, date);
    if (w) {
      const segStart = cursor > w.start ? cursor : w.start;
      if (segStart < w.end) {
        const available = (w.end.getTime() - segStart.getTime()) / MINUTE;
        if (remaining <= available) return new Date(segStart.getTime() + remaining * MINUTE);
        remaining -= available;
      }
    }
    date = addDaysToDate(date, 1);
    cursor = zonedToInstant(date, '00:00', tz);
  }
  return null;
}

export interface JobTiming {
  start: Date;
  /** Когда работа будет закончена. */
  workEnd: Date;
  /** До какого момента бокс занят (с подготовкой). */
  blockEnd: Date;
  /** Работа занимает несколько дней. */
  multiDay: boolean;
}

/** Считает время окончания работ для старта в start. null — в это время начать нельзя. */
export function jobTiming(settings: StudioSettings, durationMinutes: number, start: Date): JobTiming | null {
  const tz = settings.timezone;
  const date = localDateOf(start, tz);
  const w = workingWindow(settings.schedule, tz, date);
  if (!w || start < w.start || start >= w.end) return null;
  const dayLength = (w.end.getTime() - w.start.getTime()) / MINUTE;
  const multiDay = durationMinutes > dayLength;
  const workEnd = addWorkingMinutes(settings.schedule, tz, start, durationMinutes);
  if (!workEnd) return null;
  if (!multiDay && workEnd > w.end) return null;
  if (multiDay && start.getTime() > w.start.getTime() + (dayLength / 2) * MINUTE) return null;
  const blockEnd = new Date(workEnd.getTime() + settings.booking.bufferMinutes * MINUTE);
  return { start, workEnd, blockEnd, multiDay };
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function freeBays(
  settings: StudioSettings,
  busy: BusyInterval[],
  start: Date,
  end: Date,
  excludeBookingId?: string,
): number[] {
  const result: number[] = [];
  for (let bay = 1; bay <= settings.booking.bays; bay++) {
    const taken = busy.some(
      (b) =>
        b.bay === bay &&
        (excludeBookingId === undefined || b.bookingId !== excludeBookingId) &&
        overlaps(start, end, new Date(b.start), new Date(b.end)),
    );
    if (!taken) result.push(bay);
  }
  return result;
}

export type SlotStatus = 'free' | 'busy';

export interface Slot extends JobTiming {
  /** Локальное время начала, ЧЧ:ММ */
  time: string;
  status: SlotStatus;
  freeBays: number[];
}

export interface SlotQuery {
  settings: StudioSettings;
  durationMinutes: number;
  date: string;
  busy: BusyInterval[];
  now: Date;
  /** Владелец может записывать без ограничения «не раньше чем за N минут». */
  ignoreLead?: boolean;
  /** При переносе записи её собственный интервал не считается занятым. */
  excludeBookingId?: string;
}

/** Все допустимые времена начала услуги в указанный день, с отметкой занятости. */
export function slotsForDate(q: SlotQuery): Slot[] {
  const { settings, date } = q;
  const tz = settings.timezone;
  const hours = hoursForDate(settings.schedule, date);
  if (!hours) return [];
  const earliest = new Date(q.now.getTime() + (q.ignoreLead ? 0 : settings.booking.minLeadMinutes) * MINUTE);
  const [oh, om] = hours.open.split(':').map(Number);
  const [ch, cm] = hours.close.split(':').map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  const step = settings.booking.slotStepMinutes;
  const slots: Slot[] = [];
  for (let m = openMin; m < closeMin; m += step) {
    const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const start = zonedToInstant(date, time, tz);
    if (start < earliest) continue;
    const timing = jobTiming(settings, q.durationMinutes, start);
    if (!timing) continue;
    const bays = freeBays(settings, q.busy, timing.start, timing.blockEnd, q.excludeBookingId);
    slots.push({ ...timing, time, status: bays.length > 0 ? 'free' : 'busy', freeBays: bays });
  }
  return slots;
}

/** Даты, открытые для записи (от сегодня в часовом поясе студии). */
export function bookingDates(settings: StudioSettings, now: Date): string[] {
  const today = localDateOf(now, settings.timezone);
  return Array.from({ length: settings.booking.horizonDays }, (_, i) => addDaysToDate(today, i));
}

export interface DayAvailability {
  date: string;
  open: boolean;
  free: number;
  total: number;
}

export function dayAvailability(q: Omit<SlotQuery, 'date'>, dates: string[]): DayAvailability[] {
  return dates.map((date) => {
    const open = hoursForDate(q.settings.schedule, date) !== null;
    if (!open) return { date, open, free: 0, total: 0 };
    const slots = slotsForDate({ ...q, date });
    return { date, open, free: slots.filter((s) => s.status === 'free').length, total: slots.length };
  });
}

/** Ближайшие свободные слоты для услуги. */
export function nearestFreeSlots(
  q: Omit<SlotQuery, 'date'> & { limit?: number; fromDate?: string; days?: number },
): Slot[] {
  const limit = q.limit ?? 3;
  const dates = bookingDates(q.settings, q.now).filter((d) => !q.fromDate || d >= q.fromDate);
  const result: Slot[] = [];
  for (const date of dates.slice(0, q.days ?? dates.length)) {
    for (const slot of slotsForDate({ ...q, date })) {
      if (slot.status === 'free') {
        result.push(slot);
        if (result.length >= limit) return result;
      }
    }
  }
  return result;
}

export type SlotCheck =
  | { ok: true; bay: number; timing: JobTiming }
  | { ok: false; reason: 'closed' | 'too_soon' | 'too_far' | 'busy' | 'off_grid' };

/**
 * Серверная проверка выбранного времени перед созданием записи.
 * Проверяет график, сетку, горизонт записи и свободный бокс.
 */
export function checkSlot(
  settings: StudioSettings,
  service: Pick<Service, 'durationMinutes'>,
  startAt: Date,
  busy: BusyInterval[],
  now: Date,
  opts: { ignoreLead?: boolean; excludeBookingId?: string; preferBay?: number } = {},
): SlotCheck {
  const tz = settings.timezone;
  const date = localDateOf(startAt, tz);
  if (!opts.ignoreLead) {
    if (startAt.getTime() < now.getTime() + settings.booking.minLeadMinutes * MINUTE) return { ok: false, reason: 'too_soon' };
    if (!bookingDates(settings, now).includes(date)) return { ok: false, reason: 'too_far' };
  }
  const timing = jobTiming(settings, service.durationMinutes, startAt);
  if (!timing) return { ok: false, reason: 'closed' };
  const hours = hoursForDate(settings.schedule, date)!;
  const [oh, om] = hours.open.split(':').map(Number);
  const local = localTimeOf(startAt, tz).split(':').map(Number);
  const offset = local[0] * 60 + local[1] - (oh * 60 + om);
  if (!opts.ignoreLead && (offset % settings.booking.slotStepMinutes !== 0 || startAt.getSeconds() !== 0)) {
    return { ok: false, reason: 'off_grid' };
  }
  const bays = freeBays(settings, busy, timing.start, timing.blockEnd, opts.excludeBookingId);
  if (bays.length === 0) return { ok: false, reason: 'busy' };
  const bay = opts.preferBay && bays.includes(opts.preferBay) ? opts.preferBay : bays[0];
  return { ok: true, bay, timing };
}

export const SLOT_ERROR_TEXT: Record<Exclude<SlotCheck, { ok: true }>['reason'], string> = {
  closed: 'В это время студия не работает или услуга не успеет закончиться до закрытия.',
  too_soon: 'Это время уже недоступно для записи. Выберите время позже.',
  too_far: 'Запись на эту дату пока не открыта.',
  busy: 'Это время только что заняли. Выберите другое.',
  off_grid: 'Выберите время из предложенных.',
};

/** Интервал, за который нужны данные о занятости для расчёта слотов на горизонт записи. */
export function busyQueryRange(settings: StudioSettings, now: Date): { from: Date; to: Date } {
  const longest = Math.max(...settings.services.map((s) => s.durationMinutes));
  const from = new Date(now.getTime() - 14 * 24 * 60 * MINUTE);
  // длинная услуга, начатая в последний день горизонта, может закончиться позже
  const to = new Date(now.getTime() + (settings.booking.horizonDays + 2 + Math.ceil(longest / 60 / 4)) * 24 * 60 * MINUTE);
  return { from, to };
}
