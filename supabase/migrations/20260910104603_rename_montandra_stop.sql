-- Renames the خط البحر stop "المنتدره" to "Sheraton المندرة".
-- Scoped strictly to خط البحر — the same stop name also exists under
-- خط جمال عبدالناصر, left untouched since only البحر was requested.

update public.stops
  set name = 'Sheraton المندرة'
  where name = 'المنتدره'
    and route_id = (select id from public.routes where name = 'خط البحر');

update public.profiles
  set pickup_stop = 'Sheraton المندرة'
  where pickup_stop = 'المنتدره' and route = 'خط البحر';

update public.bookings
  set pickup_stop = 'Sheraton المندرة'
  where pickup_stop = 'المنتدره' and route = 'خط البحر';
