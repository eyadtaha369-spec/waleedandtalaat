-- Reorders/updates stops for خط المعمورة ومحمودية, based on the
-- confirmed current order (queried directly beforehand — see chat).
-- Original 1-13: الأكاديمية البحرية, شارع 25, خورشيد, العوايد,
-- شارع الترعة, كوبري الناموس, منصور شيلزوليه, الفيروزة, الحضرة, كابو,
-- صيدلية خليل, محرم بك, <13th stop, name unconfirmed but handled
-- generically below by its position>.
--
-- All three parts run as one UPDATE statement each keyed on CURRENT
-- display_order via CASE — Postgres evaluates every row's new value
-- against its pre-update state within a single statement, so there's
-- no cross-row contamination even though later stops' new positions
-- depend on earlier insertions.

-- Step 1: shift every surviving stop (everything except خورشيد, which
-- is deleted and replaced separately below) to its final position.
update public.stops
set display_order = case display_order
  when 1 then 1   -- الأكاديمية البحرية (unchanged)
  when 2 then 2   -- شارع 25 (unchanged)
  when 4 then 7   -- العوايد
  when 5 then 8   -- شارع الترعة
  when 6 then 9   -- كوبري الناموس
  when 7 then 10  -- منصور شيلزوليه
  when 8 then 12  -- الفيروزة
  when 9 then 14  -- الحضرة
  when 10 then 15 -- كابو
  when 11 then 16 -- صيدلية خليل
  when 12 then 17 -- محرم بك
  when 13 then 20 -- whatever the 13th stop is
  else display_order
end
where route_id = (select id from public.routes where name = 'خط المعمورة ومحمودية')
  and display_order <> 3;

-- Step 2: remove خورشيد entirely — replaced by three bridge stops below.
delete from public.stops
  where route_id = (select id from public.routes where name = 'خط المعمورة ومحمودية')
    and name = 'خورشيد';

-- Step 3: insert every new stop at its exact final position.
insert into public.stops (route_id, name, display_order)
select r.id, v.name, v.display_order
from public.routes r
cross join (
  values
    ('واصلة المعمورة', 3),   -- right before the Khorshed section
    ('كوبري خورشيد', 4),      -- replaces خورشيد, in sequence
    ('كوبري الرحمة', 5),
    ('كوبري الزوايدة', 6),
    ('محطة الحجر', 11),      -- right before الفيروزة (now at 12)
    ('إشارة النقل', 13),     -- right after الفيروزة
    ('محطة بوالينو', 18),    -- right after محرم بك (now at 17)
    ('محطة راغب', 19)
) as v(name, display_order)
where r.name = 'خط المعمورة ومحمودية'
on conflict (route_id, name) do nothing;
