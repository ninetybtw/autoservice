import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { BookingStatus, CreateBookingInput, PaymentInput, Studio, StudioSettings } from '@shared/schema.ts';
import type { AssistantMode, ChatMessage } from '@shared/assistant/tools.ts';
import { busyQueryRange } from '@shared/slots.ts';
import { backend, type OwnerBookingDraft } from './index.ts';
import { findMyBooking, myBookings, rememberBooking } from './myBookings.ts';

export const qk = {
  studio: (slug: string) => ['studio', slug] as const,
  busy: (studioId: string) => ['busy', studioId] as const,
  booking: (id: string) => ['booking', id] as const,
  owner: (studioId: string) => ['owner', studioId] as const,
  ownerBookings: (studioId: string, from: string, to: string) => ['owner', studioId, 'bookings', from, to] as const,
  ownerPayments: (studioId: string, from: string, to: string) => ['owner', studioId, 'payments', from, to] as const,
};

export function useStudioQuery(slug: string) {
  return useQuery({ queryKey: qk.studio(slug), queryFn: () => backend.getStudio(slug), staleTime: 60_000 });
}

export function useBusy(studio: Studio) {
  return useQuery({
    queryKey: qk.busy(studio.id),
    queryFn: () => {
      const r = busyQueryRange(studio.settings, new Date());
      return backend.getBusy(studio.id, r.from, r.to);
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}

export function useCreateBooking(studio: Studio) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingInput) => backend.createBooking(input),
    onSuccess: ({ booking, token }) => {
      rememberBooking({ id: booking.id, token, slug: studio.slug, booking });
      qc.setQueryData(qk.booking(booking.id), booking);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.busy(studio.id) }),
  });
}

export function useMyBooking(id: string, token: string | null) {
  return useQuery({
    queryKey: qk.booking(id),
    queryFn: async () => {
      if (!token) throw new Error('Нет доступа к записи');
      const booking = await backend.getBooking(id, token);
      const ref = findMyBooking(id);
      if (ref) rememberBooking({ ...ref, booking });
      return booking;
    },
    initialData: () => findMyBooking(id)?.booking,
    initialDataUpdatedAt: 0,
    enabled: Boolean(token),
  });
}

export function useCancelBooking(studio: Studio) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) => backend.cancelBooking(id, token),
    onSuccess: (booking) => {
      const ref = findMyBooking(booking.id);
      if (ref) rememberBooking({ ...ref, booking });
      qc.setQueryData(qk.booking(booking.id), booking);
      qc.invalidateQueries({ queryKey: qk.busy(studio.id) });
    },
  });
}

function subscribe(cb: () => void) {
  window.addEventListener('my-bookings', cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener('my-bookings', cb);
    window.removeEventListener('storage', cb);
  };
}

export function useMyBookings(slug: string) {
  const snapshot = useSyncExternalStore(subscribe, () => JSON.stringify(myBookings(slug)));
  return JSON.parse(snapshot) as ReturnType<typeof myBookings>;
}

export function useAssistant(slug: string, mode: AssistantMode) {
  return useMutation({ mutationFn: (messages: ChatMessage[]) => backend.ask(slug, mode, messages) });
}

// ---------------------------------------------------------------------------
// Кабинет владельца
// ---------------------------------------------------------------------------

export function useOwner(studio: Studio) {
  return useQuery({ queryKey: [...qk.owner(studio.id), 'me'], queryFn: () => backend.currentOwner(studio), staleTime: 60_000 });
}

export function useOwnerData(studio: Studio, from: Date, to: Date, enabled = true) {
  const bookings = useQuery({
    queryKey: qk.ownerBookings(studio.id, from.toISOString(), to.toISOString()),
    queryFn: () => backend.listBookings(studio.id, from, to),
    refetchInterval: 30_000,
    enabled,
  });
  const payments = useQuery({
    queryKey: qk.ownerPayments(studio.id, from.toISOString(), to.toISOString()),
    queryFn: () => backend.listPayments(studio.id, from, to),
    refetchInterval: 30_000,
    enabled,
  });
  return { bookings, payments };
}

function useOwnerInvalidate(studio: Studio) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.owner(studio.id) });
    qc.invalidateQueries({ queryKey: qk.busy(studio.id) });
  };
}

export function useSaveBooking(studio: Studio) {
  const invalidate = useOwnerInvalidate(studio);
  return useMutation({ mutationFn: (draft: OwnerBookingDraft) => backend.saveBooking(studio, draft), onSettled: invalidate });
}

export function useSetStatus(studio: Studio) {
  const invalidate = useOwnerInvalidate(studio);
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) => backend.setBookingStatus(studio, id, status),
    onSettled: invalidate,
  });
}

export function useAddPayment(studio: Studio) {
  const invalidate = useOwnerInvalidate(studio);
  return useMutation({ mutationFn: (input: PaymentInput) => backend.addPayment(studio, input), onSettled: invalidate });
}

/**
 * Сохранение настроек студии. Принимает функцию-изменение: она применяется к самой свежей
 * версии настроек с сервера, поэтому, например, замена одного фото не затирает другие работы.
 */
export function useUpdateSettings(studio: Studio) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (change: StudioSettings | ((current: StudioSettings) => StudioSettings)) => {
      const fresh = (await backend.getStudio(studio.slug)) ?? studio;
      const next = typeof change === 'function' ? change(fresh.settings) : change;
      return backend.updateSettings(fresh, next);
    },
    onSuccess: (settings) => {
      qc.setQueryData<Studio | null>(qk.studio(studio.slug), (old) => (old ? { ...old, settings } : old));
      qc.invalidateQueries({ queryKey: qk.busy(studio.id) });
    },
  });
}
