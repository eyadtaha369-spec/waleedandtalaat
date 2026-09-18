-- Confirmed via a direct query first (see chat):
--   1 الإصلاح, 2 قسم منتزة ثالث, 3 شارع العمروسية / العمراوة, ...,
--   7 شارع القاهرة, ...
--
-- 1) شارع العمروسية / العمراوة (our stored name for 'العماروة') moves
--    from 3 to right before قسم منتزة ثالث ('القسم') -> a simple swap
--    of positions 2 and 3. display_order has no uniqueness
--    constraint, so both updates are safe regardless of order.
-- 2) شارع القاهرة renamed to شارع سيف, same position (7) — a
--    replacement, not a reposition. Safety net updates any existing
--    student profile/booking pickup_stop that already referenced the
--    old name, since this is a long-standing stop.

update public.stops set display_order = 2
  where route_id = (select id from public.routes where name = 'خط السيوف')
    and name = 'شارع العمروسية / العمراوة';
update public.stops set display_order = 3
  where route_id = (select id from public.routes where name = 'خط السيوف')
    and name = 'قسم منتزة ثالث';

update public.stops set name = 'شارع سيف'
  where route_id = (select id from public.routes where name = 'خط السيوف')
    and name = 'شارع القاهرة';

update public.profiles set pickup_stop = 'شارع سيف'
  where pickup_stop = 'شارع القاهرة' and route = 'خط السيوف';
update public.bookings set pickup_stop = 'شارع سيف'
  where pickup_stop = 'شارع القاهرة' and route = 'خط السيوف';
