import { Link } from 'react-router';
import { CalendarX, CaretRight } from '@phosphor-icons/react';
import { Button } from '@astryxdesign/core/Button';
import { BOOKING_STATUS_LABELS } from '@shared/schema.ts';
import { formatWhen } from '@shared/format.ts';
import { useMyBookings } from '../data/hooks.ts';
import { useStudio } from '../studio.tsx';
import { PageHeader } from '../components/PageHeader.tsx';

export function MyBookingsPage() {
  const { slug, settings } = useStudio();
  const list = useMyBookings(slug);
  const now = new Date();
  const upcoming = list.filter((r) => r.booking.status !== 'cancelled' && new Date(r.booking.endAt) > now).reverse();
  const past = list.filter((r) => !upcoming.includes(r));

  const item = (r: (typeof list)[number]) => (
    <Link key={r.id} to={`/${slug}/my/${r.id}`} className="card row" style={{ textDecoration: 'none' }}>
      <div className="grow">
        <div style={{ fontWeight: 800, fontSize: 17 }}>{r.booking.serviceName}</div>
        <div className="muted">{formatWhen(r.booking.startAt, now, settings.timezone)}</div>
      </div>
      <span className={`status ${r.booking.status}`}>{BOOKING_STATUS_LABELS[r.booking.status]}</span>
      <CaretRight size={20} aria-hidden />
    </Link>
  );

  return (
    <main>
      <PageHeader title="Моя запись" />
      <div className="page page-narrow stack">
        {list.length === 0 ? (
          <div className="empty">
            <CalendarX size={48} aria-hidden />
            <h2 style={{ color: '#fff', margin: '12px 0 6px' }}>Записей пока нет</h2>
            <p>Записаться можно за минуту — без регистрации.</p>
            <Button label="Записаться" variant="primary" size="lg" href={`/${slug}/book`} />
            <p style={{ fontSize: 14, marginTop: 18 }}>Записывались с другого телефона? Откройте ссылку из подтверждения записи.</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && <h2 className="step-title" style={{ marginTop: 8 }}>Предстоящие</h2>}
            {upcoming.map(item)}
            {past.length > 0 && <h2 className="step-title">История</h2>}
            {past.map(item)}
            <Button label="Записаться ещё" variant="secondary" href={`/${slug}/book`} />
          </>
        )}
      </div>
    </main>
  );
}
