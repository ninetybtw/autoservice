/** Карточка записи в кабинете: просмотр, смена статуса, оплаты и возвраты, перенос и ручная запись. */
import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowCounterClockwise, CalendarBlank, Car, CheckCircle, Phone, Prohibit, UserCircle, Wrench, XCircle } from '@phosphor-icons/react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Banner } from '@astryxdesign/core/Banner';
import {
  BOOKING_STATUS_LABELS,
  customerSchema,
  formatPhone,
  formatPrice,
  type Booking,
  type BookingStatus,
  type Payment,
} from '@shared/schema.ts';
import { bookingsToBusy } from '@shared/db.ts';
import { addDaysToDate, localDateOf, slotsForDate, zonedToInstant } from '@shared/slots.ts';
import { formatDateLong, formatTime, formatWhen } from '@shared/format.ts';
import { bookingPaid } from '@shared/stats.ts';
import { backend, UserError } from '../../data/index.ts';
import { useAddPayment, useSaveBooking, useSetStatus } from '../../data/hooks.ts';
import { useStudio } from '../../studio.tsx';

const METHOD_LABELS: Record<Payment['method'], string> = { card: 'Карта', cash: 'Наличные', transfer: 'Перевод' };

export type DialogState = { mode: 'view'; booking: Booking } | { mode: 'create'; date: string } | null;

export function BookingDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const close = () => {
    setEditing(false);
    onClose();
  };
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const title = state?.mode === 'create' ? 'Новая запись' : editing ? 'Перенос и изменения' : 'Запись';
  return (
    <Dialog isOpen={state !== null} onOpenChange={(o) => !o && close()} width={620} variant={narrow ? 'fullscreen' : 'standard'}>
      <DialogHeader title={title} onOpenChange={(o) => !o && close()} />
      <div style={{ padding: '4px 16px 20px' }}>
        {state?.mode === 'create' && <BookingForm initialDate={state.date} onDone={close} />}
        {state?.mode === 'view' &&
          (editing ? (
            <BookingForm booking={state.booking} initialDate={state.booking.startAt} onDone={close} />
          ) : (
            <BookingView booking={state.booking} onEdit={() => setEditing(true)} onClose={close} />
          ))}
      </div>
    </Dialog>
  );
}

function BookingView({ booking, onEdit, onClose }: { booking: Booking; onEdit: () => void; onClose: () => void }) {
  const studio = useStudio();
  const tz = studio.settings.timezone;
  const now = new Date();
  const setStatus = useSetStatus(studio);
  const [error, setError] = useState<string | null>(null);
  const [status, setLocalStatus] = useState<BookingStatus>(booking.status);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const change = async (next: BookingStatus) => {
    setError(null);
    try {
      await setStatus.mutateAsync({ id: booking.id, status: next });
      setLocalStatus(next);
      if (next === 'cancelled') onClose();
    } catch (e) {
      setError(e instanceof UserError ? e.message : 'Не удалось сохранить');
    }
  };

  const tel = booking.customerPhone.replace(/[^\d+]/g, '');
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 20 }}>{booking.serviceName}</strong>
        <span className={`status ${status}`}>{BOOKING_STATUS_LABELS[status]}</span>
      </div>
      <div className="summary">
        <div className="summary-row">
          <CalendarBlank size={20} weight="fill" aria-hidden />
          <div>
            <strong>{formatWhen(booking.startAt, now, tz)}</strong> · бокс {booking.bay}
            <small>Готово {formatWhen(booking.endAt, now, tz)}</small>
          </div>
        </div>
        <div className="summary-row">
          <UserCircle size={20} weight="fill" aria-hidden />
          <div>
            {booking.customerName}
            <small>
              <a href={`tel:${tel}`}>{formatPhone(booking.customerPhone)}</a> · {booking.source === 'client' ? 'записался сам' : 'записан вручную'}
            </small>
          </div>
        </div>
        <div className="summary-row">
          <Car size={20} weight="fill" aria-hidden />
          <div>{booking.car}</div>
        </div>
        {booking.comment && (
          <div className="summary-row">
            <Wrench size={20} weight="fill" aria-hidden />
            <div>{booking.comment}</div>
          </div>
        )}
      </div>

      {error && <Banner status="error" title={error} />}
      <div className="row">
        {status === 'booked' && (
          <Button label="Машина принята" variant="primary" icon={<Car size={18} weight="fill" />} onClick={() => change('arrived')} isLoading={setStatus.isPending} />
        )}
        {(status === 'booked' || status === 'arrived') && (
          <Button label="Готово" variant={status === 'arrived' ? 'primary' : 'secondary'} icon={<CheckCircle size={18} weight="fill" />} onClick={() => change('ready')} />
        )}
        {status === 'booked' && <Button label="Не приехал" variant="secondary" icon={<Prohibit size={18} />} onClick={() => change('no_show')} />}
        {(status === 'ready' || status === 'no_show' || status === 'cancelled') && (
          <Button label="Вернуть в «Записан»" variant="secondary" icon={<ArrowCounterClockwise size={18} />} onClick={() => change('booked')} />
        )}
        <Button label="Перенести / изменить" variant="secondary" icon={<CalendarBlank size={18} />} onClick={onEdit} />
        {status !== 'cancelled' && !confirmCancel && (
          <Button label="Отменить запись" variant="destructive" icon={<XCircle size={18} />} onClick={() => setConfirmCancel(true)} />
        )}
        <Button label="Позвонить" variant="ghost" icon={<Phone size={18} />} href={`tel:${tel}`} />
      </div>
      {confirmCancel && (
        <div className="confirm-row" role="alertdialog" aria-label="Подтверждение отмены">
          <strong>Отменить запись? Клиент: {booking.customerName}</strong>
          <span className="muted" style={{ fontSize: 15 }}>
            Время освободится для других. Предупредите клиента по телефону.
          </span>
          <div className="row">
            <Button label="Да, отменить" variant="destructive" onClick={() => change('cancelled')} isLoading={setStatus.isPending} />
            <Button label="Не отменять" variant="secondary" onClick={() => setConfirmCancel(false)} />
          </div>
        </div>
      )}

      <Payments booking={booking} />
    </div>
  );
}

function Payments({ booking }: { booking: Booking }) {
  const studio = useStudio();
  const start = new Date(booking.startAt);
  const from = new Date(Math.min(start.getTime(), new Date(booking.createdAt).getTime()) - 90 * 86_400_000);
  const to = new Date(Date.now() + 86_400_000);
  const payments = useQuery({
    queryKey: ['owner', studio.id, 'payments', 'booking', booking.id],
    queryFn: async () => (await backend.listPayments(studio.id, from, to)).filter((p) => p.bookingId === booking.id),
  });
  const add = useAddPayment(studio);
  const paid = bookingPaid(booking.id, payments.data ?? []);
  const [kind, setKind] = useState<Payment['kind']>('payment');
  const [method, setMethod] = useState<Payment['method']>('card');
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggested = kind === 'payment' ? Math.max(0, booking.price - paid) : paid;
  const value = amount ?? suggested;

  const submit = async () => {
    setError(null);
    if (!value || value <= 0) return setError('Укажите сумму');
    if (kind === 'refund' && value > paid) return setError(`Вернуть можно не больше, чем оплачено (${formatPrice(paid)})`);
    try {
      await add.mutateAsync({ bookingId: booking.id, kind, amount: value, method, note: '' });
      setAmount(null);
      await payments.refetch();
    } catch (e) {
      setError(e instanceof UserError ? e.message : 'Не удалось сохранить оплату');
    }
  };

  return (
    <section className="card stack" style={{ marginTop: 6 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Оплата</h3>
        <span>
          Оплачено <strong>{formatPrice(paid)}</strong> из {formatPrice(booking.price)}
        </span>
      </div>
      {(payments.data ?? []).map((p) => (
        <div key={p.id} className="row muted" style={{ fontSize: 14.5 }}>
          <span className="grow">
            {formatWhen(p.createdAt, new Date(), studio.settings.timezone)} · {METHOD_LABELS[p.method]}
          </span>
          <strong style={{ color: p.kind === 'refund' ? '#ff8a8a' : '#7ee08f' }}>
            {p.kind === 'refund' ? '−' : '+'}
            {formatPrice(p.amount)}
          </strong>
        </div>
      ))}
      <SegmentedControl label="Тип операции" value={kind} onChange={(v) => { setKind(v as Payment['kind']); setAmount(null); }} layout="fill">
        <SegmentedControlItem value="payment" label="Оплата" />
        <SegmentedControlItem value="refund" label="Возврат" />
      </SegmentedControl>
      <SegmentedControl label="Способ" value={method} onChange={(v) => setMethod(v as Payment['method'])} layout="fill">
        <SegmentedControlItem value="card" label="Карта" />
        <SegmentedControlItem value="cash" label="Наличные" />
        <SegmentedControlItem value="transfer" label="Перевод" />
      </SegmentedControl>
      <NumberInput label="Сумма, ₽" value={value} onChange={setAmount} min={0} step={100} isIntegerOnly />
      {error && <Banner status="error" title={error} />}
      <Button label={kind === 'payment' ? 'Внести оплату' : 'Оформить возврат'} variant={kind === 'payment' ? 'primary' : 'destructive'} onClick={submit} isLoading={add.isPending} />
    </section>
  );
}

function BookingForm({ booking, initialDate, onDone }: { booking?: Booking; initialDate: string; onDone: () => void }) {
  const studio = useStudio();
  const { settings } = studio;
  const tz = settings.timezone;
  const save = useSaveBooking(studio);
  const services = settings.services.filter((s) => s.active || s.id === booking?.serviceId);
  const [serviceId, setServiceId] = useState(booking?.serviceId ?? services[0]?.id ?? '');
  const [date, setDate] = useState(initialDate.length > 10 ? localDateOf(new Date(initialDate), tz) : initialDate);
  const [time, setTime] = useState<string | null>(booking ? formatTime(booking.startAt, tz) : null);
  const [form, setForm] = useState({
    customerName: booking?.customerName ?? '',
    customerPhone: booking?.customerPhone ?? '',
    car: booking?.car ?? '',
    comment: booking?.comment ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const service = services.find((s) => s.id === serviceId);

  const nearby = useQuery({
    queryKey: ['owner', studio.id, 'bookings', 'around', date],
    queryFn: () => backend.listBookings(studio.id, zonedToInstant(addDaysToDate(date, -14), '00:00', tz), zonedToInstant(addDaysToDate(date, 14), '00:00', tz)),
  });
  const slots = useMemo(
    () =>
      service && nearby.data
        ? slotsForDate({ settings, durationMinutes: service.durationMinutes, date, busy: bookingsToBusy(nearby.data), now: new Date(), ignoreLead: true, excludeBookingId: booking?.id })
        : [],
    [service, nearby.data, settings, date, booking?.id],
  );
  const slot = slots.find((s) => s.time === time);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = customerSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    if (!slot) return setError('Выберите свободное время');
    try {
      await save.mutateAsync({ id: booking?.id, serviceId, startAt: slot.start.toISOString(), ...parsed.data });
      onDone();
    } catch (err) {
      setError(err instanceof UserError ? err.message : 'Не удалось сохранить');
      nearby.refetch();
    }
  };

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      <Selector
        label="Услуга"
        value={serviceId}
        onChange={(v) => {
          setServiceId(v);
          setTime(null);
        }}
        options={services.map((s) => ({ value: s.id, label: `${s.name} — ${formatPrice(s.price, s.priceFrom)}` }))}
      />
      <div>
        <label className="field-label" htmlFor="owner-date">
          Дата
        </label>
        <input
          id="owner-date"
          className="native-input"
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) {
              setDate(e.target.value);
              setTime(null);
            }
          }}
        />
        <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          {formatDateLong(date)}
        </div>
      </div>
      <div>
        <div className="field-label">Время</div>
        {nearby.isPending ? (
          <p className="muted">Загружаем расписание…</p>
        ) : slots.length === 0 ? (
          <p className="muted">В этот день сервис не работает или услуга не помещается в график.</p>
        ) : (
          <div className="slots">
            {slots.map((s) => (
              <button
                key={s.time}
                type="button"
                className={`slot ${s.status === 'busy' ? 'busy' : ''}`}
                aria-pressed={s.time === time}
                disabled={s.status === 'busy'}
                onClick={() => setTime(s.time)}
              >
                {s.time}
                {s.status === 'busy' && <span className="slot-note">занято</span>}
              </button>
            ))}
          </div>
        )}
        {slot && (
          <p className="muted" style={{ margin: '8px 0 0' }}>
            Готово {formatWhen(slot.workEnd, new Date(), tz)}
          </p>
        )}
      </div>
      <TextInput label="Имя клиента" value={form.customerName} onChange={set('customerName')} status={errors.customerName ? { type: 'error', message: errors.customerName } : undefined} />
      <TextInput label="Телефон" value={form.customerPhone} onChange={set('customerPhone')} autoComplete="off" status={errors.customerPhone ? { type: 'error', message: errors.customerPhone } : undefined} />
      <TextInput label="Автомобиль" value={form.car} onChange={set('car')} status={errors.car ? { type: 'error', message: errors.car } : undefined} />
      <TextArea label="Комментарий" isOptional value={form.comment} onChange={set('comment')} rows={2} />
      {error && <Banner status="error" title={error} />}
      <Button label={booking ? 'Сохранить изменения' : 'Записать'} variant="primary" size="lg" width="100%" type="submit" isLoading={save.isPending} />
    </form>
  );
}
