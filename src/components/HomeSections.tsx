import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChatCircleDots, Clock, MapPin, NavigationArrow, Phone, CalendarPlus, X } from '@phosphor-icons/react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { IconButton } from '@astryxdesign/core/IconButton';
import { WEEKDAYS, WEEKDAY_LABELS, formatServicePrice } from '@shared/schema.ts';
import { localDateOf, nearestFreeSlots, weekdayOf } from '@shared/slots.ts';
import { formatDateLong, formatTime, formatWhen } from '@shared/format.ts';
import { useBusy } from '../data/hooks.ts';
import { useMedia, useStudio } from '../studio.tsx';
import { Reveal } from './Reveal.tsx';
import { INFO_ICON } from './icons.tsx';
import { ServiceRow } from './ServiceRow.tsx';
import { Photo, PhotoPlaceholder } from './Photo.tsx';
import { clientExamples } from '@shared/assistant/fallback.ts';

/** Карточка «Запись» на главной: услуга → ближайшее время → переход к выбору даты. */
export function BookingSection() {
  const studio = useStudio();
  const { settings, slug } = studio;
  const services = settings.services.filter((s) => s.active);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const service = services.find((s) => s.id === serviceId) ?? services[0];
  const busy = useBusy(studio);
  const navigate = useNavigate();
  const nearest = useMemo(
    () =>
      service && busy.data
        ? nearestFreeSlots({ settings, durationMinutes: service.durationMinutes, busy: busy.data, now: new Date(), limit: 3 })
        : [],
    [service, busy.data, settings],
  );
  const tz = settings.timezone;

  return (
    <Reveal as="section" className="section" id="booking">
      <h2 className="section-title" style={{ fontSize: 'clamp(30px, 7vw, 40px)' }}>
        Запись
      </h2>
      <div className="card card-accent stack">
        <p className="lead" style={{ color: '#e9e9ee' }}>
          Выберите услугу — покажем ближайшее свободное время.
        </p>
        <div className="chips" role="radiogroup" aria-label="Услуга">
          {services.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={s.id === service?.id} onClick={() => setServiceId(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
        {service && (
          <div className="meta-row" style={{ marginTop: 0 }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>{formatServicePrice(service.price, service.priceFrom)}</span>
          </div>
        )}
        <div>
          <div className="field-label">Ближайшее свободное время</div>
          {busy.isPending ? (
            <p className="muted">Проверяем расписание…</p>
          ) : nearest.length === 0 ? (
            <p className="muted">В ближайший месяц свободного времени нет — позвоните нам.</p>
          ) : (
            <div className="chips">
              {nearest.map((slot) => (
                <button
                  key={slot.start.toISOString()}
                  type="button"
                  className="chip"
                  onClick={() => navigate(`/${slug}/book?service=${service!.id}&date=${localDateOf(slot.start, tz)}&time=${slot.time}`)}
                >
                  <Clock size={18} aria-hidden />
                  {formatWhen(slot.start, new Date(), tz)}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          label="Выбрать дату и время"
          variant="primary"
          size="lg"
          width="100%"
          icon={<CalendarPlus size={20} weight="bold" />}
          href={`/${slug}/book${service ? `?service=${service.id}` : ''}`}
        />
      </div>
    </Reveal>
  );
}

export function AboutSection() {
  const { settings } = useStudio();
  return (
    <Reveal as="section" className="section" id="about">
      <span className="eyebrow">О сервисе</span>
      <h2 className="section-title" style={{ marginTop: 8 }}>
        {settings.name}
      </h2>
      {settings.description && (
        <p className="lead" style={{ marginBottom: 18 }}>
          {settings.description}
        </p>
      )}
      <div className="info-grid">
        {settings.infoCards.map((c, i) => {
          const Icon = INFO_ICON[c.icon];
          return (
            <article key={i} className="card info-card">
              <span className="icon-tile">
                <Icon size={26} weight="duotone" aria-hidden />
              </span>
              <div>
                <h3>{c.title}</h3>
                {c.text && <p>{c.text}</p>}
              </div>
            </article>
          );
        })}
      </div>
    </Reveal>
  );
}

export function ServicesSection() {
  const { settings, slug } = useStudio();
  const services = settings.services.filter((s) => s.active);
  return (
    <Reveal as="section" className="section" id="services">
      <h2 className="section-title">
        Услуги и <span className="accent">цены</span>
      </h2>
      <div className="service-list two">
        {services.map((s) => (
          <ServiceRow key={s.id} service={s} />
        ))}
      </div>
      <p style={{ marginTop: 14 }}>
        <Link to={`/${slug}/services`} className="text-link">
          Все услуги на отдельной странице →
        </Link>
      </p>
    </Reveal>
  );
}

export function WorksSection() {
  const { settings } = useStudio();
  const media = useMedia();
  const [open, setOpen] = useState<number | null>(null);
  if (settings.works.length === 0) return null;
  const current = open !== null ? settings.works[open] : null;
  return (
    <Reveal as="section" className="section" id="works">
      <h2 className="section-title">Наши работы</h2>
      {/* Лента прокручивается с клавиатуры даже без кликабельных фото */}
      <div className="works" tabIndex={0} role="region" aria-label="Фото работ, листайте вбок">
        {settings.works.map((w, i) => (
          <figure key={w.id} className="work">
            {w.image ? (
              <button type="button" onClick={() => setOpen(i)} aria-label={`Открыть фото: ${w.caption || 'работа'}`}>
                <Photo src={media(w.image)} fallback={media(w.fallback) || undefined} alt={w.caption} loading="lazy" decoding="async" />
              </button>
            ) : (
              <PhotoPlaceholder />
            )}
            {w.caption && <figcaption>{w.caption}</figcaption>}
          </figure>
        ))}
      </div>
      <Dialog isOpen={current !== null} onOpenChange={(o) => !o && setOpen(null)} width={980} padding={0}>
        {current && (
          <div style={{ position: 'relative' }}>
            <Photo
              src={media(current.image)}
              fallback={media(current.fallback) || undefined}
              alt={current.caption}
              style={{ width: '100%', maxHeight: '78svh', objectFit: 'contain', background: '#000' }}
            />
            {current.caption && <p style={{ margin: 0, padding: '14px 16px 18px' }}>{current.caption}</p>}
            <div style={{ position: 'absolute', top: 10, right: 10 }}>
              <IconButton label="Закрыть" icon={<X size={20} />} onClick={() => setOpen(null)} />
            </div>
          </div>
        )}
      </Dialog>
    </Reveal>
  );
}

export function AssistantSection({ onAsk }: { onAsk: (q: string | null) => void }) {
  const { settings } = useStudio();
  return (
    <Reveal as="section" className="section" id="assistant">
      <div className="card stack">
        <div className="card-head">
          <span className="icon-tile">
            <ChatCircleDots size={26} weight="duotone" aria-hidden />
          </span>
          <div>
            <h2>Спросите помощника</h2>
            <p>Отвечает по ценам и свободному времени этого автосервиса.</p>
          </div>
        </div>
        <div className="chips">
          {clientExamples(settings).map((q) => (
            <button key={q} type="button" className="chip" onClick={() => onAsk(q)}>
              {q}
            </button>
          ))}
        </div>
        <Button label="Написать свой вопрос" variant="secondary" width="100%" onClick={() => onAsk(null)} />
      </div>
    </Reveal>
  );
}

export function ContactsSection() {
  const { settings } = useStudio();
  const c = settings.contacts;
  const tel = c.phone.replace(/[^\d+]/g, '');
  const now = new Date();
  const today = localDateOf(now, settings.timezone);
  const todayWd = weekdayOf(today);
  const upcoming = settings.schedule.exceptions.filter((e) => e.date >= today).slice(0, 3);
  const mapUrl = c.mapUrl || `https://yandex.ru/maps/?text=${encodeURIComponent(c.address)}`;
  return (
    <Reveal as="section" className="section" id="contacts">
      <h2 className="section-title">Как нас найти</h2>
      <div className="split">
        <div className="card stack">
          <div className="summary-row">
            <MapPin size={22} weight="fill" aria-hidden />
            <div>
              <strong style={{ fontSize: 18 }}>{c.address}</strong>
              {c.howToFind && <small style={{ fontSize: 15.5, marginTop: 4 }}>{c.howToFind}</small>}
            </div>
          </div>
          <div className="row">
            <Button label="Маршрут" variant="secondary" icon={<NavigationArrow size={18} weight="fill" />} href={mapUrl} target="_blank" rel="noopener" />
            <Button label={c.phone} variant="secondary" icon={<Phone size={18} weight="fill" />} href={`tel:${tel}`} />
          </div>
        </div>
        <div className="card">
          <h3 style={{ margin: '0 0 12px', fontSize: 18 }}>Время работы</h3>
          <dl className="hours">
            {WEEKDAYS.map((d) => {
              const h = settings.schedule.weekly[d];
              return (
                <div key={d} style={{ display: 'contents' }} className={d === todayWd ? 'today' : ''}>
                  <dt className={d === todayWd ? 'today' : ''}>{WEEKDAY_LABELS[d]}</dt>
                  <dd className={d === todayWd ? 'today' : ''}>{h ? `${h.open}–${h.close}` : 'выходной'}</dd>
                </div>
              );
            })}
          </dl>
          {upcoming.length > 0 && (
            <div className="stack" style={{ marginTop: 14, gap: 6 }}>
              {upcoming.map((e) => (
                <p key={e.date} className="muted" style={{ margin: 0, fontSize: 14.5 }}>
                  {formatDateLong(e.date)}: {e.hours ? `${e.hours.open}–${e.hours.close}` : 'выходной'}
                  {e.note ? ` — ${e.note}` : ''}
                </p>
              ))}
            </div>
          )}
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
            Сейчас в сервисе {formatTime(now, settings.timezone)}
          </p>
        </div>
      </div>
    </Reveal>
  );
}
