-- =====================================================================
-- Trip transaction log, admin-testable 4:15 PM cron, manual balance reset
-- =====================================================================

create table if not exists public.trip_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null,
  description text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.trip_transactions enable row level security;
create policy "admins read trip transactions" on public.trip_transactions
  for select to authenticated using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 4:00 PM no-show deduction, now returning a summary instead of void so
-- it can be both the real cron job AND an admin-triggered test run.
-- Guard: the real cron job runs with no JWT (auth.uid() is null), so
-- it always passes; an authenticated caller must be an admin.
-- ---------------------------------------------------------------------
create or replace function public.apply_4pm_noshow_deduction(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := coalesce(p_date, (now() at time zone 'Africa/Cairo')::date);
  v_result jsonb;
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  with affected as (
    select p.id, p.full_name
    from public.profiles p
    where p.subscription_type = '70_trips'
      and exists (
        select 1 from public.scans s
        where s.student_id = p.id and s.service_date = v_today
          and s.slot in ('06:00 AM', '08:00 AM')
      )
      and not exists (
        select 1 from public.scans s
        where s.student_id = p.id and s.service_date = v_today
          and s.slot in ('12:30 PM', '01:30 PM', '02:30 PM')
      )
      and not exists (
        select 1 from public.opt_outs o
        where o.student_id = p.id and o.service_date = v_today
      )
      and not exists (
        select 1 from public.scans s
        where s.student_id = p.id and s.service_date = v_today and s.slot = '04:00 PM'
      )
  ),
  updated as (
    update public.profiles p
      set trips_remaining = greatest(trips_remaining - 1, 0)
      from affected a
      where p.id = a.id
      returning p.id, p.full_name, p.trips_remaining
  ),
  logged as (
    insert into public.trip_transactions (student_id, amount, description, created_by)
    select id, -1, 'Automated 4:00 PM Return Trip Deduction', auth.uid()
    from updated
    returning student_id
  ),
  marked as (
    insert into public.scans (student_id, scanned_by, service_date, slot)
    select id, null, v_today, '04:00 PM' from updated
    on conflict (student_id, service_date, slot) do nothing
    returning student_id
  )
  select jsonb_build_object(
    'deducted_students_count', count(*),
    'updated_balances',
    coalesce(
      jsonb_agg(jsonb_build_object('student_id', id, 'full_name', full_name, 'trips_remaining', trips_remaining)),
      '[]'::jsonb
    )
  )
  into v_result
  from updated;

  return v_result;
end;
$$;

revoke all on function public.apply_4pm_noshow_deduction(date) from public, anon;
grant execute on function public.apply_4pm_noshow_deduction(date) to authenticated;

-- Point the existing cron job at the new function (same schedule,
-- 14:15 UTC = 16:15 Cairo). cron.schedule upserts by job name.
select cron.schedule(
  'auto-deduct-4pm-noshow',
  '15 14 * * *',
  $$select public.apply_4pm_noshow_deduction();$$
);

drop function if exists public.auto_deduct_noshow_return();

-- ---------------------------------------------------------------------
-- Manual trip-balance adjustment (admin-only), with an audit log entry.
-- ---------------------------------------------------------------------
create or replace function public.reset_student_trips(p_student_id uuid, p_remaining_trips int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old int;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_remaining_trips < 0 then
    raise exception 'Remaining trips cannot be negative';
  end if;

  select trips_remaining into v_old from public.profiles where id = p_student_id;
  if not found then
    return jsonb_build_object('error', 'Student not found');
  end if;

  update public.profiles set trips_remaining = p_remaining_trips where id = p_student_id;

  insert into public.trip_transactions (student_id, amount, description, created_by)
  values (p_student_id, p_remaining_trips - v_old, 'Manual balance reset by Admin', auth.uid());

  return jsonb_build_object('student_id', p_student_id, 'trips_remaining', p_remaining_trips);
end;
$$;

revoke all on function public.reset_student_trips(uuid, int) from public, anon;
grant execute on function public.reset_student_trips(uuid, int) to authenticated;

-- Lists 70-trip package students for the balance-adjustment UI.
create or replace function public.list_package_students()
returns table (
  user_id uuid,
  full_name text,
  phone text,
  route text,
  trips_remaining int,
  trips_total int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.phone, p.route, p.trips_remaining, p.trips_total
  from public.profiles p
  where p.subscription_type = '70_trips'
  order by p.full_name;
end;
$$;

revoke all on function public.list_package_students() from public, anon;
grant execute on function public.list_package_students() to authenticated;
