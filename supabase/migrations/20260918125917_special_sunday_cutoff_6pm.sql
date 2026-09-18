-- Special Sunday Trip cutoff changed from Saturday 10:00 PM to
-- Saturday 6:00 PM, matching schedule.ts's specialSundayWindow().
-- Same dow-based target-Sunday math as before; only the cutoff offset
-- changes (22 hours -> 18 hours past midnight of the Saturday).
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
