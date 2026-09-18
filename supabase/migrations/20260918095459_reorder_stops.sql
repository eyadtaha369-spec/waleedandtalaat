-- Repositions/renames specific stops based on the confirmed current
-- order (queried directly beforehand — see chat). Each stop is
-- matched by its route + current name, so this only ever touches the
-- exact rows intended; nothing here depends on assumed prior state.

-- ---------------------------------------------------------------------
-- خط البحر: نفق سابا باشا moves from after الموقف (23) to right after
-- نفق جليم (13) -> becomes 14; everything from old 14-22 shifts +1.
-- ---------------------------------------------------------------------
update public.stops set display_order = display_order + 1
  where route_id = (select id from public.routes where name = 'خط البحر')
    and display_order between 14 and 22;
update public.stops set display_order = 14
  where route_id = (select id from public.routes where name = 'خط البحر')
    and name = 'نفق سابا باشا';

-- ---------------------------------------------------------------------
-- خط شارع أبو قير: كنيسة جناكليس moves from last (18) to right after
-- شعراوي (2) -> becomes 3; everything from old 3-17 shifts +1.
-- ---------------------------------------------------------------------
update public.stops set display_order = display_order + 1
  where route_id = (select id from public.routes where name = 'خط شارع أبو قير')
    and display_order between 3 and 17;
update public.stops set display_order = 3
  where route_id = (select id from public.routes where name = 'خط شارع أبو قير')
    and name = 'كنيسة جناكليس';

-- ---------------------------------------------------------------------
-- خط السيوف: العماروه (added last time, now clarified/renamed) moves
-- from last (16) to right before اسكوت (3) -> becomes 3; everything
-- from old 3-15 shifts +1. أول 45 (now at 5) renamed for clarity.
-- ---------------------------------------------------------------------
update public.stops set display_order = display_order + 1
  where route_id = (select id from public.routes where name = 'خط السيوف')
    and display_order between 3 and 15;
update public.stops set display_order = 3, name = 'شارع العمروسية / العمراوة'
  where route_id = (select id from public.routes where name = 'خط السيوف')
    and name = 'العماروه';
update public.stops set name = 'أول 45 قدام شارع المدارس'
  where route_id = (select id from public.routes where name = 'خط السيوف')
    and name = 'أول 45';

-- Safety net: any student/booking that already selected either old
-- name (أول 45 in particular is a long-standing stop some students
-- may already have chosen) gets updated to match, scoped to خط السيوف
-- specifically since a same-named stop could theoretically exist
-- under a different route.
update public.profiles set pickup_stop = 'شارع العمروسية / العمراوة'
  where pickup_stop = 'العماروه' and route = 'خط السيوف';
update public.profiles set pickup_stop = 'أول 45 قدام شارع المدارس'
  where pickup_stop = 'أول 45' and route = 'خط السيوف';
update public.bookings set pickup_stop = 'شارع العمروسية / العمراوة'
  where pickup_stop = 'العماروه' and route = 'خط السيوف';
update public.bookings set pickup_stop = 'أول 45 قدام شارع المدارس'
  where pickup_stop = 'أول 45' and route = 'خط السيوف';

-- ---------------------------------------------------------------------
-- خط جمال عبدالناصر: غزل المحلة moves from last (11) to right after
-- حسني (2) -> becomes 3; everything from old 3-10 shifts +1.
-- ---------------------------------------------------------------------
update public.stops set display_order = display_order + 1
  where route_id = (select id from public.routes where name = 'خط جمال عبدالناصر')
    and display_order between 3 and 10;
update public.stops set display_order = 3
  where route_id = (select id from public.routes where name = 'خط جمال عبدالناصر')
    and name = 'غزل المحلة';
