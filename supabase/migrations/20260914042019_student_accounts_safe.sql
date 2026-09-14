-- =====================================================================
-- Safe first-login forced password change + Student Accounts page
-- =====================================================================
-- Deliberately does NOT store any actual password value anywhere —
-- only a boolean flag tracking whether this student still needs to
-- change their default password. See the accompanying explanation in
-- chat for why a "current_password" column was not implemented.

alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- Student marks their own flag false once they've genuinely changed
-- their password via supabase.auth.updateUser(). Self-service only —
-- a student can only ever clear their OWN flag, never anyone else's.
create or replace function public.mark_password_changed()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

revoke all on function public.mark_password_changed() from public, anon;
grant execute on function public.mark_password_changed() to authenticated;

-- Admin sees any/all routes with a filter; supervisor is locked to
-- their own assigned_route — same pattern as every other route-scoped
-- directory RPC in this app.
create or replace function public.list_route_student_accounts(p_route text default null)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  route text,
  photo_url text,
  must_change_password boolean
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

  if public.is_admin(auth.uid()) then
    v_route := p_route;
  else
    select assigned_route into v_route from public.profiles where id = auth.uid();
    if v_route is null then
      return;
    end if;
  end if;

  return query
  select p.id, p.full_name, p.phone, p.route, p.photo_url, p.must_change_password
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where v_route is null or p.route = v_route
  order by p.route, p.full_name;
end;
$$;

revoke all on function public.list_route_student_accounts(text) from public, anon;
grant execute on function public.list_route_student_accounts(text) to authenticated;

-- Sets the must_change_password flag back to true after an admin or
-- supervisor resets a student's password back to the shared default
-- (the actual password reset itself still goes through the Auth
-- Admin API in the manage-staff Edge Function — this RPC only flips
-- the flag). Supervisor is restricted to their own route's students.
create or replace function public.flag_password_reset(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_route text;
  v_student_route text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  if not public.is_admin(auth.uid()) then
    select assigned_route into v_caller_route from public.profiles where id = auth.uid();
    select route into v_student_route from public.profiles where id = p_student_id;
    if v_caller_route is null or v_student_route is distinct from v_caller_route then
      raise exception 'You can only reset students on your own route' using errcode = '42501';
    end if;
  end if;

  update public.profiles set must_change_password = true where id = p_student_id;
end;
$$;

revoke all on function public.flag_password_reset(uuid) from public, anon;
grant execute on function public.flag_password_reset(uuid) to authenticated;
