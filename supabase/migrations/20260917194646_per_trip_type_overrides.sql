-- =====================================================================
-- Independent per-trip-type booking overrides (AUTO / FORCE_OPEN / FORCE_CLOSED)
-- =====================================================================
-- Supersedes last turn's single global booking_window_override /
-- booking_window_closed booleans (which forced BOTH trip types
-- together) with independent 3-state controls for morning departure
-- and early return. Those two columns are now fully dead — the demo/
-- recording override and the emergency full-close are both subsumed
-- by setting both new columns to FORCE_OPEN or FORCE_CLOSED together
-- — so they're dropped rather than left as confusing unused residue.

alter table public.app_settings drop column if exists booking_window_override;
alter table public.app_settings drop column if exists booking_window_closed;

alter table public.app_settings
  add column if not exists morning_departure_status text not null default 'AUTO'
    check (morning_departure_status in ('AUTO', 'FORCE_OPEN', 'FORCE_CLOSED'));
alter table public.app_settings
  add column if not exists early_return_status text not null default 'AUTO'
    check (early_return_status in ('AUTO', 'FORCE_OPEN', 'FORCE_CLOSED'));

-- Same permission model as the toggle it replaces: both admin and
-- supervisor may set this, and it's genuinely global — not scoped to
-- the caller's own route.
create or replace function public.set_trip_type_override(p_kind text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_kind not in ('morning', 'return') then
    raise exception 'Invalid kind';
  end if;
  if p_status not in ('AUTO', 'FORCE_OPEN', 'FORCE_CLOSED') then
    raise exception 'Invalid status';
  end if;

  if p_kind = 'morning' then
    update public.app_settings set morning_departure_status = p_status where id = true;
  else
    update public.app_settings set early_return_status = p_status where id = true;
  end if;
end;
$$;

revoke all on function public.set_trip_type_override(text, text) from public, anon;
grant execute on function public.set_trip_type_override(text, text) to authenticated;

-- Trigger update: FORCE_CLOSED/FORCE_OPEN evaluated per trip type
-- independently instead of one shared flag for both. The خط برج العرب
-- 1:30/2:30 restriction is an orthogonal route-specific rule and
-- still applies regardless of the return override's state.
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

  select morning_departure_status, early_return_status into v_settings
    from public.app_settings where id = true;

  if new.kind = 'morning' then
    if coalesce(v_settings.morning_departure_status, 'AUTO') = 'FORCE_CLOSED' then
      raise exception 'Morning departure booking is currently closed by the administration.'
        using errcode = 'P0001';
    elsif coalesce(v_settings.morning_departure_status, 'AUTO') = 'FORCE_OPEN' then
      return new;
    end if;
    if minutes_of_day < 12 * 60 or minutes_of_day >= 19 * 60 then
      raise exception 'Morning booking window is closed. It opens 12:00 PM and closes 7:00 PM.'
        using errcode = 'P0001';
    end if;
  elsif new.kind = 'return' then
    if coalesce(v_settings.early_return_status, 'AUTO') = 'FORCE_CLOSED' then
      raise exception 'Early return booking is currently closed by the administration.'
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

    if coalesce(v_settings.early_return_status, 'AUTO') = 'FORCE_OPEN' then
      return new;
    end if;
    if minutes_of_day < 6 * 60 + 30 or minutes_of_day >= 10 * 60 + 30 then
      raise exception 'Early return booking window is closed. It opens 6:30 AM and closes 10:30 AM.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;
