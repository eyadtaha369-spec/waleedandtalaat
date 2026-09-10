-- Change from the previous design (a positive delta also grew
-- trips_total, meant as a 'renewal adds a fresh block') to a simpler
-- one: manually adding trips only tops up trips_remaining, capped at
-- trips_total, and never touches trips_total at all. This is what
-- caused the 70/140-style totals reported directly — a manual "+70"
-- was silently granting what looked like a second full package.
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
    set trips_remaining = least(greatest(trips_remaining + p_delta, 0), trips_total)
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
