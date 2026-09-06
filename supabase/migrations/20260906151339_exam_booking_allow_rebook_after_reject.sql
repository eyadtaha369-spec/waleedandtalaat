-- =====================================================================
-- Exam bookings: rejected requests should never block re-submission
-- =====================================================================

-- The old constraint blocked (phone, exam_date) unconditionally,
-- including against a rejected row. Replace it with a partial unique
-- index that only applies to non-rejected bookings, so a student can
-- freely resubmit after a rejection while still being blocked from
-- duplicating an active (pending/confirmed) request.
alter table public.exam_bookings drop constraint if exists exam_bookings_phone_exam_date_key;

create unique index if not exists exam_bookings_active_phone_exam_date_key
  on public.exam_bookings (phone, exam_date)
  where status <> 'rejected';

-- The pre-submit check RPC must match: only an active (non-rejected)
-- booking counts as a duplicate.
create or replace function public.check_exam_duplicate(p_phone text, p_exam_date date)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.exam_bookings
    where phone = p_phone and exam_date = p_exam_date and status <> 'rejected'
  );
$$;
