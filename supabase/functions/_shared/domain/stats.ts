// СГЕНЕРИРОВАНО из shared/ командой pnpm functions:sync — не редактируйте.
import type { Booking, Payment } from './schema.ts';

export interface PeriodStats {
  /** Все записи периода, кроме отменённых. */
  bookings: number;
  /** Машины, которые реально приехали (приняты или готовы). */
  arrivals: number;
  /** Завершённые работы. */
  completed: number;
  cancelled: number;
  noShow: number;
  /** Сумма оплат за период. */
  received: number;
  /** Сумма возвратов за период. */
  refunded: number;
  /** Реально получено: оплаты минус возвраты. */
  net: number;
  /** Ожидаемая выручка по активным записям периода. */
  expected: number;
}

function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
}

export function periodStats(bookings: Booking[], payments: Payment[], from: Date, to: Date): PeriodStats {
  const inPeriod = bookings.filter((b) => inRange(b.startAt, from, to));
  const active = inPeriod.filter((b) => b.status !== 'cancelled');
  const pays = payments.filter((p) => inRange(p.createdAt, from, to));
  const received = pays.filter((p) => p.kind === 'payment').reduce((s, p) => s + p.amount, 0);
  const refunded = pays.filter((p) => p.kind === 'refund').reduce((s, p) => s + p.amount, 0);
  return {
    bookings: active.length,
    arrivals: active.filter((b) => b.status === 'arrived' || b.status === 'ready').length,
    completed: active.filter((b) => b.status === 'ready').length,
    cancelled: inPeriod.length - active.length,
    noShow: active.filter((b) => b.status === 'no_show').length,
    received,
    refunded,
    net: received - refunded,
    expected: active.filter((b) => b.status !== 'no_show').reduce((s, b) => s + b.price, 0),
  };
}

/** Сколько уже оплачено по конкретной записи. */
export function bookingPaid(bookingId: string, payments: Payment[]): number {
  return payments
    .filter((p) => p.bookingId === bookingId)
    .reduce((s, p) => s + (p.kind === 'payment' ? p.amount : -p.amount), 0);
}
