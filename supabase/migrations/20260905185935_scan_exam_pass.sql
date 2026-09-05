-- The scanner had no way to recognize an exam-day pass QR code
-- ({v:1, id: token, exam: true}) — it always tried to look the id up
-- as a real student in profiles, which correctly failed with
-- 'Student not found' since exam tokens aren't student ids at all.

alter table public.exam_bookings
  add column if not exists is_scanned boolean not null default false,
  add column if not exists scanned_at timestamptz,
  add column if not exists scanned_by uuid references auth.users(id) on delete set null;

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
      'trips_remaining', null
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
    'trips_remaining', null
  );
end;
$$;

revoke all on function public.scan_exam_pass(uuid) from public, anon;
grant execute on function public.scan_exam_pass(uuid) to authenticated;
