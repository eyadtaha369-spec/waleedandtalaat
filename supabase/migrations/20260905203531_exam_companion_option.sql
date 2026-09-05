-- =====================================================================
-- Exam bookings: mandatory companion (مرافق) option + receipt upload
-- =====================================================================

alter table public.exam_bookings
  add column if not exists has_companion boolean not null default false,
  add column if not exists companion_name text,
  add column if not exists companion_relation text,
  add column if not exists receipt_url text;

-- Storage bucket for InstaPay receipt uploads. Not public — only
-- admins can view a receipt, via a signed URL.
insert into storage.buckets (id, name, public)
values ('exam-receipts', 'exam-receipts', false)
on conflict (id) do nothing;

create policy "anyone can upload an exam receipt" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'exam-receipts');

create policy "admins can view exam receipts" on storage.objects
  for select to authenticated
  using (bucket_id = 'exam-receipts' and public.is_admin(auth.uid()));

-- get_exam_pass now also exposes companion info so the public pass
-- page can show the "طالب + 1 مرافق" label. Must drop first: adding a
-- column changes the return type (OUT parameters), which CREATE OR
-- REPLACE can't do on its own.
drop function if exists public.get_exam_pass(uuid);
create or replace function public.get_exam_pass(p_token uuid)
returns table (
  full_name text,
  exam_date date,
  pickup_stop text,
  pickup_time text,
  status text,
  has_companion boolean,
  companion_name text
)
language sql
security definer
set search_path = public
as $$
  select full_name, exam_date, pickup_stop, pickup_time, status, has_companion, companion_name
  from public.exam_bookings
  where pass_token = p_token and status = 'confirmed';
$$;
revoke all on function public.get_exam_pass(uuid) from public;
grant execute on function public.get_exam_pass(uuid) to anon, authenticated;

-- scan_exam_pass now also reports whether a companion is included, so
-- the scanner can show the "companion allowed" badge.
create or replace function public.scan_exam_pass(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select * into v_booking
    from public.exam_bookings
    where pass_token = p_token and status = 'confirmed';

  if not found then
    return jsonb_build_object('error', 'Exam pass not found or not confirmed');
  end if;

  if v_booking.is_scanned then
    return jsonb_build_object(
      'status', 'scanned_earlier',
      'full_name', v_booking.full_name,
      'route', v_booking.pickup_stop,
      'photo_url', null,
      'trips_remaining', null,
      'has_companion', v_booking.has_companion
    );
  end if;

  update public.exam_bookings
    set is_scanned = true, scanned_at = now(), scanned_by = auth.uid()
    where pass_token = p_token;

  return jsonb_build_object(
    'status', 'booked',
    'full_name', v_booking.full_name,
    'route', v_booking.pickup_stop,
    'photo_url', null,
    'trips_remaining', null,
    'has_companion', v_booking.has_companion
  );
end;
$$;

-- decide_exam_booking now also passes companion info through, in case
-- the confirmation flow wants to reference it.
create or replace function public.decide_exam_booking(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_action not in ('confirmed', 'rejected') then
    raise exception 'Invalid action';
  end if;

  select * into v_booking from public.exam_bookings where id = p_id and status = 'pending';
  if not found then
    return jsonb_build_object('error', 'Booking not found or already decided');
  end if;

  update public.exam_bookings
    set status = p_action, pass_token = case when p_action = 'confirmed' then gen_random_uuid() else null end
    where id = p_id
    returning * into v_booking;

  return jsonb_build_object(
    'action', p_action,
    'full_name', v_booking.full_name,
    'phone', v_booking.phone,
    'exam_date', v_booking.exam_date,
    'pickup_stop', v_booking.pickup_stop,
    'pickup_time', v_booking.pickup_time,
    'pass_token', v_booking.pass_token,
    'has_companion', v_booking.has_companion,
    'companion_name', v_booking.companion_name
  );
end;
$$;

