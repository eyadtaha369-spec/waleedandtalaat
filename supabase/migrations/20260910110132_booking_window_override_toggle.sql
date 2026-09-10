-- Temporary, reversible booking-window override — lets a real student
-- account book outside the normal windows for demo/recording purposes,
-- without permanently touching the actual time-based enforcement.
-- Single-row settings table, defaults OFF (normal enforcement).
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  booking_window_override boolean not null default false
);
insert into public.app_settings (id, booking_window_override)
  values (true, false)
  on conflict (id) do nothing;

grant select on public.app_settings to authenticated, anon;
grant update on public.app_settings to authenticated;
alter table public.app_settings enable row level security;

create policy "anyone can read app settings" on public.app_settings
  for select to authenticated, anon using (true);
create policy "admins can update app settings" on public.app_settings
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Trigger now also bypasses the window check when the override is on.
create or replace function public.enforce_booking_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  now_cairo timestamp := (now() at time zone 'Africa/Cairo');
  minutes_of_day int := extract(hour from now_cairo)::int * 60 + extract(minute from now_cairo)::int;
  v_override boolean;
begin
  if public.is_staff(auth.uid()) then
    return new;
  end if;

  select booking_window_override into v_override from public.app_settings where id = true;
  if coalesce(v_override, false) then
    return new;
  end if;

  if new.kind = 'morning' then
    if minutes_of_day < 12 * 60 or minutes_of_day >= 19 * 60 then
      raise exception 'Morning booking window is closed. It opens 12:00 PM and closes 7:00 PM.'
        using errcode = 'P0001';
    end if;
  elsif new.kind = 'return' then
    if minutes_of_day < 6 * 60 + 30 or minutes_of_day >= 10 * 60 + 30 then
      raise exception 'Early return booking window is closed. It opens 6:30 AM and closes 10:30 AM.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;
