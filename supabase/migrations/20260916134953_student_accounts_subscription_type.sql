drop function if exists public.list_route_student_accounts(text);
create or replace function public.list_route_student_accounts(p_route text default null)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  route text,
  photo_url text,
  must_change_password boolean,
  subscription_type text
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
  select p.id, p.full_name, p.phone, p.route, p.photo_url, p.must_change_password, p.subscription_type
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where v_route is null or p.route = v_route
  order by p.route, p.full_name;
end;
$$;

revoke all on function public.list_route_student_accounts(text) from public, anon;
grant execute on function public.list_route_student_accounts(text) to authenticated;
