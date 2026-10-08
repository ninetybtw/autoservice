/**
 * Фирменный цвет автосервиса → палитра приложения.
 * Владелец указывает один цвет (как на вывеске или сайте), остальное считается здесь
 * так, чтобы текст оставался читаемым на чёрном фоне (WCAG AA, контраст ≥ 4,5:1).
 */

export const DEFAULT_ACCENT = '#c44a46';

type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;
}

/** Смешивает цвет с белым (t > 0) или чёрным (t < 0), пока не выполнится условие. */
function shiftUntil(base: Rgb, toward: Rgb, ok: (hex: string) => boolean): string {
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const hex = toHex(mix(base, toward, t));
    if (ok(hex)) return hex;
  }
  return toHex(toward);
}

export interface BrandPalette {
  /** Кнопки, активные элементы */
  accent: string;
  /** Текст на кнопках */
  onAccent: string;
  /** Акцентный текст и ссылки на чёрном фоне */
  accentText: string;
  /** Иконки на чёрном фоне */
  accentIcon: string;
  /** «r, g, b» для полупрозрачных подложек */
  accentRgb: string;
  /** «r, g, b» светлого оттенка — блик на стеклянной кнопке */
  accentLightRgb: string;
}

/**
 * Палитра из фирменного цвета.
 * Кнопка: белый текст, если контраст с цветом ≥ 4,5:1; иначе цвет кнопки затемняется,
 * но не больше чем наполовину — у очень светлых цветов (жёлтый, салатовый) остаётся цвет, а текст становится чёрным.
 */
export function brandPalette(accentHex: string | undefined, accentTextHex?: string): BrandPalette {
  const base = parseHex(accentHex ?? '') ?? parseHex(DEFAULT_ACCENT)!;
  const white: Rgb = [255, 255, 255];
  const black: Rgb = [0, 0, 0];

  let accent = toHex(base);
  let onAccent = '#ffffff';
  if (contrast(accent, '#ffffff') < 4.5) {
    const darker = shiftUntil(base, black, (hex) => contrast(hex, '#ffffff') >= 4.5);
    const shift = luminance(base) - luminance(parseHex(darker)!);
    if (shift <= luminance(base) * 0.5) accent = darker;
    else onAccent = '#000000';
  }

  const custom = accentTextHex && parseHex(accentTextHex) && contrast(accentTextHex, '#000000') >= 4.5 ? toHex(parseHex(accentTextHex)!) : null;
  // Акцентный текст чуть светлее кнопки: на чёрном берём контраст 7,5:1, чтобы мелкий текст читался уверенно.
  const accentText = custom ?? shiftUntil(base, white, (hex) => contrast(hex, '#000000') >= 7.5);
  const accentIcon = shiftUntil(base, white, (hex) => contrast(hex, '#000000') >= 6);
  const rgb = parseHex(accent)!;
  const light = mix(rgb, white, 0.3);
  return {
    accent,
    onAccent,
    accentText,
    accentIcon,
    accentRgb: rgb.map(Math.round).join(', '),
    accentLightRgb: light.map(Math.round).join(', '),
  };
}

/** CSS-переменные приложения и дизайн-системы для палитры. */
export function brandCssVariables(p: BrandPalette): Record<string, string> {
  return {
    '--red': p.accent,
    '--red-bright': p.accentText,
    '--red-soft': `rgba(${p.accentRgb}, 0.16)`,
    '--on-red': p.onAccent,
    '--accent-rgb': p.accentRgb,
    '--accent-light-rgb': p.accentLightRgb,
    '--color-accent': p.accent,
    '--color-on-accent': p.onAccent,
    '--color-text-accent': p.accentText,
    '--color-icon-accent': p.accentIcon,
    '--color-accent-muted': `rgba(${p.accentRgb}, 0.18)`,
    // Светлый цвет (жёлтый, салатовый) под белой надписью не читается: стекло плотнее, надпись чёрная
    ...(p.onAccent === '#000000'
      ? { '--cta-fill-top': '0.82', '--cta-fill-bottom': '0.94', '--cta-label': '#000000', '--cta-label-shadow': 'none' }
      : {}),
  };
}
