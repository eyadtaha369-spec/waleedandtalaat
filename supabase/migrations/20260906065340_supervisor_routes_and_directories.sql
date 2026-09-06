-- =====================================================================
-- Supervisor route assignment + student directories + daily-pass table
-- =====================================================================

alter table public.profiles add column if not exists assigned_route text;

-- update_staff_user now also sets assigned_route (only meaningful for
-- supervisors, but harmless to store on an admin row too — the UI
-- only shows/requires the field for the supervisor role).
create or replace function public.update_staff_user(
  p_user_id uuid, p_full_name text, p_phone text, p_role text, p_assigned_route text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'supervisor') then
    raise exception 'Invalid role';
  end if;

  update public.profiles
    set full_name = p_full_name, phone = p_phone,
        assigned_route = case when p_role = 'supervisor' then p_assigned_route else null end
    where id = p_user_id;

  delete from public.user_roles where user_id = p_user_id and role in ('admin', 'supervisor');
  insert into public.user_roles (user_id, role) values (p_user_id, p_role::app_role)
  on conflict do nothing;

  return jsonb_build_object('user_id', p_user_id, 'full_name', p_full_name, 'phone', p_phone, 'role', p_role);
end;
$$;

revoke all on function public.update_staff_user(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_staff_user(uuid, text, text, text, text) to authenticated;

-- list_staff_users now also returns assigned_route.
create or replace function public.list_staff_users()
returns table (
  user_id uuid,
  full_name text,
  phone text,
  email text,
  role text,
  is_active boolean,
  assigned_route text
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
  select
    u.user_id,
    coalesce(p.full_name, ''),
    p.phone,
    au.email::text,
    u.role::text,
    (au.banned_until is null or au.banned_until < now()),
    p.assigned_route
  from public.user_roles u
  join auth.users au on au.id = u.user_id
  left join public.profiles p on p.id = u.user_id
  where u.role in ('admin', 'supervisor')
  order by u.role, coalesce(p.full_name, '');
end;
$$;

revoke all on function public.list_staff_users() from public, anon;
grant execute on function public.list_staff_users() to authenticated;

-- ---------------------------------------------------------------------
-- Supervisor student directory: strictly the supervisor's own
-- assigned_route. No parameter — always reads the caller's own
-- profile, so a supervisor can never query another route.
-- ---------------------------------------------------------------------
create or replace function public.list_my_route_students()
returns table (
  user_id uuid,
  full_name text,
  phone text,
  pickup_stop text,
  subscription_type text,
  trips_remaining int,
  trips_total int
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
  select p.id, p.full_name, p.phone, p.pickup_stop, p.subscription_type, p.trips_remaining, p.trips_total
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where p.route = v_route
  order by p.full_name;
end;
$$;

revoke all on function public.list_my_route_students() from public, anon;
grant execute on function public.list_my_route_students() to authenticated;

-- ---------------------------------------------------------------------
-- Admin master student directory, optionally filtered by route.
-- ---------------------------------------------------------------------
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
  select p.id, p.full_name, p.phone, p.route, p.pickup_stop, p.subscription_type,
         p.payment_status, p.trips_remaining, p.trips_total
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where p_route is null or p.route = p_route
  order by p.route, p.full_name;
end;
$$;

revoke all on function public.list_all_students(text) from public, anon;
grant execute on function public.list_all_students(text) to authenticated;

-- ---------------------------------------------------------------------
-- Admin daily-pass tracking table: every guest pass ever issued
-- (i.e. every approved daily-pass request, one row per leg), with
-- payment method and who scanned it (if anyone yet).
-- ---------------------------------------------------------------------
create or replace function public.list_confirmed_daily_passes()
returns table (
  full_name text,
  phone text,
  route text,
  pickup_stop text,
  slot text,
  kind text,
  payment_method text,
  is_scanned boolean,
  scanned_at timestamptz,
  scanned_by_name text,
  created_at timestamptz
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
  select
    gp.full_name, gp.phone, gp.route, gp.pickup_stop, gp.slot, gp.kind,
    dpr.payment_method, gp.is_scanned, gp.scanned_at,
    sp.full_name as scanned_by_name,
    gp.created_at
  from public.guest_passes gp
  join public.daily_pass_requests dpr on dpr.id = gp.request_id
  left join public.profiles sp on sp.id = gp.scanned_by
  order by gp.created_at desc;
end;
$$;

revoke all on function public.list_confirmed_daily_passes() from public, anon;
grant execute on function public.list_confirmed_daily_passes() to authenticated;
