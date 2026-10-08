import { useState } from 'react';
import { Bell, BellRinging, CalendarPlus, GoogleLogo } from '@phosphor-icons/react';
import { Button } from '@astryxdesign/core/Button';
import type { PublicBooking } from '@shared/schema.ts';
import { buildIcs, googleCalendarUrl } from '@shared/calendar.ts';
import { backend } from '../data/index.ts';
import { pushSupport, subscribePush } from '../lib/pwa.ts';
import { useStudio } from '../studio.tsx';

const key = (id: string) => `autoservice-reminder:${id}`;

function downloadIcs(booking: PublicBooking, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `zapis-${booking.startAt.slice(0, 10)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Предложение напомнить за сутки: push там, где можно, иначе — календарь. */
export function ReminderOffer({ booking, token, link }: { booking: PublicBooking; token: string | null; link: string }) {
  const { settings } = useStudio();
  const support = pushSupport(backend.supportsPush);
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(key(booking.id)) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const soon = new Date(booking.startAt).getTime() - Date.now() < 24 * 3600_000;

  const enablePush = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const sub = await subscribePush();
      await backend.savePushSubscription(booking.id, token, sub);
      localStorage.setItem(key(booking.id), '1');
      setEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось включить напоминание');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" aria-labelledby="reminder-title">
      <div className="card-head">
        <span className="icon-tile">{enabled ? <BellRinging size={26} weight="duotone" /> : <Bell size={26} weight="duotone" />}</span>
        <div>
          <h2 id="reminder-title">
            {enabled ? 'Напоминание включено' : 'Напомнить за сутки?'}
          </h2>
          <p>
            {enabled
              ? 'Пришлём уведомление за день до записи.'
              : support === 'ok'
                ? soon
                  ? 'До записи меньше суток — уведомление придёт в ближайшее время.'
                  : 'Пришлём уведомление на это устройство за день до записи.'
                : 'Добавьте запись в календарь — он напомнит за сутки.'}
          </p>
        </div>
      </div>
      {support === 'ok' && !enabled && token && (
        <Button label="Включить напоминание" variant="primary" width="100%" icon={<Bell size={18} weight="fill" />} isLoading={busy} onClick={enablePush} />
      )}
      {support === 'needs-install' && !enabled && (
        <p className="muted" style={{ margin: 0, fontSize: 14.5 }}>
          На iPhone уведомления работают, если добавить приложение на экран «Домой»: «Поделиться» → «На экран „Домой“». А пока — календарь:
        </p>
      )}
      {support === 'denied' && (
        <p className="muted" style={{ margin: 0, fontSize: 14.5 }}>
          Уведомления запрещены в настройках браузера. Добавьте запись в календарь:
        </p>
      )}
      {error && <p style={{ color: '#f4a19a', margin: 0 }}>{error}</p>}
      <div className="row">
        <Button
          label="В календарь (.ics)"
          variant={support === 'ok' && !enabled ? 'secondary' : 'primary'}
          icon={<CalendarPlus size={18} weight="bold" />}
          onClick={() => downloadIcs(booking, buildIcs(booking, settings, link))}
        />
        <Button label="Google Календарь" variant="secondary" icon={<GoogleLogo size={18} weight="bold" />} href={googleCalendarUrl(booking, settings, link)} target="_blank" rel="noopener" />
      </div>
    </section>
  );
}
