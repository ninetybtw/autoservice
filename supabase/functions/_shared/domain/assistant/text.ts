// СГЕНЕРИРОВАНО из shared/ командой pnpm functions:sync — не редактируйте.
/** Простая обработка русского текста для помощника: нормализация, «стемминг» по префиксу, распознавание периодов. */
import { addDaysToDate, weekdayOf } from '../slots.ts';
import { WEEKDAYS, type Service } from '../schema.ts';

export function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s.-]/g, ' ');
}

export function words(text: string): string[] {
  return normalize(text)
    .split(/[\s.-]+/)
    .filter(Boolean);
}

export function stem(word: string): string {
  return word.length <= 4 ? word : word.slice(0, Math.max(4, word.length - 2));
}

function stemsMatch(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return a === b;
  return a.startsWith(b) || b.startsWith(a);
}

const STOP = new Set(['для', 'и', 'с', 'на', 'в', 'по', 'от', 'до', 'или', 'услуга', 'авто', 'автомобиля', 'машины']);

function serviceStems(s: Pick<Service, 'name' | 'keywords'>): string[] {
  return [...words(s.name), ...s.keywords.flatMap(words)].filter((w) => !STOP.has(w) && w.length >= 3).map(stem);
}

export function hasStem(text: string, needles: string[]): boolean {
  const ws = words(text).map(stem);
  return needles.some((n) => ws.some((w) => stemsMatch(w, stem(normalize(n).trim()))));
}

/**
 * Находит услуги, упомянутые в тексте. Возвращает лучшие совпадения:
 * пустой массив — ничего не найдено, несколько — нужно уточнить.
 */
export function matchServices<T extends Pick<Service, 'name' | 'keywords' | 'id'>>(text: string, services: T[]): T[] {
  const msg = words(text).filter((w) => !STOP.has(w)).map(stem);
  const norm = normalize(text);
  const exact = services.filter((s) => norm.includes(normalize(s.name).trim()));
  if (exact.length > 0) {
    // самое длинное точное название побеждает («Восстановительная полировка» > «полировка»)
    const longest = Math.max(...exact.map((s) => s.name.length));
    return exact.filter((s) => s.name.length === longest);
  }
  let best = 0;
  let result: T[] = [];
  for (const s of services) {
    const st = serviceStems(s);
    const score = st.filter((x) => msg.some((w) => stemsMatch(w, x))).length;
    if (score > best) {
      best = score;
      result = [s];
    } else if (score === best && score > 0) {
      result.push(s);
    }
  }
  return result;
}

export interface Period {
  /** Локальная дата начала (включительно) */
  from: string;
  /** Локальная дата конца (не включительно) */
  to: string;
  label: string;
}

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const WEEKDAY_STEMS: Record<string, (typeof WEEKDAYS)[number]> = {
  понедельник: 'mon',
  вторник: 'tue',
  сред: 'wed',
  четверг: 'thu',
  пятниц: 'fri',
  суббот: 'sat',
  воскресень: 'sun',
};

function mondayOf(date: string): string {
  const idx = WEEKDAYS.indexOf(weekdayOf(date));
  return addDaysToDate(date, -idx);
}

function monthStart(date: string): string {
  return `${date.slice(0, 8)}01`;
}

function nextMonthStart(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

function prevMonthStart(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
}

/** Распознаёт период в вопросе: «завтра», «на неделе», «в прошлом месяце», «в пятницу», «12.10», «12 октября». */
export function resolvePeriod(text: string, today: string): Period | null {
  const t = normalize(text);
  const day = (d: string, label: string): Period => ({ from: d, to: addDaysToDate(d, 1), label });
  if (/послезавтра/.test(t)) return day(addDaysToDate(today, 2), 'послезавтра');
  if (/завтра/.test(t)) return day(addDaysToDate(today, 1), 'завтра');
  if (/вчера/.test(t)) return day(addDaysToDate(today, -1), 'вчера');
  if (/сегодня|сейчас/.test(t)) return day(today, 'сегодня');

  const mon = mondayOf(today);
  if (/прошл\S* недел/.test(t)) return { from: addDaysToDate(mon, -7), to: mon, label: 'на прошлой неделе' };
  if (/следующ\S* недел/.test(t)) return { from: addDaysToDate(mon, 7), to: addDaysToDate(mon, 14), label: 'на следующей неделе' };
  if (/недел/.test(t)) return { from: mon, to: addDaysToDate(mon, 7), label: 'на этой неделе' };
  if (/прошл\S* месяц/.test(t)) return { from: prevMonthStart(today), to: monthStart(today), label: 'в прошлом месяце' };
  if (/месяц/.test(t)) return { from: monthStart(today), to: nextMonthStart(today), label: 'в этом месяце' };

  const numeric = t.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/);
  const named = t.match(/\b(\d{1,2})\s+([а-я]+)/);
  let dm: [number, number] | null = null;
  if (numeric) dm = [Number(numeric[1]), Number(numeric[2])];
  else if (named) {
    const mi = MONTHS.findIndex((m) => named[2].startsWith(m) && (m !== 'ма' || /^ма[яй]/.test(named[2])));
    if (mi >= 0) dm = [Number(named[1]), mi + 1];
  }
  if (dm && dm[0] >= 1 && dm[0] <= 31 && dm[1] >= 1 && dm[1] <= 12) {
    const year = Number(today.slice(0, 4));
    let date = `${year}-${String(dm[1]).padStart(2, '0')}-${String(dm[0]).padStart(2, '0')}`;
    // «12.01», сказанное в декабре, — это следующий год
    if (date < addDaysToDate(today, -180)) date = `${year + 1}${date.slice(4)}`;
    return day(date, `${dm[0]} ${['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'][dm[1] - 1]}`);
  }

  for (const [st, wd] of Object.entries(WEEKDAY_STEMS)) {
    if (t.includes(st)) {
      const todayIdx = WEEKDAYS.indexOf(weekdayOf(today));
      const target = WEEKDAYS.indexOf(wd);
      const past = /был|прошл/.test(t);
      let diff = target - todayIdx;
      if (past) diff = diff > 0 ? diff - 7 : diff;
      else diff = diff < 0 ? diff + 7 : diff;
      const date = addDaysToDate(today, diff);
      return day(date, `в ${st === 'сред' ? 'среду' : st === 'пятниц' ? 'пятницу' : st === 'суббот' ? 'субботу' : st === 'воскресень' ? 'воскресенье' : st}`);
    }
  }
  return null;
}
