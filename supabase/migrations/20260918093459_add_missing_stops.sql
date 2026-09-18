-- Adds missing pickup stops, appended at the end of each route's
-- existing stop list (display_order = current max + 1..N). Mapped to
-- our canonical route names, which differ slightly from how a couple
-- of these were named in the request:
--   خط عبد الناصر  -> خط جمال عبدالناصر (canonical full name)
--   خط العجمي      -> خط العجمي والساحل (merged with الساحل last week)
-- ON CONFLICT DO NOTHING makes this safe to re-run.

with new_stops (route_name, stop_name) as (
  values
    ('خط البحر', 'نفق سابا باشا'),
    ('خط جمال عبدالناصر', 'غزل المحلة'),
    ('خط شارع أبو قير', 'كنيسة جناكليس'),
    ('خط السيوف', 'العماروه'),
    ('خط العجمي والساحل', 'الهايبر'),
    ('خط العجمي والساحل', 'الهانوفيل')
),
next_order as (
  select ns.route_name, ns.stop_name,
    row_number() over (partition by ns.route_name order by ns.stop_name)
      + coalesce((select max(s.display_order) from public.stops s where s.route_id = r.id), 0)
      as display_order,
    r.id as route_id
  from new_stops ns
  join public.routes r on r.name = ns.route_name
)
insert into public.stops (route_id, name, display_order)
select route_id, stop_name, display_order from next_order
on conflict (route_id, name) do nothing;
