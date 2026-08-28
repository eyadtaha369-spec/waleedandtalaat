-- Defense in depth: list_students_for_credentials() previously
-- matched anyone with a 'student' role row, which could include an
-- admin/supervisor account that still had a leftover 'student' role
-- from before they were promoted (this happened to the first admin
-- account, whose password got swept up in a bulk student reset).
-- Now explicitly excludes anyone who also holds admin or supervisor.
create or replace function public.list_students_for_credentials()
returns table (
  user_id uuid,
  full_name text,
  phone text,
  username text,
  email text
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
  select p.id, p.full_name, p.phone, p.username, au.email::text
  from public.profiles p
  join auth.users au on au.id = p.id
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where not exists (
    select 1 from public.user_roles r2
    where r2.user_id = p.id and r2.role in ('admin', 'supervisor')
  )
  order by p.full_name;
end;
$$;
