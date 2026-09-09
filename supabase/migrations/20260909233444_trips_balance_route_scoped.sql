-- =====================================================================
-- 70-Trips balance management for supervisors & admins
-- =====================================================================
-- Kept separate from the existing admin-only reset_student_trips()/
-- list_package_students() (used by /admin/manifests' Trip Balances
-- tab, which sets an absolute new value) — this is a different
-- workflow: route-scoped for supervisors, and delta-based (+/-)
-- rather than "type a new total".

create or replace function public.list_route_package_students(p_route text default null)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  route text,
  pickup_stop text,
  photo_url text,
  trips_remaining int,
  trips_total int
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
  select p.id, p.full_name, p.phone, p.route, p.pickup_stop, p.photo_url,
         p.trips_remaining, p.trips_total
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student'
  where p.subscription_type = '70_trips' and (v_route is null or p.route = v_route)
  order by p.route, p.full_name;
end;
$$;

revoke all on function public.list_route_package_students(text) from public, anon;
grant execute on function public.list_route_package_students(text) to authenticated;

-- Delta-based adjustment (+N or -N), not an absolute set. A positive
-- delta (top-up/refund) also grows trips_total by the same amount,
-- so "remaining/total" stays meaningful instead of remaining ever
-- exceeding a total that never changed. A negative delta only ever
-- reduces trips_remaining (floored at 0) — it doesn't shrink the
-- student's overall plan size.
create or replace function public.adjust_student_trips(
  p_student_id uuid, p_delta int, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_route text;
  v_student_route text;
  v_new_remaining int;
  v_new_total int;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  if not public.is_admin(auth.uid()) then
    select assigned_route into v_caller_route from public.profiles where id = auth.uid();
    select route into v_student_route from public.profiles where id = p_student_id;
    if v_caller_route is null or v_student_route is distinct from v_caller_route then
      raise exception 'You can only adjust students on your own route' using errcode = '42501';
    end if;
  end if;

  update public.profiles
    set trips_remaining = greatest(trips_remaining + p_delta, 0),
        trips_total = case when p_delta > 0 then trips_total + p_delta else trips_total end
    where id = p_student_id
    returning trips_remaining, trips_total into v_new_remaining, v_new_total;

  if not found then
    return jsonb_build_object('error', 'Student not found');
  end if;

  insert into public.trip_transactions (student_id, amount, description, created_by)
  values (
    p_student_id,
    p_delta,
    coalesce(p_reason, case when p_delta < 0 then 'خصم رحلة يدوي' else 'إضافة رحلات يدوية' end),
    auth.uid()
  );

  return jsonb_build_object(
    'student_id', p_student_id,
    'trips_remaining', v_new_remaining,
    'trips_total', v_new_total
  );
end;
$$;

revoke all on function public.adjust_student_trips(uuid, int, text) from public, anon;
grant execute on function public.adjust_student_trips(uuid, int, text) to authenticated;
