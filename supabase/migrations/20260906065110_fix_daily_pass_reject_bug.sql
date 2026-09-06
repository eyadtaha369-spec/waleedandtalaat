-- Fix: v_morning_pass/v_return_pass were declared as `record`, which
-- has no structure at all until assigned a row. On rejection, the
-- 'if p_action = approved' block never ran, so the final
-- jsonb_build_object's reference to v_morning_pass.pass_token raised
-- "record v_morning_pass is not assigned yet". Scalar uuid variables
-- don't have this problem — they're simply NULL until set.
create or replace function public.decide_daily_pass_request(p_request_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_morning_pass_token uuid;
  v_return_pass_token uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_action not in ('approved', 'rejected') then
    raise exception 'Invalid action';
  end if;

  select * into v_request from public.daily_pass_requests where id = p_request_id and status = 'pending';
  if not found then
    return jsonb_build_object('error', 'Request not found or already decided');
  end if;

  update public.daily_pass_requests set status = p_action where id = p_request_id;

  if p_action = 'approved' then
    insert into public.guest_passes (request_id, full_name, phone, route, pickup_stop, slot, service_date, kind)
    values (v_request.id, v_request.full_name, v_request.phone, v_request.route, v_request.pickup_stop, v_request.slot, v_request.service_date, 'morning')
    returning pass_token into v_morning_pass_token;

    if v_request.trip_type = 'round_trip' and v_request.return_slot is not null then
      insert into public.guest_passes (request_id, full_name, phone, route, pickup_stop, slot, service_date, kind)
      values (v_request.id, v_request.full_name, v_request.phone, v_request.route, v_request.return_pickup_stop, v_request.return_slot, v_request.service_date, 'return')
      returning pass_token into v_return_pass_token;
    end if;
  end if;

  return jsonb_build_object(
    'action', p_action,
    'full_name', v_request.full_name,
    'phone', v_request.phone,
    'route', v_request.route,
    'trip_type', v_request.trip_type,
    'morning_slot', v_request.slot,
    'morning_pass_token', v_morning_pass_token,
    'return_slot', v_request.return_slot,
    'return_pass_token', v_return_pass_token
  );
end;
$$;
