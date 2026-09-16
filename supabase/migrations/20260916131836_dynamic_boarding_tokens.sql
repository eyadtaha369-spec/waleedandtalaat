-- =====================================================================
-- Dynamic, server-verified boarding pass tokens
-- =====================================================================
-- Previously the student boarding pass QR just encoded the student's
-- raw UUID — completely static, so a captured screenshot scans
-- successfully forever. This replaces it with a short-lived, single-
-- use token the client refreshes every ~45s, verified server-side at
-- scan time. A cosmetic-only "refreshing countdown" with no backend
-- change would not actually stop a screenshot from working; this is
-- the real mechanism that does.

create table if not exists public.boarding_tokens (
  token uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists boarding_tokens_student_idx on public.boarding_tokens(student_id);
create index if not exists boarding_tokens_expires_idx on public.boarding_tokens(expires_at);

alter table public.boarding_tokens enable row level security;
grant select, insert on public.boarding_tokens to authenticated;
-- No update/delete grant to authenticated — only scan_pass() (security
-- definer) marks a token used, and only expiry cleanup (also security
-- definer, below) deletes old rows.
create policy "students manage their own tokens" on public.boarding_tokens
  for all to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());

-- Student-callable, self-service only (auth.uid() is always the
-- caller's own id — no way to generate a token for someone else).
-- Also opportunistically clears this student's own old expired
-- tokens so the table doesn't grow unbounded.
create or replace function public.generate_boarding_token()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_expires timestamptz := now() + interval '60 seconds';
begin
  delete from public.boarding_tokens
    where student_id = auth.uid() and expires_at < now() - interval '5 minutes';

  insert into public.boarding_tokens (student_id, expires_at)
    values (auth.uid(), v_expires)
    returning token into v_token;

  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end;
$$;

revoke all on function public.generate_boarding_token() from public, anon;
grant execute on function public.generate_boarding_token() to authenticated;

-- scan_pass() now takes a boarding token instead of a raw student id.
-- Looks up and validates the token (exists, not expired, not already
-- used) before doing anything else, and marks it used on a real
-- outcome (booked/not_booked/no_trips_left) so the same captured
-- token can't be replayed even within its own validity window —
-- 'scanned_earlier' does NOT consume it, since that's just a student
-- being re-scanned with a fresh token for a boarding already recorded.
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
