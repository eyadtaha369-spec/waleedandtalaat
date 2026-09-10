-- One-off correction: reset every 70_trips student's balance to
-- exactly 70/70, regardless of current value (fixes the 70/140,
-- 57/140, 0/70 cases reported directly). Logged per-student to
-- trip_transactions for the audit trail — created_by is null since
-- this is a bulk system correction, not a single staff action.
with reset as (
  update public.profiles
    set trips_remaining = 70, trips_total = 70
    where subscription_type = '70_trips'
      and (trips_remaining <> 70 or trips_total <> 70)
    returning id, trips_remaining
)
insert into public.trip_transactions (student_id, amount, description, created_by)
select id, 0, 'إعادة تعيين جماعي إلى 70/70', null
from reset;
