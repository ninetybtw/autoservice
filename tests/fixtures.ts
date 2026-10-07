import { readFileSync } from 'node:fs';
import { studioFileSchema, type StudioSettings } from '../shared/schema.ts';

export function loadStudio(slug: string): StudioSettings {
  const raw = JSON.parse(readFileSync(new URL(`../studios/${slug}/studio.json`, import.meta.url), 'utf8'));
  return studioFileSchema.parse(raw);
}

/** Минимальная студия: пн–пт 10–20, 1 бокс, шаг 60 мин, подготовка 30 мин. */
export function simpleStudio(overrides: Partial<StudioSettings['booking']> = {}): StudioSettings {
  const day = { open: '10:00', close: '20:00' };
  return {
    name: 'Тест',
    tagline: '',
    description: '',
    timezone: 'Europe/Moscow',
    contacts: { phone: '+7 900 000-00-00', address: 'Москва', howToFind: '' },
    branding: { logo: '', hero: '' },
    infoCards: [
      { icon: 'star', title: 'a', text: '' },
      { icon: 'star', title: 'b', text: '' },
      { icon: 'star', title: 'c', text: '' },
    ],
    services: [
      { id: 'wash', name: 'Мойка', description: '', price: 1000, priceFrom: false, durationMinutes: 60, keywords: [], active: true },
      { id: 'ceramic', name: 'Керамика', description: '', price: 30000, priceFrom: true, durationMinutes: 960, keywords: [], active: true },
    ],
    works: [],
    schedule: {
      weekly: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: null, sun: null },
      exceptions: [],
    },
    booking: {
      bays: 1,
      slotStepMinutes: 60,
      bufferMinutes: 30,
      minLeadMinutes: 0,
      horizonDays: 30,
      cancelMinHoursBefore: 24,
      cancellationPolicy: '',
      ...overrides,
    },
  };
}
