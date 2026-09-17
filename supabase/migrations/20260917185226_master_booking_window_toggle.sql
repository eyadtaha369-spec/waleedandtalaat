-- =====================================================================
-- Global master booking-window toggle (شباك الحجز مفتوح/مغلق)
-- =====================================================================
-- Extends the existing single-row app_settings table (already used
-- for the demo/recording booking_window_override) rather than
-- creating a second settings table.
--
-- Precedence when enforce_booking_window() runs: booking_window_closed
-- is checked FIRST and always wins over booking_window_override — an
-- emergency full closure should never be silently bypassed by a
-- force-open flag left on from testing.

alter table public.app_settings add column if not exists booking_window_closed boolean not null default false;

-- Note: per the request, BOTH admin and supervisor can toggle this —
-- unlike every other feature in this app, this is a genuinely global,
-- system-wide switch, not scoped to the caller's own route. A
-- supervisor closing it closes booking for every student on every
-- route, not just their own.
create or replace function public.set_booking_window_closed(p_closed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  update public.app_settings set booking_window_closed = p_closed where id = true;
end;
$$;

revoke all on function public.set_booking_window_closed(boolean) from public, anon;
grant execute on function public.set_booking_window_closed(boolean) to authenticated;

-- Trigger update: booking_window_closed checked first, always wins.
create or replace function public.enforce_booking_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  now_cairo timestamp := (now() at time zone 'Africa/Cairo');
  minutes_of_day int := extract(hour from now_cairo)::int * 60 + extract(minute from now_cairo)::int;
  v_settings record;
begin
  if public.is_staff(auth.uid()) then
    return new;
  end if;

  select booking_window_override, booking_window_closed into v_settings
    from public.app_settings where id = true;

  if coalesce(v_settings.booking_window_closed, false) then
    raise exception 'Booking is currently closed by the administration.' using errcode = 'P0001';
  end if;

  if coalesce(v_settings.booking_window_override, false) then
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

    if new.slot in ('01:30 PM', '02:30 PM') then
      declare
        v_home_route text;
      begin
        select route into v_home_route from public.profiles where id = new.student_id;
        if v_home_route = 'خط برج العرب' then
          raise exception 'This return time is not available for خط برج العرب. Choose 12:30 PM or 4:00 PM.'
            using errcode = 'P0001';
        end if;
      end;
    end if;
  end if;

  return new;
end;
$$;
