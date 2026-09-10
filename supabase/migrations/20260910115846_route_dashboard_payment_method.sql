-- Adds payment_method to get_route_stop_breakdown()'s return, so the
-- Route Dashboard can show it for daily-pass guests. Null for regular
-- subscriber rows (they don't have a per-trip payment method — their
-- subscription's payment_status is already shown via the existing
-- subscription badge).
drop function if exists public.get_route_stop_breakdown(text, date);
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
  source text,
  payment_method text
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
         p.subscription_type, p.payment_status, 'subscriber'::text, null::text
  from public.bookings b
  join public.profiles p on p.id = b.student_id
  where b.kind = 'morning' and b.service_date = v_date
    and (v_route is null or b.route = v_route)
    and b.pickup_stop is not null

  union all

  select dpr.route, dpr.pickup_stop, null::uuid, dpr.full_name, dpr.phone, null,
         'daily_pass'::text, 'paid_full'::text, 'daily_pass'::text, dpr.payment_method
  from public.daily_pass_requests dpr
  where dpr.status = 'approved' and dpr.service_date = v_date
    and (v_route is null or dpr.route = v_route)
    and dpr.pickup_stop is not null

  order by 1, 2, 4;
end;
$$;

revoke all on function public.get_route_stop_breakdown(text, date) from public, anon;
grant execute on function public.get_route_stop_breakdown(text, date) to authenticated;
