-- =====================================================================
-- Student directory: honest creation-source indicator
-- =====================================================================
-- Note on "creation source": this app has exactly two real paths that
-- create a student profile — bulk Excel/CSV import, or the student
-- signing themselves up via /auth. There is no Google Sheets webhook
-- integration anywhere in this system. The two paths are already
-- distinguishable from existing data with no new column needed:
-- bulk import always sets `username` (studentNNNN pattern); self
-- sign-up never does. list_all_students()/list_my_route_students()
-- below just expose that existing field so the UI can derive it.

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
  username text
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
         p.username
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
  username text
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
         p.trips_total, p.whatsapp_invited_at, p.username
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where p.route = v_route
  order by p.full_name;
end;
$$;

revoke all on function public.list_my_route_students() from public, anon;
grant execute on function public.list_my_route_students() to authenticated;
