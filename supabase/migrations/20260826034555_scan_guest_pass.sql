-- Guest daily-pass holders have no profiles row (no auth account), so
-- scan_pass() never found them. This adds a dedicated RPC for scanning
-- a guest pass by its token, mirroring the same booked/scanned-earlier
-- statuses as the student scanner.

create or replace function public.scan_guest_pass(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass record;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select * into v_pass from public.guest_passes where pass_token = p_token;
  if not found then
    return jsonb_build_object('error', 'Pass not found');
  end if;

  if v_pass.is_scanned then
    return jsonb_build_object(
      'status', 'scanned_earlier',
      'full_name', v_pass.full_name,
      'route', v_pass.route,
      'photo_url', null,
      'trips_remaining', null
    );
  end if;

  update public.guest_passes
    set is_scanned = true, scanned_at = now(), scanned_by = auth.uid()
    where pass_token = p_token;

  return jsonb_build_object(
    'status', 'booked',
    'full_name', v_pass.full_name,
    'route', v_pass.route,
    'photo_url', null,
    'trips_remaining', null
  );
end;
$$;

revoke all on function public.scan_guest_pass(uuid) from public, anon;
grant execute on function public.scan_guest_pass(uuid) to authenticated;
