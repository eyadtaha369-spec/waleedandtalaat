-- Corrects a regression from two earlier applies today
-- (remove_borg_el_arab_return_time_restriction and
-- fix_enforce_booking_window_missing_column) that were each based on
-- an outdated ancestor of this function and silently wiped out the
-- FORCE_OPEN/FORCE_CLOSED per-trip-type overrides and the Special
-- Sunday Trip bypass added by 20260917194646_per_trip_type_overrides.sql
-- and 20260918081340_special_sunday_trip.sql.
--
-- Byte-for-byte the same as 20260918125917_special_sunday_cutoff_6pm.sql
-- (the last known-good version), with only the خط برج العرب 01:30/02:30 PM
-- restriction block removed — that route now has its own return
-- dropoff-stop flow instead of the restriction that used to block it.
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
  v_target_sunday date;
  v_cutoff timestamp;
begin
  if public.is_staff(auth.uid()) then
    return new;
  end if;

  select morning_departure_status, early_return_status, special_sunday_active
    into v_settings
    from public.app_settings where id = true;

  if new.kind = 'morning' then
    if coalesce(v_settings.special_sunday_active, false) then
      v_target_sunday := now_cairo::date
        + ((7 - extract(dow from now_cairo)::int) % 7);
      v_cutoff := (v_target_sunday - 1)::timestamp + interval '18 hours';
      if new.service_date = v_target_sunday and now_cairo <= v_cutoff then
        return new;
      end if;
    end if;

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
