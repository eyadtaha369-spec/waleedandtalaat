-- =====================================================================
-- Waleed & Talaat — Admin & Supervisor user management
-- =====================================================================

-- List every account holding admin or supervisor. Reads auth.users for
-- email + ban status; this is a common, supported pattern for
-- SECURITY DEFINER functions owned by the migration role in Supabase.
create or replace function public.list_staff_users()
returns table (
  user_id uuid,
  full_name text,
  phone text,
  email text,
  role text,
  is_active boolean
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
    u.id,
    coalesce(p.full_name, ''),
    p.phone,
    au.email::text,
    u.role::text,
    (au.banned_until is null or au.banned_until < now())
  from public.user_roles u
  join auth.users au on au.id = u.user_id
  left join public.profiles p on p.id = u.user_id
  where u.role in ('admin', 'supervisor')
  order by u.role, coalesce(p.full_name, '');
end;
$$;

revoke all on function public.list_staff_users() from public, anon;
grant execute on function public.list_staff_users() to authenticated;

-- Edit an existing staff member's name, phone, and role (email and
-- password changes go through the manage-staff Edge Function, which
-- has the Auth Admin API).
create or replace function public.update_staff_user(p_user_id uuid, p_full_name text, p_phone text, p_role text)
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

  update public.profiles set full_name = p_full_name, phone = p_phone where id = p_user_id;

  delete from public.user_roles where user_id = p_user_id and role in ('admin', 'supervisor');
  insert into public.user_roles (user_id, role) values (p_user_id, p_role::app_role)
  on conflict do nothing;

  return jsonb_build_object('user_id', p_user_id, 'full_name', p_full_name, 'phone', p_phone, 'role', p_role);
end;
$$;

revoke all on function public.update_staff_user(uuid, text, text, text) from public, anon;
grant execute on function public.update_staff_user(uuid, text, text, text) to authenticated;
