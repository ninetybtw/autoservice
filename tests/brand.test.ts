import { describe, expect, it } from 'vitest';
import { brandPalette, contrast, DEFAULT_ACCENT } from '../shared/brand.ts';
import { formatServicePrice } from '../shared/schema.ts';

describe('фирменный цвет', () => {
  it.each(['#1f6fd1', '#c44a46', '#f2b705', '#2e9d57', '#7a4fd6', '#e2711d', '#ffffff', '#000000', '#0a1a3a'])(
    'текст читается при цвете %s',
    (hex) => {
      const p = brandPalette(hex);
      expect(contrast(p.accent, p.onAccent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.accentText, '#000000')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.accentIcon, '#000000')).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('насыщенный цвет остаётся как есть, белый текст', () => {
    const p = brandPalette(DEFAULT_ACCENT);
    expect(p.accent).toBe(DEFAULT_ACCENT);
    expect(p.onAccent).toBe('#ffffff');
    expect(p.accentRgb).toBe('196, 74, 70');
  });

  it('жёлтый не превращается в коричневый: остаётся жёлтым, текст чёрный', () => {
    const p = brandPalette('#f2b705');
    expect(p.accent).toBe('#f2b705');
    expect(p.onAccent).toBe('#000000');
  });

  it('неверный цвет — стандартная палитра', () => {
    expect(brandPalette('синий').accent).toBe(DEFAULT_ACCENT);
  });

  it('свой цвет акцентного текста принимается, только если читается', () => {
    expect(brandPalette('#1f6fd1', '#8fc1ff').accentText).toBe('#8fc1ff');
    expect(brandPalette('#1f6fd1', '#101010').accentText).not.toBe('#101010');
  });
});

describe('цена услуги', () => {
  it('ноль без «от» — бесплатно', () => {
    expect(formatServicePrice(0)).toBe('Бесплатно');
    expect(formatServicePrice(0, true)).toBe('от 0 ₽');
    expect(formatServicePrice(10000, true)).toBe('от 10 000 ₽');
  });
});

describe('примеры вопросов помощнику', () => {
  it('берутся из услуг сервиса, бесплатная услуга пропускается', async () => {
    const { clientExamples } = await import('../shared/assistant/fallback.ts');
    const services = [
      { name: 'Осмотр и оценка', price: 0, active: true },
      { name: 'Окраска бампера', price: 10000, active: true },
    ] as Parameters<typeof clientExamples>[0]['services'];
    expect(clientExamples({ services })).toEqual(['Когда ближайшее окно?', 'Сколько стоит окраска бампера?', 'Как вас найти?']);
  });
});
