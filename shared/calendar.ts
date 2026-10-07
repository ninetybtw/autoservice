import type { PublicBooking, StudioSettings } from './schema.ts';

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

/** Конец события в календаре: для многодневных работ — только первый день, чтобы не загромождать календарь. */
function eventEnd(booking: PublicBooking): Date {
  const start = new Date(booking.startAt);
  const end = new Date(booking.endAt);
  return end.getTime() - start.getTime() > 12 * 3_600_000 ? new Date(start.getTime() + 60 * 60_000) : end;
}

export function bookingTitle(booking: PublicBooking, settings: StudioSettings): string {
  return `${booking.serviceName} — ${settings.name}`;
}

export function bookingDescription(booking: PublicBooking, settings: StudioSettings, link?: string): string {
  return [
    `Автомобиль: ${booking.car}`,
    `Телефон студии: ${settings.contacts.phone}`,
    settings.contacts.howToFind ? `Как найти: ${settings.contacts.howToFind}` : '',
    link ? `Ваша запись: ${link}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Файл .ics с напоминанием за сутки (VALARM -P1D). */
export function buildIcs(booking: PublicBooking, settings: StudioSettings, link?: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//autoservice//booking//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${booking.id}@autoservice`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(new Date(booking.startAt))}`,
    `DTEND:${icsDate(eventEnd(booking))}`,
    `SUMMARY:${icsEscape(bookingTitle(booking, settings))}`,
    `DESCRIPTION:${icsEscape(bookingDescription(booking, settings, link))}`,
    `LOCATION:${icsEscape(settings.contacts.address)}`,
    link ? `URL:${link}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(`Завтра: ${bookingTitle(booking, settings)}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}

export function googleCalendarUrl(booking: PublicBooking, settings: StudioSettings, link?: string): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: bookingTitle(booking, settings),
    dates: `${icsDate(new Date(booking.startAt))}/${icsDate(eventEnd(booking))}`,
    details: bookingDescription(booking, settings, link),
    location: settings.contacts.address,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
