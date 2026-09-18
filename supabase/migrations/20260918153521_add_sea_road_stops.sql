-- Inserts 6 new stops on خط البحر, all positioned before the route's
-- current first stop. Matched against 'Sheraton المندرة' — the actual
-- stored value from an earlier rename in this same route (not
-- 'شيراتون المندرة', which is how it was referred to in this request;
-- same place, different stored string).
--
-- Simple prepend: shift every existing stop by +6, then insert the 6
-- new stops as positions 1-6. Doesn't depend on knowing the rest of
-- the route's middle-of-list order, since nothing there is affected.
-- Guarded to run only once — unlike a simple MAX+1 append, a blanket
-- shift isn't naturally safe to re-run; skips entirely if the first
-- new stop is already present.

do $$
begin
  if not exists (
    select 1 from public.stops s
    join public.routes r on r.id = s.route_id
    where r.name = 'خط البحر' and s.name = 'مدرسة المنار'
  ) then
    update public.stops
    set display_order = display_order + 6
    where route_id = (select id from public.routes where name = 'خط البحر');

    insert into public.stops (route_id, name, display_order)
    select r.id, v.name, v.display_order
    from public.routes r
    cross join (
      values
        ('مدرسة المنار', 1),
        ('أبو عون', 2),
        ('الشرطة العسكرية', 3),
        ('الإصلاح', 4),
        ('معمورة الشاطئ', 5),
        ('المنتزه', 6)
    ) as v(name, display_order)
    where r.name = 'خط البحر';
  end if;
end $$;
