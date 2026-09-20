-- خط برج العرب now runs its own return trip on 01:30 PM / 02:30 PM
-- like every other route (see the dashboard's isBorgElArabReturn
-- branch), so the restriction that blocked those two slots for this
-- route no longer applies. Everything else in this trigger — the
-- staff bypass, the app_settings override, and both booking-window
-- hour checks — is unchanged from the original definition in
-- supabase/migrations/20260914023145_borg_el_arab_return_restriction.sql.
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
