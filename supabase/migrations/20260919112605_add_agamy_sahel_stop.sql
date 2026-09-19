-- "خط العجمي" in this request maps to our canonical route name
-- 'خط العجمي والساحل' (merged with the route formerly called الساحل
-- in an earlier session). This adds "الساحل" as a STOP within that
-- route — an unrelated, specific pickup location, not to be confused
-- with the earlier route-level merge.
-- Appended at the end (no position specified). ON CONFLICT DO NOTHING
-- makes this safe to re-run.

insert into public.stops (route_id, name, display_order)
select
  r.id,
  'الساحل',
  coalesce((select max(s.display_order) from public.stops s where s.route_id = r.id), 0) + 1
from public.routes r
where r.name = 'خط العجمي والساحل'
on conflict (route_id, name) do nothing;
