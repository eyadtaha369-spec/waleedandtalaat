-- =====================================================================
-- Subscription plan + installment/payment status tracking
-- =====================================================================

-- New payment status column. 'paid_full' is the default for every
-- plan except explicit installment selections.
alter table public.profiles
  add column if not exists payment_status text not null default 'paid_full'
  check (payment_status in ('paid_full', 'installment_pending'));

-- subscription_type grows from two ad-hoc values ('full_term','package')
-- to four real plans. Migrate existing data so nothing silently stops
-- working: the old 'package' meant exactly what '70_trips' now means.
update public.profiles set subscription_type = '70_trips' where subscription_type = 'package';

-- handle_new_user now also reads payment_status from signup/import
-- metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, route, pickup_stop, photo_url, subscription_type, payment_status, trips_total, trips_remaining)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'route',
    new.raw_user_meta_data->>'pickup_stop',
    new.raw_user_meta_data->>'photo_url',
    coalesce(new.raw_user_meta_data->>'subscription_type', 'full_term'),
    coalesce(new.raw_user_meta_data->>'payment_status', 'paid_full'),
    coalesce((new.raw_user_meta_data->>'trips_total')::int, 0),
    coalesce((new.raw_user_meta_data->>'trips_total')::int, 0)
  );
  insert into public.user_roles (user_id, role) values (new.id, 'student') on conflict do nothing;
  return new;
end;
$$;

-- Trip deduction now keys off the specific '70_trips' plan rather than
-- the old generic 'package' label.
create or replace function public.scan_pass(p_student_id uuid, p_slot text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_kind text;
  v_profile record;
  v_existing_scan record;
  v_booking record;
  v_opted_out boolean;
  v_status text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_student_id;
  if not found then
    return jsonb_build_object('error', 'Student not found');
  end if;

  select * into v_existing_scan
    from public.scans
    where student_id = p_student_id and service_date = v_today and slot = p_slot;

  if found then
    return jsonb_build_object(
      'status', 'scanned_earlier',
      'full_name', v_profile.full_name,
      'route', v_profile.route,
      'photo_url', v_profile.photo_url,
      'trips_remaining', v_profile.trips_remaining,
      'scanned_at', v_existing_scan.scanned_at
    );
  end if;

  if p_slot = '04:00 PM' then
    select exists(
      select 1 from public.opt_outs where student_id = p_student_id and service_date = v_today
    ) into v_opted_out;
    v_status := case when v_opted_out then 'not_booked' else 'booked' end;
  else
    v_kind := case when p_slot in ('06:00 AM', '08:00 AM') then 'morning' else 'return' end;
    select * into v_booking
      from public.bookings
      where student_id = p_student_id
        and service_date = v_today
        and kind = v_kind
        and slot = p_slot;
    v_status := case when found then 'booked' else 'not_booked' end;
  end if;

  insert into public.scans (student_id, scanned_by, service_date, slot)
  values (p_student_id, auth.uid(), v_today, p_slot);

  if v_status = 'booked' and p_slot <> '04:00 PM' and v_profile.subscription_type = '70_trips' then
    update public.profiles
      set trips_remaining = greatest(trips_remaining - 1, 0)
      where id = p_student_id
      returning trips_remaining into v_profile.trips_remaining;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'full_name', v_profile.full_name,
    'route', v_profile.route,
    'photo_url', v_profile.photo_url,
    'trips_remaining', v_profile.trips_remaining
  );
end;
$$;

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
    where p.subscription_type = '70_trips'
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
  where p.subscription_type = '70_trips'
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
