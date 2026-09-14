-- Server-side enforcement to match the new UI restriction: hiding an
-- option in the dropdown doesn't stop a direct API call from
-- submitting it anyway. خط برج العرب's return trip is limited to
-- 12:30 PM and 4:00 PM only — every other route is unaffected.
--
-- Important: for a 12:30/1:30/2:30 early-return booking, new.route is
-- deliberately overwritten to 'خط البحر' (every early-return trip
-- shares one Sea Route bus regardless of the student's real route —
-- see EARLY_RETURN_ROUTE_NAME in the frontend). So this check can't
-- use new.route at all for that case; it has to look up the
-- student's actual home route from their profile instead.
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
  v_home_route text;
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

    if new.slot in ('01:30 PM', '02:30 PM') then
      select route into v_home_route from public.profiles where id = new.student_id;
      if v_home_route = 'خط برج العرب' then
        raise exception 'This return time is not available for خط برج العرب. Choose 12:30 PM or 4:00 PM.'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;
