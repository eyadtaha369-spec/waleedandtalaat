-- app_settings.booking_window_override and app_settings.booking_window_closed
-- do not exist in production: neither column ever landed live (their
-- creating migrations, 20260910110132_booking_window_override_toggle.sql
-- and 20260917185226_master_booking_window_toggle.sql, were committed
-- as files but never actually applied here), so any reference to them
-- in enforce_booking_window() would raise "column does not exist" on
-- every booking insert. Recorded here to match what is already live —
-- not re-applied.
create or replace function public.enforce_booking_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  now_cairo timestamp := (now() at time zone 'Africa/Cairo');
  minutes_of_day int := extract(hour from now_cairo)::int * 60 + extract(minute from now_cairo)::int;
begin
  if public.is_staff(auth.uid()) then
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
