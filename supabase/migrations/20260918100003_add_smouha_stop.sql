-- Adds a new stop to خط سموحة, appended after its existing stops.
-- ON CONFLICT DO NOTHING makes this safe to re-run. No frontend
-- changes needed — useRoutes() fetches stops directly from this
-- table with no caching, so the booking dropdown, admin manifest
-- filters, and schedule views all pick this up automatically.

insert into public.stops (route_id, name, display_order)
select
  r.id,
  'قباني عند كوبري الإبراهيمية',
  coalesce((select max(s.display_order) from public.stops s where s.route_id = r.id), 0) + 1
from public.routes r
where r.name = 'خط سموحة'
on conflict (route_id, name) do nothing;
