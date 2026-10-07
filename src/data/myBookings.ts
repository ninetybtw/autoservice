/** Записи клиента на этом устройстве: id и секретный токен для просмотра и отмены. */
import type { PublicBooking } from '@shared/schema.ts';

const KEY = 'autoservice-my-bookings:v1';

export interface MyBookingRef {
  id: string;
  token: string;
  slug: string;
  /** Последняя известная версия — чтобы запись открывалась без сети */
  booking: PublicBooking;
}

function read(): MyBookingRef[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as MyBookingRef[];
  } catch {
    return [];
  }
}

function write(list: MyBookingRef[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* приватный режим — запись останется доступна по ссылке */
  }
  window.dispatchEvent(new Event('my-bookings'));
}

export function myBookings(slug: string): MyBookingRef[] {
  return read()
    .filter((r) => r.slug === slug)
    .sort((a, b) => b.booking.startAt.localeCompare(a.booking.startAt));
}

export function findMyBooking(id: string): MyBookingRef | undefined {
  return read().find((r) => r.id === id);
}

export function rememberBooking(ref: MyBookingRef) {
  write([ref, ...read().filter((r) => r.id !== ref.id)].slice(0, 30));
}

export function forgetBooking(id: string) {
  write(read().filter((r) => r.id !== id));
}
