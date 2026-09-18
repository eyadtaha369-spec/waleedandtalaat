-- "this route" = خط السيوف, the route being edited in the immediately
-- preceding tasks. No position specified, so appended at the end.
-- ON CONFLICT DO NOTHING makes this safe to re-run.

insert into public.stops (route_id, name, display_order)
select
  r.id,
  'مستشفى elite سريع',
  coalesce((select max(s.display_order) from public.stops s where s.route_id = r.id), 0) + 1
from public.routes r
where r.name = 'خط السيوف'
on conflict (route_id, name) do nothing;
