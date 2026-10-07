import type {
  Booking,
  BookingStatus,
  BusyInterval,
  CreateBookingInput,
  Payment,
  PaymentInput,
  PublicBooking,
  Studio,
  StudioSettings,
} from '@shared/schema.ts';
import type { AssistantMode, AssistantReply, ChatMessage } from '@shared/assistant/tools.ts';
import { checkSlot, SLOT_ERROR_TEXT, type JobTiming } from '@shared/slots.ts';

export class UserError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export interface OwnerBookingDraft {
  /** Существующая запись — перенос или правка */
  id?: string;
  serviceId: string;
  startAt: string;
  customerName: string;
  customerPhone: string;
  car: string;
  comment: string;
}

export interface Backend {
  mode: 'demo' | 'supabase';
  /** Можно ли отправлять push-напоминания с сервера */
  supportsPush: boolean;
  listStudios(): Promise<{ slug: string; name: string }[]>;
  getStudio(slug: string): Promise<Studio | null>;
  getBusy(studioId: string, from: Date, to: Date): Promise<BusyInterval[]>;

  createBooking(input: CreateBookingInput): Promise<{ booking: PublicBooking; token: string }>;
  getBooking(id: string, token: string): Promise<PublicBooking>;
  cancelBooking(id: string, token: string): Promise<PublicBooking>;
  savePushSubscription(id: string, token: string, subscription: PushSubscriptionJSON): Promise<void>;

  ask(slug: string, mode: AssistantMode, messages: ChatMessage[]): Promise<AssistantReply>;

  signIn(studio: Studio, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  currentOwner(studio: Studio): Promise<{ email: string } | null>;
  listBookings(studioId: string, from: Date, to: Date): Promise<Booking[]>;
  listPayments(studioId: string, from: Date, to: Date): Promise<Payment[]>;
  saveBooking(studio: Studio, draft: OwnerBookingDraft): Promise<Booking>;
  setBookingStatus(studio: Studio, id: string, status: BookingStatus): Promise<void>;
  addPayment(studio: Studio, input: PaymentInput): Promise<void>;
  updateSettings(studio: Studio, settings: StudioSettings): Promise<StudioSettings>;
  uploadMedia(studio: Studio, file: Blob, name: string): Promise<string>;
}

/** Общая проверка ручной записи/переноса для кабинета владельца. */
export function planOwnerBooking(
  studio: Studio,
  draft: OwnerBookingDraft,
  busy: BusyInterval[],
  current?: Booking,
): { timing: JobTiming; bay: number; serviceName: string; price: number } {
  const service = studio.settings.services.find((s) => s.id === draft.serviceId);
  if (!service) throw new UserError('Выберите услугу');
  const check = checkSlot(studio.settings, service, new Date(draft.startAt), busy, new Date(), {
    ignoreLead: true,
    excludeBookingId: draft.id,
    preferBay: current?.bay,
  });
  if (!check.ok) throw new UserError(check.reason === 'busy' ? 'В это время все боксы заняты.' : SLOT_ERROR_TEXT[check.reason], check.reason);
  const sameService = current && current.serviceId === service.id;
  return {
    timing: check.timing,
    bay: check.bay,
    serviceName: service.name,
    price: sameService ? current.price : service.price,
  };
}
