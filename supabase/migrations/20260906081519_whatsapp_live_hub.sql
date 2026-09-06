-- =====================================================================
-- WhatsApp Live Group Hub
-- =====================================================================

alter table public.routes add column if not exists whatsapp_group_link text;
alter table public.profiles add column if not exists whatsapp_invited_at timestamptz;

-- Admin-only: attach/update a route's WhatsApp group invite link.
create or replace function public.set_route_whatsapp_link(p_route text, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.routes set whatsapp_group_link = nullif(trim(p_link), '') where name = p_route;
  if not found then
    raise exception 'Route not found';
  end if;
end;
$$;

revoke all on function public.set_route_whatsapp_link(text, text) from public, anon;
grant execute on function public.set_route_whatsapp_link(text, text) to authenticated;

-- Staff-only: routes with their group link, for the dropdown/editor.
-- Every route regardless of link status (so admins can see which
-- routes still need one attached).
create or replace function public.list_routes_with_whatsapp_links()
returns table (route text, whatsapp_group_link text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  return query
  select r.name, r.whatsapp_group_link
  from public.routes r
  order by r.display_order;
end;
$$;

revoke all on function public.list_routes_with_whatsapp_links() from public, anon;
grant execute on function public.list_routes_with_whatsapp_links() to authenticated;

-- Student list for the hub. Admins may pass any route or null for
-- all routes; a non-admin's own assigned_route is always enforced
-- server-side regardless of what's passed, so a supervisor can never
-- see another route's students.
create or replace function public.list_route_students_for_whatsapp(p_route text default null)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  route text,
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

  if public.is_admin(auth.uid()) then
    v_route := p_route;
  else
    select assigned_route into v_route from public.profiles where id = auth.uid();
    if v_route is null then
      return;
    end if;
  end if;

  return query
  select p.id, p.full_name, p.phone, p.route, p.whatsapp_invited_at
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where v_route is null or p.route = v_route
  order by p.route, p.full_name;
end;
$$;

revoke all on function public.list_route_students_for_whatsapp(text) from public, anon;
grant execute on function public.list_route_students_for_whatsapp(text) to authenticated;

-- Marks one or more students as invited. A supervisor may only mark
-- students on their own assigned_route; an admin may mark anyone.
create or replace function public.mark_whatsapp_invited(p_student_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  if public.is_admin(auth.uid()) then
    update public.profiles set whatsapp_invited_at = now() where id = any(p_student_ids);
  else
    update public.profiles p
      set whatsapp_invited_at = now()
      where p.id = any(p_student_ids)
        and p.route = (select assigned_route from public.profiles where id = auth.uid());
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_whatsapp_invited(uuid[]) from public, anon;
grant execute on function public.mark_whatsapp_invited(uuid[]) to authenticated;
