-- =====================================================================
-- Waleed & Talaat — Backend Architecture v2
-- Strict booking windows · trip auto-deduction · QR scan RPC ·
-- 4:00 PM no-show cron · guest daily-pass + WhatsApp handoff
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 1. STRICT SERVER-SIDE BOOKING WINDOWS
--    (Frontend already restricts this, but any direct REST/API call
--    must be rejected server-side too — this is the real enforcement.)
-- ---------------------------------------------------------------------
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
  -- Staff can always create/edit bookings (manual overrides, support cases).
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

drop trigger if exists booking_window_guard on public.bookings;
create trigger booking_window_guard
  before insert on public.bookings
  for each row execute function public.enforce_booking_window();

-- ---------------------------------------------------------------------
-- 2. SCAN IDEMPOTENCY — one scan row per student/date/slot, not per day.
--    (A student legitimately scans twice a day: once at the morning
--    slot, once at an early-return slot — those must both count.)
-- ---------------------------------------------------------------------
alter table public.scans
  drop constraint if exists scans_student_id_service_date_slot_key;
alter table public.scans
  add constraint scans_student_id_service_date_slot_key unique (student_id, service_date, slot);

-- ---------------------------------------------------------------------
-- 3. ATOMIC QR SCAN + TRIP DEDUCTION
--    Single RPC so the client never decides "is this booked" itself —
--    that decision, the scan log, and the trip deduction happen in one
--    transaction, staff-gated, on the server.
-- ---------------------------------------------------------------------
create or replace function public.scan_pass(p_student_id uuid, p_slot text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
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

  select * into v_profile from public.profiles where id = p_student_id;
  if not found then
    return jsonb_build_object('error', 'Student not found');
  end if;

  -- Already scanned for this exact slot today? Don't double-deduct.
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

  insert into public.scans (student_id, scanned_by, service_date, slot)
  values (p_student_id, auth.uid(), v_today, p_slot);

  -- Deduct one trip on a genuine, booked, physical scan for package
  -- students. The 4:00 PM slot is deducted separately by the no-show
  -- cron below, never here (it has no physical scan requirement).
  if v_status = 'booked' and p_slot <> '04:00 PM' and v_profile.subscription_type = 'package' then
    update public.profiles
      set trips_remaining = greatest(trips_remaining - 1, 0)
      where id = p_student_id
      returning trips_remaining into v_profile.trips_remaining;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'full_name', v_profile.full_name,
    'route', v_profile.route,
    'photo_url', v_profile.photo_url,
    'trips_remaining', v_profile.trips_remaining
  );
end;
$$;

revoke all on function public.scan_pass(uuid, text) from public, anon;
grant execute on function public.scan_pass(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. 4:00 PM NO-SCAN AUTO-DEDUCTION (cron, daily 4:15 PM Cairo time)
--    Cairo is UTC+2 year-round (Egypt has not observed DST since 2016),
--    so 4:15 PM Cairo = 14:15 UTC. If that ever changes, update the
--    cron schedule below.
-- ---------------------------------------------------------------------
create or replace function public.auto_deduct_noshow_return()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
begin
  update public.profiles p
    set trips_remaining = greatest(trips_remaining - 1, 0)
    where p.subscription_type = 'package'
      -- scanned present in the morning today
      and exists (
        select 1 from public.scans s
        where s.student_id = p.id and s.service_date = v_today
          and s.slot in ('06:00 AM', '08:00 AM')
      )
      -- did NOT scan an early return today
      and not exists (
        select 1 from public.scans s
        where s.student_id = p.id and s.service_date = v_today
          and s.slot in ('12:30 PM', '01:30 PM')
      )
      -- did NOT opt out of the 4:00 PM bus today
      and not exists (
        select 1 from public.opt_outs o
        where o.student_id = p.id and o.service_date = v_today
      )
      -- idempotency guard: never process the same student/date twice
      and not exists (
        select 1 from public.scans s
        where s.student_id = p.id and s.service_date = v_today and s.slot = '04:00 PM'
      );

  -- Log a synthetic scan row per affected student so re-runs are a no-op.
  insert into public.scans (student_id, scanned_by, service_date, slot)
  select p.id, null, v_today, '04:00 PM'
  from public.profiles p
  where p.subscription_type = 'package'
    and exists (
      select 1 from public.scans s
      where s.student_id = p.id and s.service_date = v_today and s.slot in ('06:00 AM', '08:00 AM')
    )
    and not exists (
      select 1 from public.scans s
      where s.student_id = p.id and s.service_date = v_today and s.slot in ('12:30 PM', '01:30 PM')
    )
    and not exists (
      select 1 from public.opt_outs o where o.student_id = p.id and o.service_date = v_today
    )
    and not exists (
      select 1 from public.scans s
      where s.student_id = p.id and s.service_date = v_today and s.slot = '04:00 PM'
    )
  on conflict (student_id, service_date, slot) do nothing;
end;
$$;

revoke all on function public.auto_deduct_noshow_return() from public, anon, authenticated;

select cron.schedule(
  'auto-deduct-4pm-noshow',
  '15 14 * * *',
  $$select public.auto_deduct_noshow_return();$$
);

-- ---------------------------------------------------------------------
-- 5. NON-SUBSCRIBER DAILY PASS -> APPROVAL -> GUEST QR PASS
-- ---------------------------------------------------------------------
create table if not exists public.guest_passes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.daily_pass_requests(id) on delete cascade,
  full_name text not null,
  phone text not null,
  route text not null,
  slot text not null,
  service_date date not null,
  pass_token uuid not null default gen_random_uuid() unique,
  is_scanned boolean not null default false,
  scanned_at timestamptz,
  scanned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select on public.guest_passes to authenticated;
grant all on public.guest_passes to service_role;
alter table public.guest_passes enable row level security;
create policy "staff read guest passes" on public.guest_passes
  for select to authenticated using (public.is_staff(auth.uid()));

-- Public, token-scoped read for the guest's own QR pass page. Never
-- expose the table directly to anon — only this narrow RPC.
create or replace function public.get_guest_pass(p_token uuid)
returns table (
  full_name text, route text, slot text, service_date date, is_scanned boolean
)
language sql
security definer
set search_path = public
as $$
  select full_name, route, slot, service_date, is_scanned
  from public.guest_passes
  where pass_token = p_token;
$$;
revoke all on function public.get_guest_pass(uuid) from public;
grant execute on function public.get_guest_pass(uuid) to anon, authenticated;

-- Staff-only decision RPC: approve creates the guest pass row and
-- returns everything the caller (an Edge Function) needs to build the
-- pass URL and fire the WhatsApp webhook. Reject just returns the
-- request so the Edge Function can send the rejection message.
create or replace function public.decide_daily_pass_request(p_request_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_pass record;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_action not in ('approved', 'rejected') then
    raise exception 'Invalid action';
  end if;

  select * into v_request from public.daily_pass_requests where id = p_request_id and status = 'pending';
  if not found then
    return jsonb_build_object('error', 'Request not found or already decided');
  end if;

  update public.daily_pass_requests set status = p_action where id = p_request_id;

  if p_action = 'approved' then
    insert into public.guest_passes (request_id, full_name, phone, route, slot, service_date)
    values (v_request.id, v_request.full_name, v_request.phone, v_request.route, v_request.slot, v_request.service_date)
    returning * into v_pass;
  end if;

  return jsonb_build_object(
    'action', p_action,
    'full_name', v_request.full_name,
    'phone', v_request.phone,
    'route', v_request.route,
    'slot', v_request.slot,
    'pass_token', v_pass.pass_token
  );
end;
$$;
revoke all on function public.decide_daily_pass_request(uuid, text) from public, anon;
grant execute on function public.decide_daily_pass_request(uuid, text) to authenticated;
