-- Lists every student account (name, phone, username, login email) so
-- an admin can recover/regenerate credentials for accounts that were
-- already created before their login details were ever successfully
-- sent out (the original temp password is only shown once and can't
-- be recovered — it's hashed in auth.users).
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
  order by p.full_name;
end;
$$;

revoke all on function public.list_students_for_credentials() from public, anon;
grant execute on function public.list_students_for_credentials() to authenticated;
