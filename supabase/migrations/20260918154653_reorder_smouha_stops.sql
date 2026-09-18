-- Reorders خط سموحة to the exact requested sequence. Confirmed via a
-- direct query first: none of the 4 existing stops need removing —
-- all map cleanly onto the new order, just shifted/renamed. Only 2
-- genuinely new stops needed.
--
-- Renames applied: 'علي بن ابي طالب' -> 'علي بن أبي طالب' (hamza
-- spelling, as requested) and 'قباني عند كوبري الإبراهيمية' ->
-- 'قباني' (shortened, same place — added last session with the fuller
-- name). Safety net updates any existing student profile/booking
-- pickup_stop that already referenced either old spelling.

do $$
begin
  if not exists (
    select 1 from public.stops s
    join public.routes r on r.id = s.route_id
    where r.name = 'خط سموحة' and s.name = 'المحافظة الجديدة'
  ) then
    update public.stops
    set display_order = display_order + 1
    where route_id = (select id from public.routes where name = 'خط سموحة');

    update public.stops set name = 'علي بن أبي طالب'
      where route_id = (select id from public.routes where name = 'خط سموحة')
        and name = 'علي بن ابي طالب';
    update public.stops set name = 'قباني'
      where route_id = (select id from public.routes where name = 'خط سموحة')
        and name = 'قباني عند كوبري الإبراهيمية';

    update public.profiles set pickup_stop = 'علي بن أبي طالب'
      where pickup_stop = 'علي بن ابي طالب' and route = 'خط سموحة';
    update public.profiles set pickup_stop = 'قباني'
      where pickup_stop = 'قباني عند كوبري الإبراهيمية' and route = 'خط سموحة';
    update public.bookings set pickup_stop = 'علي بن أبي طالب'
      where pickup_stop = 'علي بن ابي طالب' and route = 'خط سموحة';
    update public.bookings set pickup_stop = 'قباني'
      where pickup_stop = 'قباني عند كوبري الإبراهيمية' and route = 'خط سموحة';

    insert into public.stops (route_id, name, display_order)
    select r.id, v.name, v.display_order
    from public.routes r
    cross join (
      values
        ('المحافظة الجديدة', 1),
        ('دوران عزبة سعد', 6)
    ) as v(name, display_order)
    where r.name = 'خط سموحة';
  end if;
end $$;
