import { describe, expect, it } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { customerSchema, normalizePhone, studioFileSchema } from '../shared/schema.ts';
import { canClientCancel } from '../shared/policy.ts';
import { buildIcs } from '../shared/calendar.ts';
import { zonedToInstant } from '../shared/slots.ts';
import { loadStudio } from './fixtures.ts';

describe('файлы студий', () => {
  const slugs = readdirSync(new URL('../studios', import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name);

  it.each(slugs)('%s/studio.json проходит проверку и все фото на месте', (slug) => {
    const s = studioFileSchema.parse(JSON.parse(readFileSync(`studios/${slug}/studio.json`, 'utf8')));
    expect(s.slug).toBe(slug);
    const files = [s.branding.logo, s.branding.hero, s.branding.icon192, s.branding.icon512, ...s.works.map((w) => w.image)];
    for (const f of files) {
      if (f && !/^(https?:|\/|data:)/.test(f)) expect(existsSync(`studios/${slug}/${f}`), f).toBe(true);
    }
    expect(new Set(s.services.map((x) => x.id)).size).toBe(s.services.length);
  });
});

describe('данные клиента', () => {
  it('нормализует телефон', () => {
    expect(normalizePhone('8 (999) 123-45-67')).toBe('+79991234567');
    expect(normalizePhone('9991234567')).toBe('+79991234567');
    expect(normalizePhone('12345')).toBeNull();
  });

  it('проверяет форму записи', () => {
    const ok = customerSchema.safeParse({ customerName: ' Иван ', customerPhone: '+7 999 123 45 67', car: 'BMW X5' });
    expect(ok.success && ok.data).toMatchObject({ customerName: 'Иван', customerPhone: '+79991234567', comment: '' });
    const bad = customerSchema.safeParse({ customerName: 'И', customerPhone: '123', car: '' });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message)).toEqual(['Укажите имя', 'Проверьте номер телефона', 'Укажите марку и модель']);
  });
});

describe('правила отмены', () => {
  const settings = loadStudio('motor-service');
  const start = zonedToInstant('2026-10-10', '12:00', settings.timezone).toISOString();
  it('разрешает отмену заранее и запрещает позже срока', () => {
    expect(canClientCancel(settings, { status: 'booked', startAt: start }, new Date('2026-10-08T12:00:00Z')).ok).toBe(true);
    const late = canClientCancel(settings, { status: 'booked', startAt: start }, new Date('2026-10-10T00:00:00Z'));
    expect(late).toMatchObject({ ok: false });
    expect(canClientCancel(settings, { status: 'arrived', startAt: start }, new Date('2026-10-01T00:00:00Z')).ok).toBe(false);
  });
});

describe('календарь', () => {
  it('создаёт .ics с напоминанием за сутки', () => {
    const settings = loadStudio('motor-service');
    const ics = buildIcs(
      {
        id: 'abc',
        studioId: 's',
        serviceId: 'complex-wash',
        serviceName: 'Комплексная мойка',
        price: 2500,
        startAt: '2026-10-10T09:00:00.000Z',
        endAt: '2026-10-10T10:30:00.000Z',
        status: 'booked',
        customerName: 'Иван',
        customerPhone: '+79991234567',
        car: 'BMW',
        comment: '',
        createdAt: '2026-10-07T00:00:00.000Z',
      },
      settings,
    );
    expect(ics).toContain('DTSTART:20261010T090000Z');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('LOCATION:Москва\\, Варшавское шоссе\\, 125\\, стр. 3');
  });
});
