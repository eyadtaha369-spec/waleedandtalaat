-- =====================================================================
-- One-time correction: midnight-rollover booking dates
-- =====================================================================
-- Students who re-booked their bus tickets in the early hours of
-- Sunday 2026-09-20 (Africa/Cairo) got a booking dated Monday
-- 2026-09-21 instead of Sunday 2026-09-20, for the same reason
-- scan_pass() was rejecting them: "tomorrow" was computed from a
-- clock that had already rolled over past midnight.
--
-- Guarded by `service_date = '2026-09-21'` so this is safe to re-run —
-- once a row is corrected to '2026-09-20' it no longer matches and a
-- second run is a no-op.
update public.bookings
set service_date = '2026-09-20'
where service_date = '2026-09-21'
  and (created_at at time zone 'Africa/Cairo') >= timestamp '2026-09-20 00:00:00'
  and (created_at at time zone 'Africa/Cairo') <  timestamp '2026-09-20 05:00:00';
