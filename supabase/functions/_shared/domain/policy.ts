// СГЕНЕРИРОВАНО из shared/ командой pnpm functions:sync — не редактируйте.
import type { Booking, PublicBooking, StudioSettings } from './schema.ts';
import { plural } from './format.ts';

export type CancelCheck = { ok: true } | { ok: false; reason: string };

/** Может ли клиент сам отменить запись по правилам студии. */
export function canClientCancel(
  settings: StudioSettings,
  booking: Pick<Booking | PublicBooking, 'status' | 'startAt'>,
  now: Date,
): CancelCheck {
  if (booking.status === 'cancelled') return { ok: false, reason: 'Запись уже отменена.' };
  if (booking.status !== 'booked') return { ok: false, reason: 'Машина уже в работе — отменить запись можно только по телефону.' };
  const hours = settings.booking.cancelMinHoursBefore;
  const deadline = new Date(booking.startAt).getTime() - hours * 3_600_000;
  if (now.getTime() > deadline) {
    return {
      ok: false,
      reason:
        hours > 0
          ? `Отменить онлайн можно не позднее чем за ${hours} ${plural(hours, ['час', 'часа', 'часов'])} до начала. Позвоните в сервис.`
          : 'Время записи уже прошло.',
    };
  }
  return { ok: true };
}

export function cancellationText(settings: StudioSettings): string {
  const h = settings.booking.cancelMinHoursBefore;
  const base = h > 0 ? `Отменить запись онлайн можно не позднее чем за ${h} ${plural(h, ['час', 'часа', 'часов'])} до начала.` : 'Отменить запись онлайн можно до её начала.';
  return settings.booking.cancellationPolicy ? `${base} ${settings.booking.cancellationPolicy}` : base;
}
