-- Used by migrate-students-to-phone-login. A plain SQL join here
-- avoids two real problems with doing this from the Edge Function's
-- JS client instead: (1) profiles and user_roles have no direct
-- foreign-key relationship to each other (both reference auth.users
-- independently), so PostgREST's embedded-resource shorthand can't
-- resolve it; (2) fetching student IDs first and then querying
-- profiles with .in(studentIds) risks hitting URL-length limits once
-- there are hundreds of students in one filter list.
create or replace function public.list_all_students_for_migration()
returns table (
  user_id uuid,
  full_name text,
  phone text,
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
  select p.id, p.full_name, p.phone, p.username
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student';
end;
$$;

revoke all on function public.list_all_students_for_migration() from public, anon;
grant execute on function public.list_all_students_for_migration() to authenticated;
