-- Запись в автосервис: студии, записи, оплаты, напоминания.
-- Пересечения записей в одном боксе запрещены на уровне базы (exclusion constraint).

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Студии
-- ---------------------------------------------------------------------------
create table public.studios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  -- Публичные настройки студии (формат — shared/schema.ts, studioSettingsSchema)
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.studio_owners (
  studio_id uuid not null references public.studios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (studio_id, user_id)
);
create index studio_owners_user_idx on public.studio_owners (user_id);

create or replace function public.is_studio_owner(p_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.studio_owners where studio_id = p_studio and user_id = auth.uid()
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger studios_touch before update on public.studios
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Записи
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete cascade,
  service_id text not null,
  service_name text not null,
  price integer not null default 0 check (price >= 0),
  bay smallint not null check (bay >= 1),
  start_at timestamptz not null,
  end_at timestamptz not null,
  block_end timestamptz not null,
  status text not null default 'booked'
    check (status in ('booked', 'arrived', 'ready', 'cancelled', 'no_show')),
  customer_name text not null check (char_length(customer_name) between 1 and 60),
  customer_phone text not null check (char_length(customer_phone) between 5 and 20),
  car text not null check (char_length(car) between 1 and 80),
  comment text not null default '' check (char_length(comment) <= 500),
  source text not null default 'client' check (source in ('client', 'owner')),
  manage_token_hash text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (end_at > start_at and block_end >= end_at),
  -- Один бокс не может быть занят двумя машинами одновременно
  -- (включая время подготовки и ночи многодневных работ).
  constraint bookings_no_overlap exclude using gist (
    studio_id with =,
    bay with =,
    tstzrange(start_at, block_end, '[)') with &&
  ) where (status <> 'cancelled')
);
create index bookings_studio_start_idx on public.bookings (studio_id, start_at);
create index bookings_reminder_idx on public.bookings (start_at) where reminder_sent_at is null and status = 'booked';

-- ---------------------------------------------------------------------------
-- Оплаты и возвраты
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  kind text not null check (kind in ('payment', 'refund')),
  amount numeric(12, 2) not null check (amount > 0),
  method text not null default 'card' check (method in ('cash', 'card', 'transfer')),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index payments_studio_created_idx on public.payments (studio_id, created_at);

-- Оплата должна относиться к записи той же студии
create or replace function public.payments_check_booking()
returns trigger
language plpgsql
as $$
begin
  if new.booking_id is not null and not exists (
    select 1 from public.bookings where id = new.booking_id and studio_id = new.studio_id
  ) then
    raise exception 'Запись не принадлежит студии';
  end if;
  return new;
end;
$$;
create trigger payments_check_booking before insert or update on public.payments
for each row execute function public.payments_check_booking();

-- ---------------------------------------------------------------------------
-- Подписки на push-напоминания (пишет только серверная функция)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (booking_id, endpoint)
);

-- ---------------------------------------------------------------------------
-- Занятость боксов без персональных данных — для расчёта свободного времени у клиента
-- ---------------------------------------------------------------------------
create or replace function public.get_busy(p_studio uuid, p_from timestamptz, p_to timestamptz)
returns table (bay smallint, start_at timestamptz, block_end timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.bay, b.start_at, b.block_end
  from public.bookings b
  where b.studio_id = p_studio
    and b.status <> 'cancelled'
    and b.start_at < p_to
    and b.block_end > p_from
    and p_to - p_from <= interval '200 days';
$$;

-- ---------------------------------------------------------------------------
-- Доступ (RLS)
-- ---------------------------------------------------------------------------
alter table public.studios enable row level security;
alter table public.studio_owners enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "studios are public" on public.studios
  for select to anon, authenticated using (true);
create policy "owners update their studio" on public.studios
  for update to authenticated using (public.is_studio_owner(id)) with check (public.is_studio_owner(id));

create policy "owners see their links" on public.studio_owners
  for select to authenticated using (user_id = auth.uid());

create policy "owners manage bookings" on public.bookings
  for all to authenticated
  using (public.is_studio_owner(studio_id))
  with check (public.is_studio_owner(studio_id));

create policy "owners manage payments" on public.payments
  for all to authenticated
  using (public.is_studio_owner(studio_id))
  with check (public.is_studio_owner(studio_id));

-- Владелец меняет только настройки, но не адрес ссылки (slug)
revoke insert, update, delete on public.studios from anon, authenticated;
grant select on public.studios to anon, authenticated;
grant update (settings) on public.studios to authenticated;

revoke all on public.studio_owners from anon;
grant select on public.studio_owners to authenticated;

revoke all on public.bookings, public.payments, public.push_subscriptions from anon;
grant select, insert, update, delete on public.payments to authenticated;
revoke all on public.bookings from authenticated;
grant insert, update, delete on public.bookings to authenticated;
-- Хэш токена клиента не нужен даже владельцу: читать можно только перечисленные колонки
grant select (id, studio_id, service_id, service_name, price, bay, start_at, end_at, block_end, status,
  customer_name, customer_phone, car, comment, source, reminder_sent_at, created_at, cancelled_at)
  on public.bookings to authenticated;
revoke all on public.push_subscriptions from authenticated;

revoke all on function public.get_busy(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_busy(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.is_studio_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Хранилище фотографий: публичное чтение, запись — владельцу в папку своей студии
-- Путь файла: <studio_id>/<имя файла>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('studio-media', 'studio-media', true)
on conflict (id) do nothing;

create or replace function public.owns_media_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_studio uuid;
begin
  begin
    v_studio := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.is_studio_owner(v_studio);
end;
$$;
grant execute on function public.owns_media_path(text) to authenticated;

create policy "owners upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'studio-media' and public.owns_media_path(name));
create policy "owners update media" on storage.objects
  for update to authenticated
  using (bucket_id = 'studio-media' and public.owns_media_path(name));
create policy "owners delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'studio-media' and public.owns_media_path(name));
