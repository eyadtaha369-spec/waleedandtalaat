-- Rename the stop everywhere it's already stored, so past bookings
-- and admin filters stay consistent with the new dropdown option.
update public.exam_bookings
  set pickup_stop = 'صنية الجهاز امام مكتبة شادي'
  where pickup_stop = 'فتحة البرج على الساحل';

-- Today's scanned exam-pass count (Cairo calendar day). Staff-only,
-- used by both /admin/summer-bookings and /admin/scan so the number
-- stays in sync everywhere without duplicating the query.
create or replace function public.count_today_scanned_exam_passes()
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  return (
    select count(*)::int
    from public.exam_bookings
    where is_scanned = true
      and (scanned_at at time zone 'Africa/Cairo')::date = (now() at time zone 'Africa/Cairo')::date
  );
end;
$$;

revoke all on function public.count_today_scanned_exam_passes() from public, anon;
grant execute on function public.count_today_scanned_exam_passes() to authenticated;
