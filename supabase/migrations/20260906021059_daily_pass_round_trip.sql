-- =====================================================================
-- Daily Pass: trip type (one-way/round-trip), payment method + receipt,
-- dual QR pass generation, and fleet allocation integration
-- =====================================================================

alter table public.daily_pass_requests
  add column if not exists trip_type text not null default 'one_way'
    check (trip_type in ('one_way', 'round_trip')),
  add column if not exists return_slot text,
  add column if not exists return_pickup_stop text,
  add column if not exists payment_method text not null default 'cash'
    check (payment_method in ('cash', 'instapay')),
  add column if not exists receipt_url text;

-- A guest pass is now tagged by leg (morning vs return) so a
-- round-trip request can have two independent scannable passes.
alter table public.guest_passes
  add column if not exists kind text not null default 'morning'
    check (kind in ('morning', 'return'));

-- Storage bucket for InstaPay receipts on daily-pass requests,
-- mirroring the exam-receipts pattern: anyone can upload (guest
-- submission), only admins can view (signed URL).
insert into storage.buckets (id, name, public)
values ('daily-pass-receipts', 'daily-pass-receipts', false)
on conflict (id) do nothing;

create policy "anyone can upload a daily pass receipt" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'daily-pass-receipts');

create policy "admins can view daily pass receipts" on storage.objects
  for select to authenticated
  using (bucket_id = 'daily-pass-receipts' and public.is_admin(auth.uid()));

-- get_guest_pass now also reports which leg (morning/return) this
-- specific pass covers. Must drop first: adding a column changes the
-- return type.
drop function if exists public.get_guest_pass(uuid);
create or replace function public.get_guest_pass(p_token uuid)
returns table (
  full_name text, route text, pickup_stop text, slot text, service_date date,
  is_scanned boolean, kind text
)
language sql
security definer
set search_path = public
as $$
  select full_name, route, pickup_stop, slot, service_date, is_scanned, kind
  from public.guest_passes
  where pass_token = p_token;
$$;
revoke all on function public.get_guest_pass(uuid) from public;
grant execute on function public.get_guest_pass(uuid) to anon, authenticated;

-- decide_daily_pass_request now creates one guest pass for a one-way
-- request, or two (morning + return) for a round-trip request, and
-- returns both tokens/slots so the caller can build a combined
-- WhatsApp message with two QR links.
create or replace function public.decide_daily_pass_request(p_request_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_morning_pass record;
  v_return_pass record;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
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
    insert into public.guest_passes (request_id, full_name, phone, route, pickup_stop, slot, service_date, kind)
    values (v_request.id, v_request.full_name, v_request.phone, v_request.route, v_request.pickup_stop, v_request.slot, v_request.service_date, 'morning')
    returning * into v_morning_pass;

    if v_request.trip_type = 'round_trip' and v_request.return_slot is not null then
      insert into public.guest_passes (request_id, full_name, phone, route, pickup_stop, slot, service_date, kind)
      values (v_request.id, v_request.full_name, v_request.phone, v_request.route, v_request.return_pickup_stop, v_request.return_slot, v_request.service_date, 'return')
      returning * into v_return_pass;
    end if;
  end if;

  return jsonb_build_object(
    'action', p_action,
    'full_name', v_request.full_name,
    'phone', v_request.phone,
    'route', v_request.route,
    'trip_type', v_request.trip_type,
    'morning_slot', v_request.slot,
    'morning_pass_token', v_morning_pass.pass_token,
    'return_slot', v_request.return_slot,
    'return_pass_token', v_return_pass.pass_token
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Fleet allocation now also counts daily-pass guests whose QR pass has
-- actually been scanned, grouped by route alongside subscribed
-- students, so bus-sizing reflects real total seats filled.
-- ---------------------------------------------------------------------
create or replace function public.fleet_manifest_report(p_date date default null)
returns table (
  route text,
  morning_scans bigint,
  early_return_passengers bigint,
  opted_out_count bigint,
  remaining_for_4pm bigint,
  recommended_bus text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Africa/Cairo')::date);
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  with student_morning as (
    select p.route as r, count(distinct s.student_id) as cnt
    from public.scans s
    join public.profiles p on p.id = s.student_id
    where s.service_date = v_date and s.slot in ('06:00 AM', '08:00 AM')
    group by p.route
  ),
  guest_morning as (
    select g.route as r, count(*) as cnt
    from public.guest_passes g
    where g.service_date = v_date and g.kind = 'morning' and g.is_scanned = true
    group by g.route
  ),
  student_early_return as (
    select p.route as r, count(distinct s.student_id) as cnt
    from public.scans s
    join public.profiles p on p.id = s.student_id
    where s.service_date = v_date and s.slot in ('12:30 PM', '01:30 PM', '02:30 PM')
    group by p.route
  ),
  guest_early_return as (
    select g.route as r, count(*) as cnt
    from public.guest_passes g
    where g.service_date = v_date and g.kind = 'return'
      and g.slot in ('12:30 PM', '01:30 PM', '02:30 PM') and g.is_scanned = true
    group by g.route
  ),
  opted_out as (
    select p.route as r, count(distinct o.student_id) as cnt
    from public.opt_outs o
    join public.profiles p on p.id = o.student_id
    where o.service_date = v_date
    group by p.route
  )
  select
    r.name,
    coalesce(sm.cnt, 0) + coalesce(gm.cnt, 0),
    coalesce(ser.cnt, 0) + coalesce(ger.cnt, 0),
    coalesce(oo.cnt, 0),
    greatest(
      coalesce(sm.cnt, 0) + coalesce(gm.cnt, 0)
        - (coalesce(ser.cnt, 0) + coalesce(ger.cnt, 0))
        - coalesce(oo.cnt, 0),
      0
    ),
    case
      when greatest(
        coalesce(sm.cnt, 0) + coalesce(gm.cnt, 0)
          - (coalesce(ser.cnt, 0) + coalesce(ger.cnt, 0))
          - coalesce(oo.cnt, 0),
        0
      ) <= 33
        then '33-seater'
      else '50-seater'
    end
  from public.routes r
  left join student_morning sm on sm.r = r.name
  left join guest_morning gm on gm.r = r.name
  left join student_early_return ser on ser.r = r.name
  left join guest_early_return ger on ger.r = r.name
  left join opted_out oo on oo.r = r.name
  order by r.display_order;
end;
$$;
