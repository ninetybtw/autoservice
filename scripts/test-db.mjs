#!/usr/bin/env node
/**
 * Проверка SQL-миграций на локальном PostgreSQL (без Docker).
 * Поднимает временный кластер, создаёт заглушки схем auth/storage Supabase,
 * применяет миграции и проверяет ключевые гарантии: запрет пересечений,
 * доступ владельца только к своей студии, скрытие данных клиентов от анонимов.
 *
 *   pnpm test:db            (нужны initdb/pg_ctl/psql, например postgresql-16)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function findBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const base = '/usr/lib/postgresql';
  if (existsSync(base)) {
    const v = readdirSync(base).sort().pop();
    if (v) return join(base, v, 'bin');
  }
  return '';
}

const bin = findBin();
if (!bin || !existsSync(join(bin, 'initdb'))) {
  console.log('PostgreSQL не найден — пропускаю проверку БД. Укажите PG_BIN=/path/to/bin.');
  process.exit(0);
}

const isRoot = process.getuid?.() === 0;
const dir = mkdtempSync(join(tmpdir(), 'autoservice-pg-'));
chmodSync(dir, 0o777);
const data = join(dir, 'data');
const port = String(54000 + Math.floor(Math.random() * 900));

function run(cmd, args, opts = {}) {
  const full = isRoot ? ['-u', 'postgres', '--', join(bin, cmd), ...args] : args;
  const res = spawnSync(isRoot ? 'runuser' : join(bin, cmd), full, { encoding: 'utf8', ...opts });
  if (res.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${args.join(' ')}\n${res.stdout}\n${res.stderr}`);
  }
  return res;
}

function psql(sql, { role, sub, allowFail = false } = {}) {
  const file = join(dir, `q${Math.random().toString(36).slice(2)}.sql`);
  const prefix = [
    role ? `set role ${role};` : '',
    sub ? `select set_config('request.jwt.claim.sub', '${sub}', false);` : '',
  ].join('\n');
  writeFileSync(file, `${prefix}\n${sql}`);
  chmodSync(file, 0o644);
  const res = run('psql', ['-h', dir, '-p', port, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qtA', '-f', file], { allowFail });
  return { ok: res.status === 0, out: res.stdout.trim().split('\n').filter((l) => l !== '' && l !== 'set_config' && !/^[0-9a-f-]{36}$/.test(l) || false).join('\n'), err: res.stderr };
}

let failed = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : `\n   ${extra}`}`);
  if (!cond) failed++;
}

try {
  run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-instructions'], { stdio: 'pipe' });
  run('pg_ctl', ['-D', data, '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, '-w', 'start', '-l', join(dir, 'log')]);

  psql(readFileSync(new URL('./supabase-stubs.sql', import.meta.url), 'utf8'));
  const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
  for (const m of migrations) {
    const r = psql(readFileSync(join('supabase/migrations', m), 'utf8'), { allowFail: true });
    check(`миграция ${m}`, r.ok, r.err);
    if (!r.ok) throw new Error('migration failed');
  }

  const owner1 = '11111111-1111-1111-1111-111111111111';
  const owner2 = '22222222-2222-2222-2222-222222222222';
  psql(`
    insert into auth.users (id, email) values ('${owner1}', 'a@x.ru'), ('${owner2}', 'b@x.ru');
    insert into public.studios (id, slug, settings) values
      ('aaaaaaaa-0000-0000-0000-000000000001', 'studio-a', '{"name":"A"}'),
      ('aaaaaaaa-0000-0000-0000-000000000002', 'studio-b', '{"name":"B"}');
    insert into public.studio_owners values ('aaaaaaaa-0000-0000-0000-000000000001', '${owner1}'),
                                            ('aaaaaaaa-0000-0000-0000-000000000002', '${owner2}');
    insert into public.bookings (studio_id, service_id, service_name, price, bay, start_at, end_at, block_end, customer_name, customer_phone, car, manage_token_hash)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'ceramic', 'Керамика', 30000, 1,
            '2026-10-05 10:00+03', '2026-10-06 16:00+03', '2026-10-06 16:30+03', 'Иван', '+79990000000', 'BMW', 'secret');
  `);

  const overlap = psql(`
    insert into public.bookings (studio_id, service_id, service_name, bay, start_at, end_at, block_end, customer_name, customer_phone, car)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'wash', 'Мойка', 1, '2026-10-06 12:00+03', '2026-10-06 13:00+03', '2026-10-06 13:30+03', 'Пётр', '+79990000001', 'Kia');
  `, { allowFail: true });
  check('пересечение в одном боксе (вторая машина во время двухдневной керамики) запрещено', !overlap.ok && /bookings_no_overlap/.test(overlap.err), overlap.err);

  const otherBay = psql(`
    insert into public.bookings (studio_id, service_id, service_name, bay, start_at, end_at, block_end, customer_name, customer_phone, car)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'wash', 'Мойка', 2, '2026-10-06 12:00+03', '2026-10-06 13:00+03', '2026-10-06 13:30+03', 'Пётр', '+79990000001', 'Kia');
  `, { allowFail: true });
  check('в другом боксе то же время доступно', otherBay.ok, otherBay.err);

  const afterBuffer = psql(`
    insert into public.bookings (studio_id, service_id, service_name, bay, start_at, end_at, block_end, customer_name, customer_phone, car)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'wash', 'Мойка', 1, '2026-10-06 16:30+03', '2026-10-06 17:30+03', '2026-10-06 18:00+03', 'Олег', '+79990000002', 'Lada');
  `, { allowFail: true });
  check('сразу после подготовки бокс свободен', afterBuffer.ok, afterBuffer.err);

  const cancelled = psql(`
    update public.bookings set status = 'cancelled' where customer_name = 'Олег';
    insert into public.bookings (studio_id, service_id, service_name, bay, start_at, end_at, block_end, customer_name, customer_phone, car)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'wash', 'Мойка', 1, '2026-10-06 16:30+03', '2026-10-06 17:30+03', '2026-10-06 18:00+03', 'Анна', '+79990000003', 'Mini');
  `, { allowFail: true });
  check('отменённая запись освобождает время', cancelled.ok, cancelled.err);

  const anonBookings = psql(`select count(*) from public.bookings;`, { role: 'anon', allowFail: true });
  check('аноним не видит записи клиентов', !anonBookings.ok && /permission denied/.test(anonBookings.err), anonBookings.out + anonBookings.err);

  const anonBusy = psql(`select count(*) from public.get_busy('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-01', '2026-10-31');`, { role: 'anon' });
  check('аноним видит занятость боксов без персональных данных', anonBusy.out === '3', anonBusy.out);

  const anonStudios = psql(`select count(*) from public.studios;`, { role: 'anon' });
  check('аноним видит публичные настройки студий', anonStudios.out === '2', anonStudios.out);

  const own = psql(`select count(*) from public.bookings;`, { role: 'authenticated', sub: owner1 });
  check('владелец видит только свои записи', own.out.endsWith('4'), own.out + own.err);
  const others = psql(`select count(*) from public.bookings;`, { role: 'authenticated', sub: owner2 });
  check('чужой владелец не видит записи', others.out.endsWith('0'), others.out + others.err);

  const token = psql(`select manage_token_hash from public.bookings limit 1;`, { role: 'authenticated', sub: owner1, allowFail: true });
  check('хэш токена клиента скрыт даже от владельца', !token.ok && /permission denied/.test(token.err), token.out + token.err);

  const upd = psql(`update public.studios set settings = '{"name":"B2"}' where slug = 'studio-b' returning 1;`, { role: 'authenticated', sub: owner1 });
  check('владелец не может менять чужую студию', !upd.out.includes('1'), upd.out);
  const slug = psql(`update public.studios set slug = 'hack' where slug = 'studio-a';`, { role: 'authenticated', sub: owner1, allowFail: true });
  check('владелец не может менять адрес ссылки', !slug.ok, slug.err);
  const settings = psql(`update public.studios set settings = '{"name":"A2"}' where slug = 'studio-a' returning settings->>'name';`, { role: 'authenticated', sub: owner1 });
  check('владелец меняет настройки своей студии', settings.out.endsWith('A2'), settings.out + settings.err);

  const pay = psql(`
    insert into public.payments (studio_id, booking_id, kind, amount) select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'payment', 30000 from public.bookings where customer_name = 'Иван';
    insert into public.payments (studio_id, booking_id, kind, amount) select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'refund', 5000 from public.bookings where customer_name = 'Иван';
    select sum(case when kind = 'payment' then amount else -amount end) from public.payments;`, { role: 'authenticated', sub: owner1 });
  check('оплаты и возвраты владельца', pay.out.endsWith('25000.00'), pay.out + pay.err);
  const foreignPay = psql(`insert into public.payments (studio_id, kind, amount) values ('aaaaaaaa-0000-0000-0000-000000000002', 'payment', 100);`, { role: 'authenticated', sub: owner1, allowFail: true });
  check('нельзя внести оплату в чужую студию', !foreignPay.ok, foreignPay.err);

  const upload = psql(`insert into storage.objects (bucket_id, name) values ('studio-media', 'aaaaaaaa-0000-0000-0000-000000000001/hero.jpg');`, { role: 'authenticated', sub: owner1, allowFail: true });
  check('владелец загружает фото в папку своей студии', upload.ok, upload.err);
  const upload2 = psql(`insert into storage.objects (bucket_id, name) values ('studio-media', 'aaaaaaaa-0000-0000-0000-000000000002/hero.jpg');`, { role: 'authenticated', sub: owner1, allowFail: true });
  check('и не может загрузить в чужую', !upload2.ok, upload2.err);
} finally {
  run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop'], { allowFail: true, stdio: 'pipe' });
  rmSync(dir, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${failed} проверок не прошло`);
  process.exit(1);
}
console.log('\nБаза данных: все проверки пройдены');

