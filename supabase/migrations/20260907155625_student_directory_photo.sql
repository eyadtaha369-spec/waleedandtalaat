-- Both directory RPCs were missing photo_url from the start — the
-- admin/supervisor student tables always fell back to the initial
-- avatar since there was never any photo data to pass through.

drop function if exists public.list_all_students(text);
create or replace function public.list_all_students(p_route text default null)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  route text,
  pickup_stop text,
  subscription_type text,
  payment_status text,
  trips_remaining int,
  trips_total int,
  whatsapp_invited_at timestamptz,
  username text,
  photo_url text
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
  select p.id, p.full_name, p.phone, p.route, p.pickup_stop, p.subscription_type,
         p.payment_status, p.trips_remaining, p.trips_total, p.whatsapp_invited_at,
         p.username, p.photo_url
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where p_route is null or p.route = p_route
  order by p.route, p.full_name;
end;
$$;

revoke all on function public.list_all_students(text) from public, anon;
grant execute on function public.list_all_students(text) to authenticated;

drop function if exists public.list_my_route_students();
create or replace function public.list_my_route_students()
returns table (
  user_id uuid,
  full_name text,
  phone text,
  pickup_stop text,
  subscription_type text,
  trips_remaining int,
  trips_total int,
  whatsapp_invited_at timestamptz,
  username text,
  photo_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select assigned_route into v_route from public.profiles where id = auth.uid();
  if v_route is null then
    return;
  end if;

  return query
  select p.id, p.full_name, p.phone, p.pickup_stop, p.subscription_type, p.trips_remaining,
         p.trips_total, p.whatsapp_invited_at, p.username, p.photo_url
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where p.route = v_route
  order by p.full_name;
end;
$$;

revoke all on function public.list_my_route_students() from public, anon;
grant execute on function public.list_my_route_students() to authenticated;
