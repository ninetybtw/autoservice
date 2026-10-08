import { useEffect, useState } from 'react';
import { Plus, Trash } from '@phosphor-icons/react';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { useToast } from '@astryxdesign/core/Toast';
import { INFO_ICONS, WEEKDAYS, WEEKDAY_LABELS, studioSettingsSchema, type InfoCard, type StudioSettings } from '@shared/schema.ts';
import { localDateOf } from '@shared/slots.ts';
import { formatDateLong } from '@shared/format.ts';
import { backend, UserError } from '../../data/index.ts';
import { useUpdateSettings } from '../../data/hooks.ts';
import { useMedia, useStudio } from '../../studio.tsx';
import { makeIcon, prepareImage, uniqueName } from '../../lib/images.ts';
import { INFO_ICON_LABELS } from '../../components/icons.tsx';
import { FileButton, SaveBar, SettingsSection, zodMessage } from './AdminCommon.tsx';
import { Photo } from '../../components/Photo.tsx';
import { BrandColorPicker } from './BrandColorPicker.tsx';

/** Поля, которые редактируются на этой странице (услуги и фото работ — на своих страницах). */
type Editable = Pick<StudioSettings, 'name' | 'tagline' | 'description' | 'contacts' | 'infoCards' | 'schedule' | 'booking'>;

function pick(s: StudioSettings): Editable {
  return {
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    contacts: { ...s.contacts },
    infoCards: s.infoCards.map((c) => ({ ...c })),
    schedule: { weekly: { ...s.schedule.weekly }, exceptions: [...s.schedule.exceptions] },
    booking: { ...s.booking },
  };
}

const LABELS: Record<string, string> = {
  name: 'Название',
  phone: 'Телефон',
  address: 'Адрес',
  mapUrl: 'Ссылка на карту',
  infoCards: 'Карточки',
  weekly: 'Часы работы',
  exceptions: 'Особые дни',
  bays: 'Боксы',
};

export default function StudioSettingsPage() {
  const studio = useStudio();
  const media = useMedia();
  const update = useUpdateSettings(studio);
  const toast = useToast();
  const [draft, setDraft] = useState<Editable>(() => pick(studio.settings));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [newDay, setNewDay] = useState({ date: '', closed: true, open: '10:00', close: '16:00', note: '' });
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(studio.settings));

  useEffect(() => {
    if (!dirty) setDraft(pick(studio.settings));
  }, [studio.settings]);

  const patch = <K extends keyof Editable>(k: K, v: Editable[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setSaved(false);
  };
  const contact = (k: keyof Editable['contacts']) => (v: string) => patch('contacts', { ...draft.contacts, [k]: v });
  const rule = (k: keyof Editable['booking']) => (v: number) => patch('booking', { ...draft.booking, [k]: v });
  const card = (i: number, p: Partial<InfoCard>) => patch('infoCards', draft.infoCards.map((c, j) => (j === i ? { ...c, ...p } : c)));

  const save = async () => {
    setError(null);
    const merged = { ...studio.settings, ...draft };
    const check = studioSettingsSchema.safeParse(merged);
    if (!check.success) return setError(zodMessage(check.error.issues, LABELS));
    try {
      await update.mutateAsync((current) => ({ ...current, ...draft }));
      setSaved(true);
      toast({ body: 'Изменения сохранены — клиенты уже видят их' });
    } catch (e) {
      setError(e instanceof UserError ? e.message : 'Не удалось сохранить');
    }
  };

  const uploadBranding = async (kind: 'logo' | 'hero' | 'heroMobile', file: File) => {
    if (kind === 'hero') {
      const url = await backend.uploadMedia(studio, await prepareImage(file, 2000), uniqueName('hero'));
      await update.mutateAsync((c) => ({ ...c, branding: { ...c.branding, hero: url, heroFallback: undefined } }));
    } else if (kind === 'heroMobile') {
      const url = await backend.uploadMedia(studio, await prepareImage(file, 1600), uniqueName('hero-mobile'));
      await update.mutateAsync((c) => ({ ...c, branding: { ...c.branding, heroMobile: url } }));
    } else {
      const logo = await backend.uploadMedia(studio, await prepareImage(file, 600, 0.9), uniqueName('logo'));
      const icon192 = await backend.uploadMedia(studio, await makeIcon(file, 192), uniqueName('icon-192', 'png'));
      const icon512 = await backend.uploadMedia(studio, await makeIcon(file, 512), uniqueName('icon-512', 'png'));
      await update.mutateAsync((c) => ({ ...c, branding: { ...c.branding, logo, icon192, icon512 } }));
    }
    toast({ body: kind === 'logo' ? 'Логотип и иконка приложения обновлены' : 'Главное фото обновлено' });
  };

  const today = localDateOf(new Date(), studio.settings.timezone);
  const b = draft.booking;

  return (
    <main className="page page-narrow stack">
      <SettingsSection title="Основное" description="Название и описание на главной странице.">
        <TextInput label="Название автосервиса" value={draft.name} onChange={(v) => patch('name', v)} />
        <TextInput label="Короткая строка над названием" value={draft.tagline} onChange={(v) => patch('tagline', v)} placeholder="Автосервис полного цикла" />
        <TextArea label="Описание" value={draft.description} onChange={(v) => patch('description', v)} rows={4} description="Первое предложение показывается на главном фото." />
      </SettingsSection>

      <SettingsSection title="Логотип и главное фото" description="Фото загружается сразу. Из логотипа автоматически делается иконка приложения.">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {studio.settings.branding.logo && <img className="logo-preview" src={media(studio.settings.branding.logo)} alt="Логотип" />}
          <FileButton label="Загрузить логотип" onFile={(f) => uploadBranding('logo', f)} testId="logo-file" />
        </div>
        {studio.settings.branding.hero && (
          <Photo
            className="media-preview"
            src={media(studio.settings.branding.hero)}
            fallback={media(studio.settings.branding.heroFallback) || undefined}
            alt="Главное фото"
          />
        )}
        <FileButton label="Заменить главное фото (горизонтальное)" onFile={(f) => uploadBranding('hero', f)} testId="hero-file" />
        {studio.settings.branding.heroMobile && (
          <img className="media-preview" style={{ maxWidth: 220, maxHeight: 380 }} src={media(studio.settings.branding.heroMobile)} alt="Главное фото для телефона" />
        )}
        <FileButton label="Фото для телефона (вертикальное)" onFile={(f) => uploadBranding('heroMobile', f)} testId="hero-mobile-file" />
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Вертикальное фото показывается на телефонах. Если его нет — используется горизонтальное.
        </p>
      </SettingsSection>

      <SettingsSection title="Фирменный цвет" description="Цвет кнопок и выделений — как на вывеске или сайте. Применяется сразу после сохранения.">
        <BrandColorPicker />
      </SettingsSection>

      <SettingsSection title="Контакты" description="Адрес, телефон и подсказка, как найти сервис.">
        <TextInput label="Телефон" value={draft.contacts.phone} onChange={contact('phone')} />
        <TextInput label="Адрес" value={draft.contacts.address} onChange={contact('address')} />
        <TextArea label="Как найти" value={draft.contacts.howToFind} onChange={contact('howToFind')} rows={3} placeholder="Въезд со двора, ворота с красной подсветкой" />
        <TextInput label="Ссылка на карту" isOptional value={draft.contacts.mapUrl ?? ''} onChange={contact('mapUrl')} placeholder="https://yandex.ru/maps/..." />
      </SettingsSection>

      <SettingsSection title="Часы работы" description="Свободное время для записи считается по этим часам.">
        <div className="hours-editor">
          {WEEKDAYS.map((d) => {
            const h = draft.schedule.weekly[d];
            const setDay = (v: typeof h) => patch('schedule', { ...draft.schedule, weekly: { ...draft.schedule.weekly, [d]: v } });
            return (
              <div key={d} className="hours-row">
                <Switch label={WEEKDAY_LABELS[d]} value={h !== null} onChange={(on) => setDay(on ? { open: '10:00', close: '20:00' } : null)} />
                {h ? (
                  <div className="time-pair">
                    <input className="time-input" type="time" aria-label={`${WEEKDAY_LABELS[d]}: открытие`} value={h.open} onChange={(e) => setDay({ ...h, open: e.target.value })} />
                    –
                    <input className="time-input" type="time" aria-label={`${WEEKDAY_LABELS[d]}: закрытие`} value={h.close} onChange={(e) => setDay({ ...h, close: e.target.value })} />
                  </div>
                ) : (
                  <span className="muted">выходной</span>
                )}
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Выходные и особые дни" description="Праздники, отпуск или короткий день.">
        {draft.schedule.exceptions.length === 0 && <p className="muted" style={{ margin: 0 }}>Пока нет.</p>}
        {draft.schedule.exceptions
          .slice()
          .sort((a, c) => a.date.localeCompare(c.date))
          .map((e) => (
            <div key={e.date} className="hours-row" style={{ opacity: e.date < today ? 0.5 : 1 }}>
              <div>
                <strong>{formatDateLong(e.date)}</strong>
                <div className="muted" style={{ fontSize: 14 }}>
                  {e.hours ? `${e.hours.open}–${e.hours.close}` : 'выходной'}
                  {e.note ? ` · ${e.note}` : ''}
                </div>
              </div>
              <IconButton
                label="Удалить"
                variant="ghost"
                icon={<Trash size={18} />}
                onClick={() => patch('schedule', { ...draft.schedule, exceptions: draft.schedule.exceptions.filter((x) => x.date !== e.date) })}
              />
            </div>
          ))}
        <div className="card stack" style={{ background: 'var(--surface)' }}>
          <div>
            <label className="field-label" htmlFor="ex-date">
              Дата
            </label>
            <input id="ex-date" className="native-input" type="date" min={today} value={newDay.date} onChange={(e) => setNewDay({ ...newDay, date: e.target.value })} />
          </div>
          <Switch label="Выходной весь день" value={newDay.closed} onChange={(v) => setNewDay({ ...newDay, closed: v })} />
          {!newDay.closed && (
            <div className="time-pair">
              <input className="time-input" type="time" aria-label="Открытие" value={newDay.open} onChange={(e) => setNewDay({ ...newDay, open: e.target.value })} />
              –
              <input className="time-input" type="time" aria-label="Закрытие" value={newDay.close} onChange={(e) => setNewDay({ ...newDay, close: e.target.value })} />
            </div>
          )}
          <TextInput label="Пометка" isOptional value={newDay.note} onChange={(v) => setNewDay({ ...newDay, note: v })} placeholder="Например: санитарный день" />
          <Button
            label="Добавить день"
            icon={<Plus size={18} weight="bold" />}
            isDisabled={!newDay.date}
            onClick={() => {
              const entry = { date: newDay.date, hours: newDay.closed ? null : { open: newDay.open, close: newDay.close }, note: newDay.note || undefined };
              patch('schedule', { ...draft.schedule, exceptions: [...draft.schedule.exceptions.filter((x) => x.date !== entry.date), entry] });
              setNewDay({ ...newDay, date: '', note: '' });
            }}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Правила записи" description="Влияют на расчёт свободного времени.">
        <NumberInput label="Боксов (машин одновременно)" value={b.bays} onChange={rule('bays')} min={1} max={20} isIntegerOnly hasNumberSteppers />
        <NumberInput label="Подготовка бокса между машинами, мин" value={b.bufferMinutes} onChange={rule('bufferMinutes')} min={0} max={240} step={5} isIntegerOnly />
        <NumberInput label="Шаг времени записи, мин" value={b.slotStepMinutes} onChange={rule('slotStepMinutes')} min={10} max={240} step={5} isIntegerOnly />
        <NumberInput label="Записывать не раньше чем через, мин" value={b.minLeadMinutes} onChange={rule('minLeadMinutes')} min={0} step={30} isIntegerOnly />
        <NumberInput label="Запись открыта на, дней вперёд" value={b.horizonDays} onChange={rule('horizonDays')} min={1} max={120} isIntegerOnly />
        <NumberInput label="Клиент может отменить не позднее чем за, часов" value={b.cancelMinHoursBefore} onChange={rule('cancelMinHoursBefore')} min={0} max={336} isIntegerOnly />
        <TextArea label="Правила отмены для клиента" isOptional value={b.cancellationPolicy} onChange={(v) => patch('booking', { ...b, cancellationPolicy: v })} rows={2} />
      </SettingsSection>

      <SettingsSection title="Карточки на главной" description="Три коротких преимущества сервиса.">
        {draft.infoCards.map((c, i) => (
          <div key={i} className="card form-grid" style={{ background: 'var(--surface)' }}>
            <strong>Карточка {i + 1}</strong>
            <Selector label="Значок" value={c.icon} onChange={(v) => card(i, { icon: v as InfoCard['icon'] })} options={INFO_ICONS.map((k) => ({ value: k, label: INFO_ICON_LABELS[k] }))} />
            <TextInput label="Заголовок" value={c.title} onChange={(v) => card(i, { title: v })} />
            <TextArea label="Текст" value={c.text} onChange={(v) => card(i, { text: v })} rows={2} />
          </div>
        ))}
      </SettingsSection>

      <SaveBar dirty={dirty} saving={update.isPending} onSave={save} error={error} saved={saved} />
    </main>
  );
}
