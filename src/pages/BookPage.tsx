import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CalendarBlank, Car, Clock, Info, MapPin, Wrench } from '@phosphor-icons/react';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Banner } from '@astryxdesign/core/Banner';
import { customerSchema, formatServicePrice, type Service } from '@shared/schema.ts';
import { bookingDates, dayAvailability, localDateOf, slotsForDate } from '@shared/slots.ts';
import { formatDateLong, formatDayNumber, formatWeekdayShort, formatWhen, plural } from '@shared/format.ts';
import { useBusy, useCreateBooking } from '../data/hooks.ts';
import { UserError } from '../data/index.ts';
import { useStudio } from '../studio.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { durationText } from '../components/ServiceRow.tsx';
import { refreshGlass } from '../components/LiquidGlass.tsx';
import { useOnline } from '../lib/useOnline.ts';

const CONTACT_KEY = 'autoservice-contact:v1';
type Contact = { customerName: string; customerPhone: string; car: string; comment: string };

function loadContact(): Contact {
  const empty = { customerName: '', customerPhone: '', car: '', comment: '' };
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(CONTACT_KEY) ?? '{}'), comment: '' };
  } catch {
    return empty;
  }
}

export function BookPage() {
  const studio = useStudio();
  const { settings, slug } = studio;
  const tz = settings.timezone;
  const navigate = useNavigate();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const services = settings.services.filter((s) => s.active);
  const service: Service | undefined = services.find((s) => s.id === params.get('service'));
  const busy = useBusy(studio);
  const create = useCreateBooking(studio);
  const [now] = useState(() => new Date());

  const [contact, setContact] = useState<Contact>(loadContact);
  const [errors, setErrors] = useState<Partial<Record<keyof Contact, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const dates = useMemo(() => bookingDates(settings, now), [settings, now]);
  const days = useMemo(
    () => (service && busy.data ? dayAvailability({ settings, durationMinutes: service.durationMinutes, busy: busy.data, now }, dates) : []),
    [service, busy.data, settings, now, dates],
  );
  const firstFree = days.find((d) => d.free > 0)?.date;
  const date = params.get('date') && dates.includes(params.get('date')!) ? params.get('date')! : firstFree;
  const slots = useMemo(
    () => (service && busy.data && date ? slotsForDate({ settings, durationMinutes: service.durationMinutes, date, busy: busy.data, now }) : []),
    [service, busy.data, date, settings, now],
  );
  const time = params.get('time');
  const slot = slots.find((s) => s.time === time && s.status === 'free');

  useEffect(() => refreshGlass(600), [service?.id, date, slot?.time]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true, preventScrollReset: true });
    setServerError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!service || !slot) return;
    const parsed = customerSchema.safeParse(contact);
    if (!parsed.success) {
      const errs: typeof errors = {};
      for (const issue of parsed.error.issues) errs[issue.path[0] as keyof Contact] ??= issue.message;
      setErrors(errs);
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setErrors({});
    try {
      localStorage.setItem(CONTACT_KEY, JSON.stringify({ customerName: contact.customerName, customerPhone: contact.customerPhone, car: contact.car }));
    } catch {
      /* не страшно */
    }
    try {
      const { booking } = await create.mutateAsync({ slug, serviceId: service.id, startAt: slot.start.toISOString(), ...parsed.data });
      navigate(`/${slug}/my/${booking.id}?new=1`);
    } catch (err) {
      setServerError(err instanceof UserError ? err.message : 'Не удалось записаться. Попробуйте ещё раз.');
      if (err instanceof UserError && (err.code === 'busy' || err.code === 'too_soon')) {
        update({ time: null });
        busy.refetch();
      }
    }
  };

  const set = (k: keyof Contact) => (v: string) => {
    setContact((c) => ({ ...c, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const contactFilled = Boolean(contact.customerName.trim() && contact.customerPhone.trim() && contact.car.trim());
  const step = !service ? 1 : !date ? 2 : !slot ? 3 : !contactFilled ? 4 : 5;
  return (
    <main>
      <PageHeader title="Запись" back={`/${slug}`} />
      <form className="page page-narrow" onSubmit={submit} noValidate>
        <div
          className="steps-progress"
          role="progressbar"
          aria-label="Прогресс записи"
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={step}
          aria-valuetext={`Шаг ${step} из 5`}
        >
          <span className="label">
            Шаг {step} из 5 · {['Выберите услугу', 'Выберите дату', 'Выберите время', 'Ваши данные', 'Проверьте и подтвердите'][step - 1]}
          </span>
          <span className="track" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n <= step ? 'on' : ''} />
            ))}
          </span>
        </div>
        {/* 1. Услуга */}
        <h2 className="step-title">
          <span className={`step-num ${service ? 'done' : ''}`}>1</span>Услуга
        </h2>
        <div className="choice-list" role="radiogroup" aria-label="Услуга">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              className="choice"
              aria-checked={s.id === service?.id}
              onClick={() => update({ service: s.id, time: null })}
            >
              <span className="radio" aria-hidden />
              <span>
                <span className="choice-title">{s.name}</span>
                <span className="choice-sub" style={{ display: 'block' }}>
                  {durationText(s.durationMinutes)}
                </span>
              </span>
              <span className="price" style={{ fontSize: 17 }}>
                {formatServicePrice(s.price, s.priceFrom)}
              </span>
            </button>
          ))}
        </div>

        {service && (
          <>
            {/* 2. Дата */}
            <h2 className="step-title">
              <span className={`step-num ${date ? 'done' : ''}`}>2</span>Дата
            </h2>
            {busy.isPending ? (
              <div className="date-strip" aria-busy="true" aria-label="Загружаем расписание">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="skeleton" style={{ height: 88, borderRadius: 16 }} />
                ))}
              </div>
            ) : busy.isError && !busy.data ? (
              <Banner status="error" title="Не удалось загрузить расписание" description="Проверьте интернет и обновите страницу." />
            ) : (
              <div className="date-strip" role="group" aria-label="Дата">
                {days.map((d) => {
                  const closed = !d.open;
                  const full = d.open && d.free === 0;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      className={`day ${full ? 'full' : ''}`}
                      aria-pressed={d.date === date}
                      aria-label={`${formatDateLong(d.date)}: ${closed ? 'выходной' : full ? 'нет свободного времени' : `${d.free} свободно`}`}
                      disabled={closed}
                      onClick={() => update({ date: d.date, time: null })}
                    >
                      <span className="wd">{formatWeekdayShort(d.date)}</span>
                      <span className="dn">{formatDayNumber(d.date)}</span>
                      <span className="st">{closed ? 'выходной' : full ? 'нет мест' : `${d.free} ${plural(d.free, ['окно', 'окна', 'окон'])}`}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 3. Время */}
            {date && busy.data && (
              <>
                <h2 className="step-title">
                  <span className={`step-num ${slot ? 'done' : ''}`}>3</span>Время · {formatDateLong(date)}
                </h2>
                <div className="slot-legend" aria-hidden>
                  <span>
                    <i className="legend-swatch" /> свободно
                  </span>
                  <span>
                    <i className="legend-swatch busy" /> занято
                  </span>
                  <span>
                    <i className="legend-swatch selected" /> ваш выбор
                  </span>
                </div>
                {slots.length === 0 ? (
                  <p className="muted">В этот день записи нет.</p>
                ) : (
                  <div key={date} className="slots" role="group" aria-label="Время">
                    {slots.map((s) => (
                      <button
                        key={s.time}
                        type="button"
                        className={`slot ${s.status === 'busy' ? 'busy' : ''}`}
                        aria-pressed={s.time === slot?.time}
                        disabled={s.status === 'busy'}
                        aria-label={s.status === 'busy' ? `${s.time} — занято` : `${s.time} — свободно`}
                        onClick={() => update({ time: s.time })}
                      >
                        {s.time}
                        {s.status === 'busy' && <span className="slot-note">занято</span>}
                      </button>
                    ))}
                  </div>
                )}
                {slot?.multiDay && (
                  <div className="notice" style={{ marginTop: 12 }}>
                    <Info size={20} weight="fill" aria-hidden />
                    <span>
                      Работа займёт несколько дней — бокс закреплён за вашей машиной. Готово: <strong>{formatWhen(slot.workEnd, now, tz)}</strong>.
                    </span>
                  </div>
                )}
              </>
            )}

            {/* 4. Данные */}
            {slot && (
              <>
                <h2 className="step-title">
                  <span className="step-num">4</span>Ваши данные
                </h2>
                <div className="form-grid">
                  <TextInput
                    id="f-customerName"
                    label="Имя"
                    value={contact.customerName}
                    onChange={set('customerName')}
                    autoComplete="name"
                    isRequired
                    status={errors.customerName ? { type: 'error', message: errors.customerName } : undefined}
                  />
                  <div>
                    <label className="field-label" htmlFor="f-customerPhone">
                      Телефон
                    </label>
                    <input
                      id="f-customerPhone"
                      className="native-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+7 900 000-00-00"
                      value={contact.customerPhone}
                      onChange={(e) => set('customerPhone')(e.target.value)}
                      aria-invalid={Boolean(errors.customerPhone)}
                      aria-describedby={errors.customerPhone ? 'err-phone' : undefined}
                      style={errors.customerPhone ? { borderColor: 'var(--red-bright)' } : undefined}
                    />
                    {errors.customerPhone && (
                      <div id="err-phone" role="alert" style={{ color: '#f4a19a', fontSize: 14, marginTop: 6 }}>
                        {errors.customerPhone}
                      </div>
                    )}
                  </div>
                  <TextInput
                    id="f-car"
                    label="Автомобиль"
                    placeholder="Марка, модель, цвет"
                    value={contact.car}
                    onChange={set('car')}
                    isRequired
                    status={errors.car ? { type: 'error', message: errors.car } : undefined}
                  />
                  <TextArea label="Комментарий" isOptional value={contact.comment} onChange={set('comment')} rows={2} placeholder="Например: сколы на капоте" />
                </div>

                {/* 5. Подтверждение */}
                <h2 className="step-title">
                  <span className="step-num">5</span>Проверьте запись
                </h2>
                <div className="card summary">
                  <div className="summary-row">
                    <Wrench size={20} weight="fill" aria-hidden />
                    <div>
                      <strong>{service.name}</strong>
                      <small>{formatServicePrice(service.price, service.priceFrom)}</small>
                    </div>
                  </div>
                  <div className="summary-row">
                    <CalendarBlank size={20} weight="fill" aria-hidden />
                    <div>
                      <strong>{formatWhen(slot.start, now, tz)}</strong>
                      <small>{formatDateLong(localDateOf(slot.start, tz))}</small>
                    </div>
                  </div>
                  <div className="summary-row">
                    <Clock size={20} weight="fill" aria-hidden />
                    <div>
                      <strong>Готово {formatWhen(slot.workEnd, now, tz)}</strong>
                      <small>Ориентировочно, по графику сервиса</small>
                    </div>
                  </div>
                  {contact.car && (
                    <div className="summary-row">
                      <Car size={20} weight="fill" aria-hidden />
                      <div>{contact.car}</div>
                    </div>
                  )}
                  <div className="summary-row">
                    <MapPin size={20} weight="fill" aria-hidden />
                    <div>{settings.contacts.address}</div>
                  </div>
                </div>
                {serverError && (
                  <div style={{ marginTop: 12 }} role="alert">
                    <Banner status="error" title={serverError} />
                  </div>
                )}
                {!online && (
                  <div style={{ marginTop: 12 }}>
                    <Banner status="warning" title="Нет сети" description="Подключитесь к интернету, чтобы подтвердить запись." />
                  </div>
                )}
                <div style={{ marginTop: 16 }}>
                  <Button
                    label="Подтвердить запись"
                    variant="primary"
                    size="lg"
                    width="100%"
                    type="submit"
                    isLoading={create.isPending}
                    isDisabled={!online}
                  />
                </div>
                <p className="muted" style={{ fontSize: 14, textAlign: 'center' }}>
                  Нажимая кнопку, вы соглашаетесь, что сервис свяжется с вами по указанному телефону.
                </p>
              </>
            )}
          </>
        )}
      </form>
    </main>
  );
}
