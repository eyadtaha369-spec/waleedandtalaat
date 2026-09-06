-- =====================================================================
-- Exam bookings: prevent duplicate submissions (same phone + same date)
-- =====================================================================

-- Defense in depth against a race condition (two submits at once):
-- a hard DB constraint, in addition to the pre-submit check below.
alter table public.exam_bookings
  add constraint exam_bookings_phone_exam_date_key unique (phone, exam_date);

-- Guests can't SELECT exam_bookings (RLS is insert-only for anon), so
-- the pre-submit duplicate check needs a narrow, safe RPC that reveals
-- nothing except whether a match exists.
create or replace function public.check_exam_duplicate(p_phone text, p_exam_date date)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.exam_bookings
    where phone = p_phone and exam_date = p_exam_date
  );
$$;
revoke all on function public.check_exam_duplicate(text, date) from public;
grant execute on function public.check_exam_duplicate(text, date) to anon, authenticated;
