-- =====================================================================
-- Route-based stop breakdown dashboard
-- =====================================================================
-- Scope note: this combines subscribed-student morning bookings with
-- approved daily-pass guests on the SAME route/stop system. Exam-day
-- bookings are deliberately excluded — they use a completely separate,
-- fixed 27-stop list unrelated to any of the 9 regular routes, so they
-- don't fit this route-based breakdown at all (they already have
-- their own dedicated view at /admin/summer-bookings).
--
-- "Confirmed for the upcoming trip" = booked (not just assigned) for
-- the given service_date, matching the same morning booking window
-- (opens 12PM, closes 7PM the day before) already used everywhere
-- else in this app.

create or replace function public.get_route_stop_breakdown(
  p_route text default null,
  p_service_date date default null
)
returns table (
  route text,
  pickup_stop text,
  student_id uuid,
  full_name text,
  phone text,
  photo_url text,
  subscription_type text,
  payment_status text,
  source text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route text;
  v_date date;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  if public.is_admin(auth.uid()) then
    v_route := p_route;
  else
    select assigned_route into v_route from public.profiles where id = auth.uid();
    if v_route is null then
      return;
    end if;
  end if;

  v_date := coalesce(p_service_date, (now() at time zone 'Africa/Cairo')::date);

  return query
  select p.route, b.pickup_stop, p.id, p.full_name, p.phone, p.photo_url,
         p.subscription_type, p.payment_status, 'subscriber'::text
  from public.bookings b
  join public.profiles p on p.id = b.student_id
  where b.kind = 'morning' and b.service_date = v_date
    and (v_route is null or b.route = v_route)
    and b.pickup_stop is not null

  union all

  select dpr.route, dpr.pickup_stop, null::uuid, dpr.full_name, dpr.phone, null,
         'daily_pass'::text, 'paid_full'::text, 'daily_pass'::text
  from public.daily_pass_requests dpr
  where dpr.status = 'approved' and dpr.service_date = v_date
    and (v_route is null or dpr.route = v_route)
    and dpr.pickup_stop is not null

  order by 1, 2, 4;
end;
$$;

revoke all on function public.get_route_stop_breakdown(text, date) from public, anon;
grant execute on function public.get_route_stop_breakdown(text, date) to authenticated;
