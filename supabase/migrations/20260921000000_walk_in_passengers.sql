-- =====================================================================
-- Walk-in / emergency passengers
-- =====================================================================
-- A supervisor sometimes has to board someone with no booking and no
-- student account at all — an emergency seat, not a paid daily pass.
-- public.guest_passes is the wrong table for this: it's tightly coupled
-- to the paid daily-pass request/approval flow (request_id is NOT NULL
-- and references daily_pass_requests, which drags in payment_method,
-- receipt uploads, etc. that don't apply here). This is its own thing:
-- just a route/slot/date log entry a staff member creates on the spot,
-- with no name/phone/payment required (note is optional — a supervisor
-- jotting a name down if they happen to ask, not a data-entry step).
create table if not exists public.walk_in_passengers (
  id uuid primary key default gen_random_uuid(),
  route text not null,
  slot text not null,
  kind text not null check (kind in ('morning', 'return')),
  service_date date not null,
  scanned_by uuid not null references auth.users(id),
  scanned_at timestamptz not null default now(),
  note text
);

alter table public.walk_in_passengers enable row level security;

-- Mirrors public.scans' own RLS exactly: any staff member can read all
-- rows (there's no per-supervisor row scoping anywhere else in this
-- app either — e.g. scans read is staff-wide, not route-scoped), and
-- only staff can insert.
create policy "walk in passengers read" on public.walk_in_passengers
  for select to authenticated using (public.is_staff(auth.uid()));
create policy "walk in passengers insert" on public.walk_in_passengers
  for insert to authenticated with check (public.is_staff(auth.uid()));

grant select, insert on public.walk_in_passengers to authenticated;

-- service_date is always passed explicitly by the frontend, computed
-- via the exact same routeDashboardDefaultDate() (morning) / plain
-- today (return) functions dashboard.tsx and pass.tsx already use —
-- not duplicated here, so the two can never disagree. The plain
-- "today Cairo" default below only matters for a hypothetical direct
-- call that omits p_service_date; it intentionally does NOT attempt to
-- replicate routeDashboardDefaultDate's noon cutoff.
create or replace function public.log_walk_in_passenger(
  p_route text,
  p_slot text,
  p_kind text,
  p_service_date date default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_date date := coalesce(p_service_date, (now() at time zone 'Africa/Cairo')::date);
  v_row public.walk_in_passengers;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_kind not in ('morning', 'return') then
    raise exception 'Invalid kind';
  end if;
  if p_route is null or length(trim(p_route)) = 0 then
    raise exception 'Route is required';
  end if;
  if p_slot is null or length(trim(p_slot)) = 0 then
    raise exception 'Slot is required';
  end if;

  insert into public.walk_in_passengers (route, slot, kind, service_date, scanned_by, note)
  values (p_route, p_slot, p_kind, v_service_date, auth.uid(), nullif(trim(coalesce(p_note, '')), ''))
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'route', v_row.route,
    'slot', v_row.slot,
    'kind', v_row.kind,
    'service_date', v_row.service_date,
    'scanned_at', v_row.scanned_at
  );
end;
$$;

revoke all on function public.log_walk_in_passenger(text, text, text, date, text) from public, anon;
grant execute on function public.log_walk_in_passenger(text, text, text, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- Fold walk-ins into fleet_manifest_report()'s real-time bus-sizing
-- counts, same pattern as student/guest counts: a new CTE per leg,
-- grouped by route, unioned in via coalesce(). Note this function has
-- no branch for the 4:00 PM return slot at all today (it only ever
-- counted morning and early-return legs) — walk-ins logged against
-- 4:00 PM are still recorded in walk_in_passengers, just not folded in
-- here, consistent with how existing scans/guest_passes 4PM data isn't
-- surfaced here either. That's out of scope for this change.
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
  walk_in_morning as (
    select w.route as r, count(*) as cnt
    from public.walk_in_passengers w
    where w.service_date = v_date and w.kind = 'morning' and w.slot in ('06:00 AM', '08:00 AM')
    group by w.route
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
  walk_in_early_return as (
    select w.route as r, count(*) as cnt
    from public.walk_in_passengers w
    where w.service_date = v_date and w.kind = 'return'
      and w.slot in ('12:30 PM', '01:30 PM', '02:30 PM')
    group by w.route
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
    coalesce(sm.cnt, 0) + coalesce(gm.cnt, 0) + coalesce(wm.cnt, 0),
    coalesce(ser.cnt, 0) + coalesce(ger.cnt, 0) + coalesce(wer.cnt, 0),
    coalesce(oo.cnt, 0),
    greatest(
      coalesce(sm.cnt, 0) + coalesce(gm.cnt, 0) + coalesce(wm.cnt, 0)
        - (coalesce(ser.cnt, 0) + coalesce(ger.cnt, 0) + coalesce(wer.cnt, 0))
        - coalesce(oo.cnt, 0),
      0
    ),
    case
      when greatest(
        coalesce(sm.cnt, 0) + coalesce(gm.cnt, 0) + coalesce(wm.cnt, 0)
          - (coalesce(ser.cnt, 0) + coalesce(ger.cnt, 0) + coalesce(wer.cnt, 0))
          - coalesce(oo.cnt, 0),
        0
      ) <= 33
        then '33-seater'
      else '50-seater'
    end
  from public.routes r
  left join student_morning sm on sm.r = r.name
  left join guest_morning gm on gm.r = r.name
  left join walk_in_morning wm on wm.r = r.name
  left join student_early_return ser on ser.r = r.name
  left join guest_early_return ger on ger.r = r.name
  left join walk_in_early_return wer on wer.r = r.name
  left join opted_out oo on oo.r = r.name
  order by r.display_order;
end;
$$;
