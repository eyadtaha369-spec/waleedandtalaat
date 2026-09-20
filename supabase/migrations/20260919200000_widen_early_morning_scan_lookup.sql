-- =====================================================================
-- Widen the morning booking lookup for early-morning scans
-- =====================================================================
-- Bug: a student who re-books after midnight for "tomorrow morning"
-- gets a booking row dated tomorrow's calendar date. When a supervisor
-- scans that student's pass the *same* morning (e.g. 6:30 AM), v_today
-- is still today's date, so the exact-date lookup in scan_pass() finds
-- nothing and the student is wrongly rejected as 'not_booked' even
-- though they have a perfectly valid booking for the trip that is
-- literally departing in minutes.
--
-- Fix: for the two morning slots only, if no booking is found for
-- v_today AND the real wall-clock time in Cairo is still in the early
-- part of the day (before noon), also check for a booking dated
-- v_today + 1. If that's where the booking actually landed, treat the
-- student as booked for TODAY's trip — the scan itself is still logged
-- and deducted against v_today, never tomorrow's date, so manifests
-- and per-day scan counts stay correct.
--
-- Return-window slots and the 04:00 PM opt-out path are untouched.
create or replace function public.scan_pass(p_token uuid, p_slot text, p_service_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual_today date := (now() at time zone 'Africa/Cairo')::date;
  v_today date;
  v_kind text;
  v_profile record;
  v_existing_scan record;
  v_booking record;
  v_opted_out boolean;
  v_status text;
  v_token_row record;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select * into v_token_row from public.boarding_tokens where token = p_token;
  if not found then
    return jsonb_build_object('error', 'Invalid or already-used pass. Ask the student to refresh their pass.');
  end if;
  if v_token_row.used_at is not null then
    return jsonb_build_object('error', 'This pass was already scanned. Ask the student to refresh their pass.');
  end if;
  if v_token_row.expires_at < now() then
    return jsonb_build_object('error', 'This pass has expired. Ask the student to refresh their pass.');
  end if;

  v_today := coalesce(p_service_date, v_actual_today);

  if v_today <> v_actual_today and not public.is_admin(auth.uid()) then
    raise exception 'Only admins can scan against a different date' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_token_row.student_id;
  if not found then
    return jsonb_build_object('error', 'Student not found');
  end if;

  select * into v_existing_scan
    from public.scans
    where student_id = v_profile.id and service_date = v_today and slot = p_slot;

  if found then
    return jsonb_build_object(
      'status', 'scanned_earlier',
      'full_name', v_profile.full_name,
      'route', v_profile.route,
      'photo_url', v_profile.photo_url,
      'trips_remaining', v_profile.trips_remaining,
      'trips_total', v_profile.trips_total,
      'scanned_at', v_existing_scan.scanned_at
    );
  end if;

  if p_slot = '04:00 PM' then
    select exists(
      select 1 from public.opt_outs where student_id = v_profile.id and service_date = v_today
    ) into v_opted_out;
    v_status := case when v_opted_out then 'not_booked' else 'booked' end;
  else
    v_kind := case when p_slot in ('06:00 AM', '08:00 AM') then 'morning' else 'return' end;
    select * into v_booking
      from public.bookings
      where student_id = v_profile.id
        and service_date = v_today
        and kind = v_kind
        and slot = p_slot;
    v_status := case when found then 'booked' else 'not_booked' end;

    -- Early-morning grace window: a booking made after midnight for
    -- "tomorrow" is dated v_today + 1, but the trip it's for is the
    -- one departing THIS morning. Only widen the lookup while it's
    -- still genuinely early (before noon Cairo time, by the real
    -- clock, not by any admin p_service_date override) and only for
    -- the two morning slots.
    if v_status = 'not_booked'
       and p_slot in ('06:00 AM', '08:00 AM')
       and (now() at time zone 'Africa/Cairo')::time < time '12:00:00' then
      select * into v_booking
        from public.bookings
        where student_id = v_profile.id
          and service_date = v_today + 1
          and kind = v_kind
          and slot = p_slot;
      if found then
        v_status := 'booked';
      end if;
    end if;
  end if;

  if v_status = 'booked' and p_slot <> '04:00 PM'
     and v_profile.subscription_type = '70_trips' and v_profile.trips_remaining <= 0 then
    update public.boarding_tokens set used_at = now() where token = p_token;
    return jsonb_build_object(
      'status', 'no_trips_left',
      'full_name', v_profile.full_name,
      'route', v_profile.route,
      'photo_url', v_profile.photo_url,
      'trips_remaining', 0,
      'trips_total', v_profile.trips_total
    );
  end if;

  insert into public.scans (student_id, scanned_by, service_date, slot)
  values (v_profile.id, auth.uid(), v_today, p_slot);

  update public.boarding_tokens set used_at = now() where token = p_token;

  if v_status = 'booked' and p_slot <> '04:00 PM' and v_profile.subscription_type = '70_trips' then
    update public.profiles
      set trips_remaining = greatest(trips_remaining - 1, 0)
      where id = v_profile.id
      returning trips_remaining into v_profile.trips_remaining;

    insert into public.trip_transactions (student_id, amount, description, created_by)
    values (v_profile.id, -1, 'خصم تلقائي - مسح QR', auth.uid());
  end if;

  return jsonb_build_object(
    'status', v_status,
    'full_name', v_profile.full_name,
    'route', v_profile.route,
    'photo_url', v_profile.photo_url,
    'trips_remaining', v_profile.trips_remaining,
    'trips_total', v_profile.trips_total
  );
end;
$$;
