import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CalendarBlank, Car, CheckCircle, Clock, CurrencyRub, MapPin, NavigationArrow, Phone, ShareNetwork, Wrench } from '@phosphor-icons/react';
import { Button } from '@astryxdesign/core/Button';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Banner } from '@astryxdesign/core/Banner';
import { Spinner } from '@astryxdesign/core/Spinner';
import { BOOKING_STATUS_LABELS, formatPhone, formatServicePrice } from '@shared/schema.ts';
import { formatDateLong, formatWhen } from '@shared/format.ts';
import { localDateOf } from '@shared/slots.ts';
import { canClientCancel, cancellationText } from '@shared/policy.ts';
import { useCancelBooking, useMyBooking } from '../data/hooks.ts';
import { findMyBooking, rememberBooking } from '../data/myBookings.ts';
import { UserError } from '../data/index.ts';
import { useStudio } from '../studio.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { ReminderOffer } from '../components/ReminderOffer.tsx';
import { refreshGlass } from '../components/LiquidGlass.tsx';

export function BookingPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const studio = useStudio();
  const { settings, slug } = studio;
  const tz = settings.timezone;
  const token = params.get('t') ?? findMyBooking(id)?.token ?? null;
  const isNew = params.get('new') === '1';
  const { data: booking, isPending, error } = useMyBooking(id, token);
  const cancel = useCancelBooking(studio);
  const [confirm, setConfirm] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Открыли по ссылке на другом устройстве — запоминаем запись здесь
  useEffect(() => {
    if (booking && token && !findMyBooking(id)) rememberBooking({ id, token, slug, booking });
  }, [booking, token, id, slug]);
  useEffect(() => refreshGlass(600), [booking?.status]);

  const link = `${location.origin}/${slug}/my/${id}${token ? `?t=${encodeURIComponent(token)}` : ''}`;

  if (!token) {
    return (
      <main>
        <PageHeader title="Запись" back={`/${slug}/my`} />
        <div className="page page-narrow">
          <Banner status="warning" title="Нет доступа к записи" description="Откройте полную ссылку, которую вы получили после записи." />
        </div>
      </main>
    );
  }
  if (!booking) {
    return (
      <main>
        <PageHeader title="Запись" back={`/${slug}/my`} />
        <div className="page page-narrow">
          {isPending ? <Spinner label="Загружаем запись" /> : <Banner status="error" title={error instanceof UserError ? error.message : 'Не удалось загрузить запись'} />}
        </div>
      </main>
    );
  }

  const now = new Date();
  const can = canClientCancel(settings, booking, now);
  const active = booking.status !== 'cancelled' && new Date(booking.endAt) > now;
  const tel = settings.contacts.phone.replace(/[^\d+]/g, '');

  const share = async () => {
    const text = `Запись в ${settings.name}: ${booking.serviceName}, ${formatWhen(booking.startAt, now, tz)}`;
    try {
      if (navigator.share) await navigator.share({ title: settings.name, text, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      /* пользователь закрыл окно */
    }
  };

  return (
    <main>
      <PageHeader title={isNew ? 'Готово' : 'Моя запись'} back={`/${slug}/my`} />
      <div className="page page-narrow stack">
        {isNew && booking.status === 'booked' && (
          <div className="success-hero">
            <div className="check">
              <CheckCircle size={44} weight="fill" aria-hidden />
            </div>
            <h2>Вы записаны!</h2>
            <p className="lead">Ждём вас {formatWhen(booking.startAt, now, tz)}.</p>
          </div>
        )}

        <section className="card summary" aria-label="Подробности записи">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 20 }}>{booking.serviceName}</strong>
            <span className={`status ${booking.status}`}>{BOOKING_STATUS_LABELS[booking.status]}</span>
          </div>
          <div className="summary-row">
            <CalendarBlank size={20} weight="fill" aria-hidden />
            <div>
              <strong>{formatWhen(booking.startAt, now, tz)}</strong>
              <small>{formatDateLong(localDateOf(new Date(booking.startAt), tz))}</small>
            </div>
          </div>
          <div className="summary-row">
            <Clock size={20} weight="fill" aria-hidden />
            <div>
              Машина будет готова <strong>{formatWhen(booking.endAt, now, tz)}</strong>
            </div>
          </div>
          <div className="summary-row">
            <Car size={20} weight="fill" aria-hidden />
            <div>
              {booking.car}
              <small>
                {booking.customerName}, {formatPhone(booking.customerPhone)}
              </small>
            </div>
          </div>
          <div className="summary-row">
            <CurrencyRub size={20} weight="fill" aria-hidden />
            <div>{formatServicePrice(booking.price, settings.services.find((s) => s.id === booking.serviceId)?.priceFrom)}</div>
          </div>
          {booking.comment && (
            <div className="summary-row">
              <Wrench size={20} weight="fill" aria-hidden />
              <div>{booking.comment}</div>
            </div>
          )}
          <div className="summary-row">
            <MapPin size={20} weight="fill" aria-hidden />
            <div>
              {settings.contacts.address}
              {settings.contacts.howToFind && <small>{settings.contacts.howToFind}</small>}
            </div>
          </div>
          <div className="row">
            <Button
              label="Маршрут"
              size="sm"
              icon={<NavigationArrow size={16} weight="fill" />}
              href={settings.contacts.mapUrl || `https://yandex.ru/maps/?text=${encodeURIComponent(settings.contacts.address)}`}
              target="_blank"
              rel="noopener"
            />
            <Button label="Позвонить" size="sm" icon={<Phone size={16} weight="fill" />} href={`tel:${tel}`} />
            <Button label={copied ? 'Ссылка скопирована' : 'Поделиться'} size="sm" variant="ghost" icon={<ShareNetwork size={16} weight="bold" />} onClick={share} />
          </div>
        </section>

        {active && <ReminderOffer booking={booking} token={token} link={link} />}

        {booking.status !== 'cancelled' && (
          <section className="card stack">
            <h2 style={{ margin: 0, fontSize: 18 }}>Отмена записи</h2>
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>
              {cancellationText(settings)}
            </p>
            {cancelError && <Banner status="error" title={cancelError} />}
            {can.ok ? (
              <Button label="Отменить запись" variant="destructive" onClick={() => setConfirm(true)} />
            ) : (
              <p style={{ margin: 0 }}>{can.reason}</p>
            )}
          </section>
        )}
        {booking.status === 'cancelled' && (
          <Banner status="info" title="Запись отменена" description="Если хотите, запишитесь на другое время." />
        )}
        {booking.status === 'cancelled' && <Button label="Записаться снова" variant="primary" href={`/${slug}/book?service=${booking.serviceId}`} />}
      </div>

      <AlertDialog
        isOpen={confirm}
        onOpenChange={setConfirm}
        title="Отменить запись?"
        description={`${booking.serviceName}, ${formatWhen(booking.startAt, now, tz)}. Время освободится для других клиентов.`}
        cancelLabel="Не отменять"
        actionLabel="Отменить запись"
        actionVariant="destructive"
        isActionLoading={cancel.isPending}
        onAction={async () => {
          setCancelError(null);
          try {
            await cancel.mutateAsync({ id, token });
          } catch (e) {
            setCancelError(e instanceof UserError ? e.message : 'Не удалось отменить. Позвоните в сервис.');
          }
          setConfirm(false);
        }}
      />
    </main>
  );
}
