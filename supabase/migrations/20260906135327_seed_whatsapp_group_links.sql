-- Seed WhatsApp group invite links per route. Route names below are
-- corrected to match what's actually seeded in public.routes (see
-- 20260828004731_routes_rbac_fleet.sql) — several of the names given
-- in the request differ slightly (missing 'خط' prefix, shortened
-- wording) from the real route names, so a naive UPDATE ... WHERE
-- name = '<given name>' would have silently matched zero rows for
-- 5 of the 8 routes.
update public.routes set whatsapp_group_link = 'https://chat.whatsapp.com/CM4wjQupmjKJ7Fbpmx2fBf?s=cl&p=i&mlu=4&ilr=4' where name = 'خط برج العرب';
update public.routes set whatsapp_group_link = 'https://chat.whatsapp.com/BUXy67Myc6RFCzmo9NNnnD?s=cl&p=i&mlu=4&ilr=4' where name = 'خط كفر الدوار';
update public.routes set whatsapp_group_link = 'https://chat.whatsapp.com/ISHew0P8trV78lPlYHTI1X?s=cl&p=i&mlu=4&ilr=4' where name = 'خط العجمي';
update public.routes set whatsapp_group_link = 'https://chat.whatsapp.com/God2uN5rZrFJrbTvRoxu0T?s=cl&p=i&mlu=4&ilr=4' where name = 'خط المعمورة ومحمودية';
update public.routes set whatsapp_group_link = 'https://chat.whatsapp.com/HeWvjSgw42BFNmGuTKU6j7?s=cl&p=i&mlu=4&ilr=4' where name = 'خط السيوف';
update public.routes set whatsapp_group_link = 'https://chat.whatsapp.com/Ho8sQ5ov9086XkKgAz0Yal?s=cl&p=i&mlu=4&ilr=4' where name = 'خط شارع أبو قير';
update public.routes set whatsapp_group_link = 'https://chat.whatsapp.com/E2uD52jJOtmDXDK6EB1Gi4?s=cl&p=i&mlu=4&ilr=4' where name = 'خط جمال عبدالناصر';
update public.routes set whatsapp_group_link = 'https://chat.whatsapp.com/LnOT0aSj6XX0yxMqmNioUi?s=cl&p=i&mlu=4&ilr=4' where name = 'خط البحر';

-- Both student-directory RPCs now also return whatsapp_invited_at, so
-- /admin/students and /supervisor/students can show invite status and
-- power the new group-invite buttons without a second round trip per
-- row. Must drop first: adding a column changes the return type.
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
  whatsapp_invited_at timestamptz
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
         p.trips_total, p.whatsapp_invited_at
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where p.route = v_route
  order by p.full_name;
end;
$$;

revoke all on function public.list_my_route_students() from public, anon;
grant execute on function public.list_my_route_students() to authenticated;

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
  whatsapp_invited_at timestamptz
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
         p.payment_status, p.trips_remaining, p.trips_total, p.whatsapp_invited_at
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where p_route is null or p.route = p_route
  order by p.route, p.full_name;
end;
$$;

revoke all on function public.list_all_students(text) from public, anon;
grant execute on function public.list_all_students(text) to authenticated;
