-- خط برج العرب's return-kind bus_schedules rows were seeded with
-- malformed time_slot strings ("1:30", "4:00") that don't match the
-- canonical slot labels used everywhere else in the app (RETURN_SLOTS/
-- ALL_SLOTS in src/lib/schedule.ts: "01:30 PM", "04:00 PM"). This
-- caused two real bugs: the malformed "4:00" rendered as a separate,
-- non-functional duplicate of the real 4:00 PM return flow (since
-- isFourPmReturn matches on the exact string "04:00 PM"), and the
-- malformed "1:30" bypassed enforce_booking_window()'s explicit block
-- on '01:30 PM' for this route (see that trigger's own comment).
--
-- No collision with an existing correctly-named row was found before
-- this rename (checked via a read-only query), so this is a plain
-- rename, not a merge.
update public.bus_schedules
set time_slot = '01:30 PM'
where route_name = 'خط برج العرب' and kind = 'return' and time_slot = '1:30';

update public.bus_schedules
set time_slot = '04:00 PM'
where route_name = 'خط برج العرب' and kind = 'return' and time_slot = '4:00';
