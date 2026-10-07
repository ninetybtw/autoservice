import { useMemo, useState } from 'react';
import { CaretLeft, CaretRight, Plus } from '@phosphor-icons/react';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Spinner } from '@astryxdesign/core/Spinner';
import { BOOKING_STATUS_LABELS, WEEKDAYS, formatPrice, type Booking } from '@shared/schema.ts';
import { addDaysToDate, localDateOf, weekdayOf, zonedToInstant } from '@shared/slots.ts';
import { formatDateLong, formatDateShort, formatTime, plural } from '@shared/format.ts';
import { periodStats, bookingPaid } from '@shared/stats.ts';
import { useOwnerData } from '../../data/hooks.ts';
import { useStudio } from '../../studio.tsx';
import { BookingDialog, type DialogState } from './BookingDialog.tsx';

type View = 'day' | 'week';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function DashboardPage() {
  const studio = useStudio();
  const tz = studio.settings.timezone;
  const today = localDateOf(new Date(), tz);
  const [view, setView] = useState<View>('day');
  const [anchor, setAnchor] = useState(today);
  const [dialog, setDialog] = useState<DialogState>(null);

  const start = view === 'day' ? anchor : addDaysToDate(anchor, -WEEKDAYS.indexOf(weekdayOf(anchor)));
  const end = addDaysToDate(start, view === 'day' ? 1 : 7);
  const from = useMemo(() => zonedToInstant(start, '00:00', tz), [start, tz]);
  const to = useMemo(() => zonedToInstant(end, '00:00', tz), [end, tz]);
  const { bookings, payments } = useOwnerData(studio, from, to);
  const stats = periodStats(bookings.data ?? [], payments.data ?? [], from, to);

  const days = useMemo(() => {
    const list = (bookings.data ?? []).slice().sort((a, b) => a.startAt.localeCompare(b.startAt));
    const groups = new Map<string, Booking[]>();
    const carried: Booking[] = [];
    for (const b of list) {
      const d = localDateOf(new Date(b.startAt), tz);
      if (d < start) {
        if (b.status !== 'cancelled') carried.push(b);
        continue;
      }
      groups.set(d, [...(groups.get(d) ?? []), b]);
    }
    return { groups: [...groups.entries()], carried };
  }, [bookings.data, tz, start]);

  const label =
    view === 'day'
      ? anchor === today
        ? `Сегодня, ${formatDateLong(anchor)}`
        : capitalize(formatDateLong(anchor))
      : `${formatDateShort(start)} — ${formatDateShort(addDaysToDate(end, -1))}`;
  const step = view === 'day' ? 1 : 7;

  const row = (b: Booking, carried = false) => (
    <button key={b.id} type="button" className={`booking-row ${b.status}`} onClick={() => setDialog({ mode: 'view', booking: b })}>
      <div className="booking-time">
        {formatTime(b.startAt, tz)}
        <small>
          {carried
            ? `с ${formatDateShort(localDateOf(new Date(b.startAt), tz))}`
            : localDateOf(new Date(b.endAt), tz) !== localDateOf(new Date(b.startAt), tz)
              ? `до ${formatDateShort(localDateOf(new Date(b.endAt), tz))} ${formatTime(b.endAt, tz)}`
              : `до ${formatTime(b.endAt, tz)}`}
        </small>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 16.5 }}>{b.serviceName}</strong>
          <span className={`status ${b.status}`}>{BOOKING_STATUS_LABELS[b.status]}</span>
        </div>
        <div className="muted" style={{ fontSize: 15 }}>
          {b.car} · {b.customerName}
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          Бокс {b.bay} · {formatPrice(b.price)}
          {bookingPaid(b.id, payments.data ?? []) > 0 ? ' · есть оплата' : ''}
        </div>
      </div>
    </button>
  );

  return (
    <main className="page stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <SegmentedControl label="Период" value={view} onChange={(v) => setView(v as View)}>
          <SegmentedControlItem value="day" label="День" />
          <SegmentedControlItem value="week" label="Неделя" />
        </SegmentedControl>
        <Button label="Записать вручную" variant="primary" icon={<Plus size={18} weight="bold" />} onClick={() => setDialog({ mode: 'create', date: anchor })} />
      </div>
      <div className="row">
        <IconButton label="Назад" icon={<CaretLeft size={18} />} onClick={() => setAnchor(addDaysToDate(anchor, -step))} />
        <strong className="grow" style={{ fontSize: 18, textAlign: 'center' }}>
          {label}
        </strong>
        <IconButton label="Вперёд" icon={<CaretRight size={18} />} onClick={() => setAnchor(addDaysToDate(anchor, step))} />
      </div>
      {anchor !== today && <Button label="Вернуться к сегодня" variant="ghost" size="sm" onClick={() => setAnchor(today)} />}

      <div className="kpis" aria-label="Итоги периода">
        <div className="kpi">
          <div className="label">Записей</div>
          <div className="value" data-testid="kpi-bookings">{stats.bookings}</div>
        </div>
        <div className="kpi">
          <div className="label">Заездов</div>
          <div className="value" data-testid="kpi-arrivals">{stats.arrivals}</div>
        </div>
        <div className="kpi">
          <div className="label">Готово</div>
          <div className="value" data-testid="kpi-completed">{stats.completed}</div>
        </div>
        <div className="kpi money">
          <div className="label">Получено</div>
          <div className="value" data-testid="kpi-money">{formatPrice(stats.net)}</div>
        </div>
      </div>
      {stats.refunded > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          Оплаты {formatPrice(stats.received)}, возвраты {formatPrice(stats.refunded)}.
        </p>
      )}

      {bookings.isPending ? (
        <Spinner label="Загружаем записи" />
      ) : (
        <>
          {days.carried.length > 0 && (
            <div className="day-group">
              <h3>В работе с прошлых дней</h3>
              <div className="stack">{days.carried.map((b) => row(b, true))}</div>
            </div>
          )}
          {days.groups.length === 0 && days.carried.length === 0 && (
            <div className="empty">
              {view === 'day' ? 'На этот день записей нет.' : 'На этой неделе записей нет.'}
            </div>
          )}
          {days.groups.map(([d, list]) => (
            <div key={d} className="day-group">
              <h3>
                {capitalize(formatDateLong(d))} · {list.filter((b) => b.status !== 'cancelled').length}{' '}
                {plural(list.filter((b) => b.status !== 'cancelled').length, ['запись', 'записи', 'записей'])}
              </h3>
              <div className="stack">{list.map((b) => row(b))}</div>
            </div>
          ))}
        </>
      )}
      <BookingDialog state={dialog} onClose={() => setDialog(null)} />
    </main>
  );
}
