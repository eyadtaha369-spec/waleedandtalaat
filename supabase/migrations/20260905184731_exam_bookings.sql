-- =====================================================================
-- Exam Days / Summer Bookings — temporary guest booking system
-- =====================================================================

create table if not exists public.exam_bookings (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  exam_date date not null,
  pickup_stop text not null,
  pickup_time text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  pass_token uuid unique,
  created_at timestamptz not null default now()
);

grant insert on public.exam_bookings to anon, authenticated;
grant select, update on public.exam_bookings to authenticated;
grant all on public.exam_bookings to service_role;

alter table public.exam_bookings enable row level security;

create policy "anyone can request an exam booking" on public.exam_bookings
  for insert to anon, authenticated with check (true);
create policy "admins read exam bookings" on public.exam_bookings
  for select to authenticated using (public.is_admin(auth.uid()));
create policy "admins update exam bookings" on public.exam_bookings
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Public, token-scoped read for the guest's own pass page. Never
-- exposes the table itself to anon.
create or replace function public.get_exam_pass(p_token uuid)
returns table (
  full_name text,
  exam_date date,
  pickup_stop text,
  pickup_time text,
  status text
)
language sql
security definer
set search_path = public
as $$
  select full_name, exam_date, pickup_stop, pickup_time, status
  from public.exam_bookings
  where pass_token = p_token and status = 'confirmed';
$$;
revoke all on function public.get_exam_pass(uuid) from public;
grant execute on function public.get_exam_pass(uuid) to anon, authenticated;

-- Admin-only accept/reject. Accepting mints the pass_token used to
-- build the shareable QR pass URL.
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
    'pass_token', v_booking.pass_token
  );
end;
$$;
revoke all on function public.decide_exam_booking(uuid, text) from public, anon;
grant execute on function public.decide_exam_booking(uuid, text) to authenticated;
