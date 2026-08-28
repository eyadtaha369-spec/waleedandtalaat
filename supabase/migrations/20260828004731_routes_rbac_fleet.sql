-- =====================================================================
-- Waleed & Talaat — Backend Architecture v3
-- Dynamic routes/stops hierarchy · stricter RBAC (supervisor = scanner
-- only) · 2:30 PM return slot · automated fleet allocation engine
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ROUTES & STOPS HIERARCHY
-- ---------------------------------------------------------------------
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order int not null default 0
);

create table if not exists public.stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  name text not null,
  display_order int not null default 0,
  unique (route_id, name)
);

alter table public.routes enable row level security;
alter table public.stops enable row level security;

-- Public read (guest daily-pass form + booking screens need this
-- without being signed in). Only admins can edit the hierarchy.
create policy "anyone can read routes" on public.routes for select using (true);
create policy "anyone can read stops" on public.stops for select using (true);

create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = 'admin'
  );
$$;
revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;

create policy "admins manage routes" on public.routes
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admins manage stops" on public.stops
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Seed: the real operational route/stop hierarchy.
insert into public.routes (name, display_order) values
  ('خط البحر', 1),
  ('خط شارع أبو قير', 2),
  ('خط السيوف', 3),
  ('خط المعمورة ومحمودية', 4),
  ('خط كفر الدوار', 5),
  ('خط سموحة', 6),
  ('خط جمال عبدالناصر', 7),
  ('خط العجمي', 8),
  ('خط برج العرب', 9)
on conflict (name) do nothing;

insert into public.stops (route_id, name, display_order)
select r.id, s.name, s.ord
from public.routes r
join lateral (
  values
    ('خط البحر', 'المنتدره', 1), ('خط البحر', 'الوردة البيضاء', 2), ('خط البحر', 'نفق 45', 3),
    ('خط البحر', 'نفق الاسكندر ابراهيم', 4), ('خط البحر', 'إشارة خليل حماده', 5), ('خط البحر', 'العزيزية', 6),
    ('خط البحر', 'إشارة جامع سيدي بشر', 7), ('خط البحر', 'إشارة محمد نجيب', 8), ('خط البحر', 'نفق المحروسه', 9),
    ('خط البحر', 'إشارة الاقبال', 10), ('خط البحر', 'إشاره 26 يوليو', 11), ('خط البحر', 'إشارة سان ستيفانو', 12),
    ('خط البحر', 'نفق جليم', 13), ('خط البحر', 'إشاره شارع سوريا', 14), ('خط البحر', 'إشاره The Walk', 15),
    ('خط البحر', 'نفق كليوباترا', 16), ('خط البحر', 'نفق سبورتنج', 17), ('خط البحر', 'نفق الابراهيمية', 18),
    ('خط البحر', 'نفق كامب شيزار', 19), ('خط البحر', 'مستشفى الشاطبي', 20), ('خط البحر', 'الشبان المسلمين', 21),
    ('خط البحر', 'الموقف', 22),

    ('خط شارع أبو قير', 'فيكتوريا', 1), ('خط شارع أبو قير', 'شعراوي', 2), ('خط شارع أبو قير', 'جناكليس شارع مرتضي', 3),
    ('خط شارع أبو قير', 'جامع يحيى', 4), ('خط شارع أبو قير', 'بنزينه جليم', 5), ('خط شارع أبو قير', 'بنزينة قسم الرمل', 6),
    ('خط شارع أبو قير', 'بولكلي', 7), ('خط شارع أبو قير', 'ليزابيلا', 8), ('خط شارع أبو قير', 'الديب مول', 9),
    ('خط شارع أبو قير', 'مصطفي كامل', 10), ('خط شارع أبو قير', 'سيدي جابر', 11), ('خط شارع أبو قير', 'بنزينة كليوباترا', 12),
    ('خط شارع أبو قير', 'سبورتنج', 13), ('خط شارع أبو قير', 'الابراهيمية', 14), ('خط شارع أبو قير', 'باب شرق', 15),
    ('خط شارع أبو قير', 'قناه السويس', 16), ('خط شارع أبو قير', 'الموقف', 17),

    ('خط السيوف', 'الإصلاح', 1), ('خط السيوف', 'قسم منتزة ثالث', 2), ('خط السيوف', 'اسكوت', 3),
    ('خط السيوف', 'أول 45', 4), ('خط السيوف', 'أدفينا', 5), ('خط السيوف', 'شارع القاهرة', 6),
    ('خط السيوف', 'إشارة كرفور', 7), ('خط السيوف', 'كرفور قهوة باب الخلق', 8), ('خط السيوف', 'دوران السيوف', 9),
    ('خط السيوف', 'بيتزا دادي', 10), ('خط السيوف', 'الشركة العربية', 11), ('خط السيوف', 'أول كوبري لعوايد', 12),
    ('خط السيوف', 'كوبري سكينة العوايد', 13), ('خط السيوف', 'آخر كوبري أبيس', 14), ('خط السيوف', 'اصحراوي', 15),

    ('خط المعمورة ومحمودية', 'الأكاديمية البحرية', 1), ('خط المعمورة ومحمودية', 'شارع 25', 2),
    ('خط المعمورة ومحمودية', 'خورشيد', 3), ('خط المعمورة ومحمودية', 'العوايد', 4),
    ('خط المعمورة ومحمودية', 'شارع الترعة', 5), ('خط المعمورة ومحمودية', 'كوبري الناموس', 6),
    ('خط المعمورة ومحمودية', 'منصور شيفزوليه', 7), ('خط المعمورة ومحمودية', 'الفيروزة', 8),
    ('خط المعمورة ومحمودية', 'الحضرة', 9), ('خط المعمورة ومحمودية', 'كابو', 10),
    ('خط المعمورة ومحمودية', 'صيدلية خليل', 11), ('خط المعمورة ومحمودية', 'محرم بك', 12),
    ('خط المعمورة ومحمودية', 'كرموز', 13),

    ('خط كفر الدوار', 'المدخل', 1), ('خط كفر الدوار', 'اول ش الحدائق', 2), ('خط كفر الدوار', 'اول ش المحكمة', 3),
    ('خط كفر الدوار', 'الخضرا محموديه', 4), ('خط كفر الدوار', 'البيضا محمودية', 5),

    ('خط سموحة', 'بلازا', 1), ('خط سموحة', 'دوران سموحة', 2), ('خط سموحة', 'علي بن ابي طالب', 3),

    ('خط جمال عبدالناصر', 'المنتدره', 1), ('خط جمال عبدالناصر', 'حسني', 2), ('خط جمال عبدالناصر', 'عبدالحليم محمود', 3),
    ('خط جمال عبدالناصر', 'أمام كرم الشام', 4), ('خط جمال عبدالناصر', 'شارع اطلس', 5),
    ('خط جمال عبدالناصر', 'الأكاديميه', 6), ('خط جمال عبدالناصر', 'دوران جيهان', 7),
    ('خط جمال عبدالناصر', 'المدهش', 8), ('خط جمال عبدالناصر', 'آخر النفق', 9), ('خط جمال عبدالناصر', 'محمد نجيب', 10),

    ('خط العجمي', 'الورديان', 1), ('خط العجمي', 'الدخيلة', 2), ('خط العجمي', 'بنزينة البيطاش تجمع', 3),
    ('خط العجمي', 'فضة', 4), ('خط العجمي', 'نموذجية', 5), ('خط العجمي', 'كار فور', 6),
    ('خط العجمي', 'بنزينة أوليمبيا', 7), ('خط العجمي', 'اول حديد وصلب', 8), ('خط العجمي', 'اول ابو يوسف', 9),
    ('خط العجمي', 'بنزينة السلام', 10), ('خط العجمي', 'اول كوبري 21', 11),

    ('خط برج العرب', 'هايير العرب', 1), ('خط برج العرب', 'مسجد العتيق', 2), ('خط برج العرب', 'مهبط الطيران', 3),
    ('خط برج العرب', 'جهاز مدينه برج العرب', 4), ('خط برج العرب', 'از ها مول', 5), ('خط برج العرب', 'بتروجيت', 6),
    ('خط برج العرب', 'شارع الصنفرة', 7), ('خط برج العرب', 'مول الاحمدي', 8), ('خط برج العرب', 'مدرسة الشهيد منهيد', 9)
) as s(route_name, name, ord) on r.name = s.route_name
on conflict (route_id, name) do nothing;

-- ---------------------------------------------------------------------
-- 1b. Daily-pass requests + guest passes also carry a specific stop now
--     that stops are a real hierarchy, not just a route name.
-- ---------------------------------------------------------------------
alter table public.daily_pass_requests add column if not exists pickup_stop text;
alter table public.guest_passes add column if not exists pickup_stop text;

-- ---------------------------------------------------------------------
-- 2. NEW 2:30 PM EARLY RETURN SLOT
--    Same window (6:30 AM - 10:30 AM) already covers it since the
--    booking_window_guard trigger checks kind, not the specific slot.
--    Only the no-show auto-deduction cron needs to recognize it.
-- ---------------------------------------------------------------------
create or replace function public.auto_deduct_noshow_return()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
begin
  update public.profiles p
    set trips_remaining = greatest(trips_remaining - 1, 0)
    where p.subscription_type = 'package'
      and exists (
        select 1 from public.scans s
        where s.student_id = p.id and s.service_date = v_today
          and s.slot in ('06:00 AM', '08:00 AM')
      )
      and not exists (
        select 1 from public.scans s
        where s.student_id = p.id and s.service_date = v_today
          and s.slot in ('12:30 PM', '01:30 PM', '02:30 PM')
      )
      and not exists (
        select 1 from public.opt_outs o
        where o.student_id = p.id and o.service_date = v_today
      )
      and not exists (
        select 1 from public.scans s
        where s.student_id = p.id and s.service_date = v_today and s.slot = '04:00 PM'
      );

  insert into public.scans (student_id, scanned_by, service_date, slot)
  select p.id, null, v_today, '04:00 PM'
  from public.profiles p
  where p.subscription_type = 'package'
    and exists (
      select 1 from public.scans s
      where s.student_id = p.id and s.service_date = v_today and s.slot in ('06:00 AM', '08:00 AM')
    )
    and not exists (
      select 1 from public.scans s
      where s.student_id = p.id and s.service_date = v_today and s.slot in ('12:30 PM', '01:30 PM', '02:30 PM')
    )
    and not exists (
      select 1 from public.opt_outs o where o.student_id = p.id and o.service_date = v_today
    )
    and not exists (
      select 1 from public.scans s
      where s.student_id = p.id and s.service_date = v_today and s.slot = '04:00 PM'
    )
  on conflict (student_id, service_date, slot) do nothing;
end;
$$;

-- get_guest_pass now also exposes pickup_stop for the public pass page.
create or replace function public.get_guest_pass(p_token uuid)
returns table (
  full_name text, route text, pickup_stop text, slot text, service_date date, is_scanned boolean
)
language sql
security definer
set search_path = public
as $$
  select full_name, route, pickup_stop, slot, service_date, is_scanned
  from public.guest_passes
  where pass_token = p_token;
$$;

-- ---------------------------------------------------------------------
-- 3. STRICTER RBAC: supervisor = scanner only. Daily-pass decisions and
--    bulk import now require ADMIN specifically, not just "staff".
-- ---------------------------------------------------------------------
create or replace function public.decide_daily_pass_request(p_request_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_pass record;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_action not in ('approved', 'rejected') then
    raise exception 'Invalid action';
  end if;

  select * into v_request from public.daily_pass_requests where id = p_request_id and status = 'pending';
  if not found then
    return jsonb_build_object('error', 'Request not found or already decided');
  end if;

  update public.daily_pass_requests set status = p_action where id = p_request_id;

  if p_action = 'approved' then
    insert into public.guest_passes (request_id, full_name, phone, route, pickup_stop, slot, service_date)
    values (v_request.id, v_request.full_name, v_request.phone, v_request.route, v_request.pickup_stop, v_request.slot, v_request.service_date)
    returning * into v_pass;
  end if;

  return jsonb_build_object(
    'action', p_action,
    'full_name', v_request.full_name,
    'phone', v_request.phone,
    'route', v_request.route,
    'pickup_stop', v_request.pickup_stop,
    'slot', v_request.slot,
    'pass_token', v_pass.pass_token
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. AUTOMATED FLEET ALLOCATION ENGINE
--    Per-route bus sizing recommendation for today's service date.
--    Remaining_For_4PM = Morning_Scans - Early_Return_Passengers - Opted_Out
-- ---------------------------------------------------------------------
create or replace function public.fleet_manifest_report(p_date date default null)
returns table (
  route text,
  morning_scans bigint,
  early_return_passengers bigint,
  opted_out_count bigint,
  remaining_for_4pm bigint,
  recommended_bus text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Africa/Cairo')::date);
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  with morning as (
    select p.route as r, count(distinct s.student_id) as cnt
    from public.scans s
    join public.profiles p on p.id = s.student_id
    where s.service_date = v_date and s.slot in ('06:00 AM', '08:00 AM')
    group by p.route
  ),
  early_return as (
    select p.route as r, count(distinct s.student_id) as cnt
    from public.scans s
    join public.profiles p on p.id = s.student_id
    where s.service_date = v_date and s.slot in ('12:30 PM', '01:30 PM', '02:30 PM')
    group by p.route
  ),
  opted_out as (
    select p.route as r, count(distinct o.student_id) as cnt
    from public.opt_outs o
    join public.profiles p on p.id = o.student_id
    where o.service_date = v_date
    group by p.route
  )
  select
    r.name,
    coalesce(m.cnt, 0),
    coalesce(er.cnt, 0),
    coalesce(oo.cnt, 0),
    greatest(coalesce(m.cnt, 0) - coalesce(er.cnt, 0) - coalesce(oo.cnt, 0), 0),
    case
      when greatest(coalesce(m.cnt, 0) - coalesce(er.cnt, 0) - coalesce(oo.cnt, 0), 0) <= 33
        then '33-seater'
      else '50-seater'
    end
  from public.routes r
  left join morning m on m.r = r.name
  left join early_return er on er.r = r.name
  left join opted_out oo on oo.r = r.name
  order by r.display_order;
end;
$$;

revoke all on function public.fleet_manifest_report(date) from public, anon;
grant execute on function public.fleet_manifest_report(date) to authenticated;
