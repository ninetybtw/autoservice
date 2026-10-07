import { describe, expect, it } from 'vitest';
import {
  addWorkingMinutes,
  checkSlot,
  dayAvailability,
  jobTiming,
  nearestFreeSlots,
  slotsForDate,
  zonedToInstant,
} from '../shared/slots.ts';
import { simpleStudio } from './fixtures.ts';
import type { BusyInterval } from '../shared/schema.ts';

const tz = 'Europe/Moscow';
// 2026-10-05 — понедельник
const MON = '2026-10-05';
const TUE = '2026-10-06';
const WED = '2026-10-07';
const FRI = '2026-10-09';
const now = zonedToInstant('2026-10-04', '12:00', tz); // воскресенье

function iso(date: string, time: string) {
  return zonedToInstant(date, time, tz).toISOString();
}

describe('график и рабочее время', () => {
  it('переводит местное время студии в UTC', () => {
    expect(zonedToInstant(MON, '10:00', tz).toISOString()).toBe('2026-10-05T07:00:00.000Z');
    expect(zonedToInstant(MON, '10:00', 'Asia/Yekaterinburg').toISOString()).toBe('2026-10-05T05:00:00.000Z');
  });

  it('переносит работу на следующий рабочий день и пропускает выходные', () => {
    const s = simpleStudio();
    // пятница 16:00 + 6 часов = 4 часа в пятницу + 2 часа в понедельник
    const end = addWorkingMinutes(s.schedule, tz, zonedToInstant(FRI, '16:00', tz), 360);
    expect(end?.toISOString()).toBe(iso('2026-10-12', '12:00'));
  });

  it('учитывает особые дни (праздник)', () => {
    const s = simpleStudio();
    s.schedule.exceptions = [{ date: TUE, hours: null }];
    expect(slotsForDate({ settings: s, durationMinutes: 60, date: TUE, busy: [], now })).toEqual([]);
    const end = addWorkingMinutes(s.schedule, tz, zonedToInstant(MON, '10:00', tz), 960);
    // 10 ч в понедельник, вторник — выходной, 6 ч в среду
    expect(end?.toISOString()).toBe(iso(WED, '16:00'));
  });
});

describe('слоты', () => {
  it('короткая услуга должна закончиться до закрытия', () => {
    const s = simpleStudio();
    const slots = slotsForDate({ settings: s, durationMinutes: 120, date: MON, busy: [], now });
    expect(slots.map((x) => x.time)).toEqual(['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']);
    expect(slots.every((x) => x.status === 'free')).toBe(true);
  });

  it('учитывает подготовку между машинами', () => {
    const s = simpleStudio();
    // мойка 12:00–13:00, бокс занят до 13:30
    const t = jobTiming(s, 60, zonedToInstant(MON, '12:00', tz))!;
    const busy: BusyInterval[] = [{ bay: 1, start: t.start.toISOString(), end: t.blockEnd.toISOString() }];
    const slots = slotsForDate({ settings: s, durationMinutes: 60, date: MON, busy, now });
    const status = Object.fromEntries(slots.map((x) => [x.time, x.status]));
    expect(status['11:00']).toBe('busy'); // 11:00–12:30 пересекается с 12:00
    expect(status['12:00']).toBe('busy');
    expect(status['13:00']).toBe('busy'); // бокс ещё готовят до 13:30
    expect(status['14:00']).toBe('free');
  });

  it('многодневная работа занимает бокс на все дни', () => {
    const s = simpleStudio();
    const t = jobTiming(s, 960, zonedToInstant(MON, '10:00', tz))!;
    expect(t.multiDay).toBe(true);
    expect(t.workEnd.toISOString()).toBe(iso(TUE, '16:00'));
    const busy: BusyInterval[] = [{ bay: 1, start: t.start.toISOString(), end: t.blockEnd.toISOString() }];
    const mon = slotsForDate({ settings: s, durationMinutes: 60, date: MON, busy, now });
    const tue = slotsForDate({ settings: s, durationMinutes: 60, date: TUE, busy, now });
    expect(mon.every((x) => x.status === 'busy')).toBe(true);
    expect(tue.filter((x) => x.status === 'free').map((x) => x.time)).toEqual(['17:00', '18:00', '19:00']);
    const days = dayAvailability({ settings: s, durationMinutes: 60, busy, now }, [MON, TUE, WED]);
    expect(days.map((d) => d.free)).toEqual([0, 3, 10]);
  });

  it('несколько боксов: слот занят, только когда заняты все', () => {
    const s = simpleStudio({ bays: 2 });
    const busy: BusyInterval[] = [{ bay: 1, start: iso(MON, '10:00'), end: iso(MON, '20:00') }];
    const slots = slotsForDate({ settings: s, durationMinutes: 60, date: MON, busy, now });
    expect(slots.every((x) => x.status === 'free' && x.freeBays.join() === '2')).toBe(true);
    busy.push({ bay: 2, start: iso(MON, '14:00'), end: iso(MON, '15:30') });
    const s2 = slotsForDate({ settings: s, durationMinutes: 60, date: MON, busy, now });
    expect(s2.filter((x) => x.status === 'busy').map((x) => x.time)).toEqual(['13:00', '14:00', '15:00']);
  });

  it('не предлагает время раньше минимального запаса', () => {
    const s = simpleStudio({ minLeadMinutes: 120 });
    const at = zonedToInstant(MON, '11:10', tz);
    const slots = slotsForDate({ settings: s, durationMinutes: 60, date: MON, busy: [], now: at });
    expect(slots[0].time).toBe('14:00');
    const owner = slotsForDate({ settings: s, durationMinutes: 60, date: MON, busy: [], now: at, ignoreLead: true });
    expect(owner[0].time).toBe('12:00');
  });

  it('ищет ближайшие свободные окна', () => {
    const s = simpleStudio();
    const busy: BusyInterval[] = [{ bay: 1, start: iso(MON, '10:00'), end: iso(MON, '18:30') }];
    const slots = nearestFreeSlots({ settings: s, durationMinutes: 60, busy, now, limit: 3 });
    expect(slots.map((x) => x.start.toISOString())).toEqual([iso(MON, '19:00'), iso(TUE, '10:00'), iso(TUE, '11:00')]);
  });
});

describe('серверная проверка', () => {
  it('выбирает свободный бокс и отклоняет занятое время', () => {
    const s = simpleStudio({ bays: 2 });
    const busy: BusyInterval[] = [{ bay: 1, start: iso(MON, '10:00'), end: iso(MON, '12:00') }];
    const ok = checkSlot(s, { durationMinutes: 60 }, zonedToInstant(MON, '10:00', tz), busy, now);
    expect(ok).toMatchObject({ ok: true, bay: 2 });
    busy.push({ bay: 2, start: iso(MON, '09:00'), end: iso(MON, '12:00') });
    expect(checkSlot(s, { durationMinutes: 60 }, zonedToInstant(MON, '10:00', tz), busy, now)).toEqual({ ok: false, reason: 'busy' });
  });

  it('отклоняет время вне сетки, вне графика и за горизонтом', () => {
    const s = simpleStudio({ horizonDays: 5 });
    expect(checkSlot(s, { durationMinutes: 60 }, zonedToInstant(MON, '10:15', tz), [], now)).toEqual({ ok: false, reason: 'off_grid' });
    expect(checkSlot(s, { durationMinutes: 60 }, zonedToInstant(MON, '08:00', tz), [], now)).toEqual({ ok: false, reason: 'closed' });
    expect(checkSlot(s, { durationMinutes: 60 }, zonedToInstant(MON, '19:30', tz), [], now)).toEqual({ ok: false, reason: 'closed' });
    expect(checkSlot(s, { durationMinutes: 60 }, zonedToInstant('2026-10-12', '10:00', tz), [], now)).toEqual({ ok: false, reason: 'too_far' });
  });

  it('при переносе не считает занятой саму переносимую запись', () => {
    const s = simpleStudio();
    const busy: BusyInterval[] = [{ bay: 1, start: iso(MON, '10:00'), end: iso(MON, '11:30'), bookingId: 'b1' }];
    expect(checkSlot(s, { durationMinutes: 60 }, zonedToInstant(MON, '10:00', tz), busy, now).ok).toBe(false);
    expect(checkSlot(s, { durationMinutes: 60 }, zonedToInstant(MON, '10:00', tz), busy, now, { excludeBookingId: 'b1' }).ok).toBe(true);
  });
});

describe('многодневные работы', () => {
  it('начинаются только в первой половине дня', () => {
    const s = simpleStudio();
    const times = slotsForDate({ settings: s, durationMinutes: 960, date: MON, busy: [], now }).map((x) => x.time);
    expect(times).toEqual(['10:00', '11:00', '12:00', '13:00', '14:00', '15:00']);
  });
});
