-- Bug fix: list_staff_users() was selecting u.id (the user_roles
-- table's own row id) instead of u.user_id (the actual auth account
-- id). Every edit/reset-password/deactivate action was then operating
-- on a nonexistent id, failing with FK violations or a 403/400 from
-- the manage-staff Edge Function.
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
    u.user_id,
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
