// СГЕНЕРИРОВАНО из shared/ командой pnpm functions:sync — не редактируйте.
import { ru } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { addDaysToDate, localDateOf } from './slots.ts';

/** «сегодня», «завтра» или «пт, 10 октября» для локальной даты студии. */
export function formatDayLabel(date: string, now: Date, tz: string): string {
  const today = localDateOf(now, tz);
  if (date === today) return 'сегодня';
  if (date === addDaysToDate(today, 1)) return 'завтра';
  if (date === addDaysToDate(today, 2)) return 'послезавтра';
  return formatDateShort(date);
}

function dateAtNoonUtc(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** «10 октября» */
export function formatDateShort(date: string): string {
  return formatInTimeZone(dateAtNoonUtc(date), 'UTC', 'd MMMM', { locale: ru });
}

/** «пятница, 10 октября» */
export function formatDateLong(date: string): string {
  return formatInTimeZone(dateAtNoonUtc(date), 'UTC', 'EEEE, d MMMM', { locale: ru });
}

/** «пт» */
export function formatWeekdayShort(date: string): string {
  return formatInTimeZone(dateAtNoonUtc(date), 'UTC', 'EEEEEE', { locale: ru });
}

export function formatDayNumber(date: string): string {
  return String(Number(date.slice(8, 10)));
}

/** «пятница, 10 октября в 14:30» в часовом поясе студии */
export function formatDateTime(instant: Date | string, tz: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return formatInTimeZone(d, tz, "EEEE, d MMMM 'в' HH:mm", { locale: ru });
}

export function formatTime(instant: Date | string, tz: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return formatInTimeZone(d, tz, 'HH:mm');
}

/** «завтра в 10:00», «10 октября в 10:00» */
export function formatWhen(instant: Date | string, now: Date, tz: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return `${formatDayLabel(localDateOf(d, tz), now, tz)} в ${formatTime(d, tz)}`;
}

export function plural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}
