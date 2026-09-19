insert into public.stops (route_id, name, display_order)
select r.id, 'آخر النفق', coalesce((select max(s.display_order) from public.stops s where s.route_id = r.id), 0) + 1
from public.routes r
where r.name = 'خط جمال عبدالناصر'
on conflict (route_id, name) do nothing;
