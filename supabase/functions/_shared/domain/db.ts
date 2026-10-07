// СГЕНЕРИРОВАНО из shared/ командой pnpm functions:sync — не редактируйте.
/** Преобразование строк базы данных Supabase в типы приложения. */
import type { Booking, BusyInterval, Payment, PublicBooking } from './schema.ts';

export interface BookingRow {
  id: string;
  studio_id: string;
  service_id: string;
  service_name: string;
  price: number;
  bay: number;
  start_at: string;
  end_at: string;
  block_end: string;
  status: Booking['status'];
  customer_name: string;
  customer_phone: string;
  car: string;
  comment: string;
  source: Booking['source'];
  created_at: string;
  cancelled_at: string | null;
}

export interface PaymentRow {
  id: string;
  studio_id: string;
  booking_id: string | null;
  kind: Payment['kind'];
  amount: number | string;
  method: Payment['method'];
  note: string;
  created_at: string;
}

export const BOOKING_COLUMNS =
  'id, studio_id, service_id, service_name, price, bay, start_at, end_at, block_end, status, customer_name, customer_phone, car, comment, source, created_at, cancelled_at';

export function rowToBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    studioId: r.studio_id,
    serviceId: r.service_id,
    serviceName: r.service_name,
    price: Number(r.price),
    bay: r.bay,
    startAt: new Date(r.start_at).toISOString(),
    endAt: new Date(r.end_at).toISOString(),
    blockEnd: new Date(r.block_end).toISOString(),
    status: r.status,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    car: r.car,
    comment: r.comment ?? '',
    source: r.source,
    createdAt: new Date(r.created_at).toISOString(),
    cancelledAt: r.cancelled_at,
  };
}

export function bookingToRow(b: Omit<Booking, 'id' | 'createdAt' | 'cancelledAt'>) {
  return {
    studio_id: b.studioId,
    service_id: b.serviceId,
    service_name: b.serviceName,
    price: b.price,
    bay: b.bay,
    start_at: b.startAt,
    end_at: b.endAt,
    block_end: b.blockEnd,
    status: b.status,
    customer_name: b.customerName,
    customer_phone: b.customerPhone,
    car: b.car,
    comment: b.comment,
    source: b.source,
  };
}

export function toPublicBooking(b: Booking): PublicBooking {
  const { bay: _bay, blockEnd: _blockEnd, source: _source, ...rest } = b;
  return rest;
}

export function rowToPayment(r: PaymentRow): Payment {
  return {
    id: r.id,
    studioId: r.studio_id,
    bookingId: r.booking_id,
    kind: r.kind,
    amount: Number(r.amount),
    method: r.method,
    note: r.note ?? '',
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export function bookingsToBusy(bookings: Pick<Booking, 'id' | 'bay' | 'startAt' | 'blockEnd' | 'status'>[]): BusyInterval[] {
  return bookings
    .filter((b) => b.status !== 'cancelled')
    .map((b) => ({ bay: b.bay, start: b.startAt, end: b.blockEnd, bookingId: b.id }));
}

/** Случайный токен для управления записью без регистрации. */
export function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
