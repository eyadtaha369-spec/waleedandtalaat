-- Fixes two real gaps in the existing 70-trip auto-deduction inside
-- scan_pass(): it silently floored at 0 (letting an exhausted student
-- board with no warning), and deductions were never logged to
-- trip_transactions at all (the manual +/- adjustments added later
-- ARE logged there, so the audit trail had a hole for the far more
-- common case — every normal boarding scan).
--
-- Note on "initial balance = 70": already correct and unaffected by
-- this migration — handle_new_user() has always set trips_remaining
-- to the same value as trips_total at account creation, and the
-- bulk-import mapping already sets trips_total = 70 for the 70_trips
-- plan. The 140-total case investigated separately was from a later
-- manual "+70 add" action, not from import defaults.
create or replace function public.scan_pass(p_student_id uuid, p_slot text, p_service_date date default null)
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
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  v_today := coalesce(p_service_date, v_actual_today);

  if v_today <> v_actual_today and not public.is_admin(auth.uid()) then
    raise exception 'Only admins can scan against a different date' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_student_id;
  if not found then
    return jsonb_build_object('error', 'Student not found');
  end if;

  select * into v_existing_scan
    from public.scans
    where student_id = p_student_id and service_date = v_today and slot = p_slot;

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
      select 1 from public.opt_outs where student_id = p_student_id and service_date = v_today
    ) into v_opted_out;
    v_status := case when v_opted_out then 'not_booked' else 'booked' end;
  else
    v_kind := case when p_slot in ('06:00 AM', '08:00 AM') then 'morning' else 'return' end;
    select * into v_booking
      from public.bookings
      where student_id = p_student_id
        and service_date = v_today
        and kind = v_kind
        and slot = p_slot;
    v_status := case when found then 'booked' else 'not_booked' end;
  end if;

  -- A 70-trip student with nothing left never boards for free and
  -- silently floors at 0 — flag it clearly instead, and don't log a
  -- scan at all, so a manual top-up + re-scan works normally right
  -- after.
  if v_status = 'booked' and p_slot <> '04:00 PM'
     and v_profile.subscription_type = '70_trips' and v_profile.trips_remaining <= 0 then
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
  values (p_student_id, auth.uid(), v_today, p_slot);

  if v_status = 'booked' and p_slot <> '04:00 PM' and v_profile.subscription_type = '70_trips' then
    update public.profiles
      set trips_remaining = greatest(trips_remaining - 1, 0)
      where id = p_student_id
      returning trips_remaining into v_profile.trips_remaining;

    insert into public.trip_transactions (student_id, amount, description, created_by)
    values (p_student_id, -1, 'خصم تلقائي - مسح QR', auth.uid());
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
