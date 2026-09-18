-- =====================================================================
-- Special Sunday Trip toggle
-- =====================================================================
-- When active, morning-departure booking targets the upcoming Sunday
-- specifically (computed dynamically, not a fixed date — see
-- nextSunday()/specialSundayWindow() in schedule.ts, which the
-- frontend and this trigger must agree with exactly), open from
-- whenever the admin activates it until 10:00 PM the Saturday before
-- that Sunday, bypassing the normal daily 12PM-7PM window. Turning it
-- off (or the cutoff passing) reverts to standard daily logic
-- automatically — no separate "off" branch needed here since this is
-- purely an additional bypass checked before the normal window logic.

alter table public.app_settings add column if not exists special_sunday_active boolean not null default false;

create or replace function public.set_special_sunday_active(p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  update public.app_settings set special_sunday_active = p_active where id = true;
end;
$$;

revoke all on function public.set_special_sunday_active(boolean) from public, anon;
grant execute on function public.set_special_sunday_active(boolean) to authenticated;

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
    -- Special Sunday Trip bypass, checked first: only applies when
    -- the toggle is on AND this specific booking targets that exact
    -- Sunday AND we're still before the Saturday 10PM cutoff. Matches
    -- nextSunday()/specialSundayWindow() in schedule.ts exactly —
    -- extract(dow from ...) is 0=Sunday in Postgres, same as JS
    -- Date.getDay().
    if coalesce(v_settings.special_sunday_active, false) then
      v_target_sunday := now_cairo::date
        + ((7 - extract(dow from now_cairo)::int) % 7);
      v_cutoff := (v_target_sunday - 1)::timestamp + interval '22 hours';
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
