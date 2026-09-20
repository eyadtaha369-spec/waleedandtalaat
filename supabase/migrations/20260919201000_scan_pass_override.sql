-- =====================================================================
-- Supervisor-facing "Check-in Anyway" manual override
-- =====================================================================
-- The admin-only dateOverride input on ScannerPanel is a full manual
-- date override — overkill (and inaccessible to non-admin supervisors)
-- for the common case of "I can see this student should be let on,
-- just let them on." This adds a narrow, staff-callable escape hatch:
-- scan_pass_override() skips the booking/opt-out lookup entirely and
-- always checks the student in for today, logging it as an explicit
-- override for audit purposes.
alter table public.scans
  add column if not exists scanned_via_override boolean not null default false;

create or replace function public.scan_pass_override(p_token uuid, p_slot text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_profile record;
  v_token_row record;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select * into v_token_row from public.boarding_tokens where token = p_token;
  if not found then
    return jsonb_build_object('error', 'Invalid pass. Ask the student to refresh their pass.');
  end if;
  if v_token_row.expires_at < now() then
    return jsonb_build_object('error', 'This pass has expired. Ask the student to refresh their pass.');
  end if;
  -- Deliberately not checking used_at: this RPC is only ever invoked
  -- right after a scan_pass() call already returned 'not_booked' for
  -- this same token, which itself already marks the token used (see
  -- scan_pass's comment on why every real outcome consumes the
  -- token). Requiring an unused token here would make the button that
  -- calls this function permanently unusable.

  select * into v_profile from public.profiles where id = v_token_row.student_id;
  if not found then
    return jsonb_build_object('error', 'Student not found');
  end if;

  -- No bookings/opt_outs check at all — staff is explicitly vouching
  -- for this student regardless of what's on file.
  insert into public.scans (student_id, scanned_by, service_date, slot, scanned_via_override)
  values (v_profile.id, auth.uid(), v_today, p_slot, true)
  on conflict (student_id, service_date, slot)
    do update set scanned_by = excluded.scanned_by,
                  scanned_at = now(),
                  scanned_via_override = true;

  update public.boarding_tokens set used_at = now() where token = p_token;

  if p_slot <> '04:00 PM' and v_profile.subscription_type = '70_trips' then
    update public.profiles
      set trips_remaining = greatest(trips_remaining - 1, 0)
      where id = v_profile.id
      returning trips_remaining into v_profile.trips_remaining;

    insert into public.trip_transactions (student_id, amount, description, created_by)
    values (v_profile.id, -1, 'خصم تلقائي - تسجيل يدوي (تجاوز)', auth.uid());
  end if;

  return jsonb_build_object(
    'status', 'booked',
    'override', true,
    'full_name', v_profile.full_name,
    'route', v_profile.route,
    'photo_url', v_profile.photo_url,
    'trips_remaining', v_profile.trips_remaining,
    'trips_total', v_profile.trips_total
  );
end;
$$;

revoke all on function public.scan_pass_override(uuid, text) from public, anon;
grant execute on function public.scan_pass_override(uuid, text) to authenticated;
