-- One-off cleanup: student rows on خط البحر were marked invited even
-- when the wa.me popup never actually opened (see fix below for the
-- root cause). Reset them back to not-invited.
update public.profiles set whatsapp_invited_at = null where route = 'خط البحر';

-- Manual per-student reset. Same permission shape as
-- mark_whatsapp_invited(): admin can reset anyone, a supervisor only
-- their own assigned_route's students.
create or replace function public.reset_whatsapp_invited(p_student_ids uuid[])
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
    update public.profiles set whatsapp_invited_at = null where id = any(p_student_ids);
  else
    update public.profiles p
      set whatsapp_invited_at = null
      where p.id = any(p_student_ids)
        and p.route = (select assigned_route from public.profiles where id = auth.uid());
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.reset_whatsapp_invited(uuid[]) from public, anon;
grant execute on function public.reset_whatsapp_invited(uuid[]) to authenticated;

-- Bulk per-route reset, for retrying a broadcast. An admin may pass
-- any route; a supervisor's own assigned_route is always enforced
-- regardless of what's passed.
create or replace function public.reset_route_whatsapp_status(p_route text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route text;
  v_count int;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  if public.is_admin(auth.uid()) then
    v_route := p_route;
  else
    select assigned_route into v_route from public.profiles where id = auth.uid();
  end if;

  if v_route is null then
    return 0;
  end if;

  update public.profiles p
    set whatsapp_invited_at = null
    from public.user_roles r
    where r.user_id = p.id and r.role = 'student' and p.route = v_route;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.reset_route_whatsapp_status(text) from public, anon;
grant execute on function public.reset_route_whatsapp_status(text) to authenticated;
