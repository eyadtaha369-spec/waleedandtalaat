-- =====================================================================
-- Installments & Collection Management
-- =====================================================================
-- Note on amounts: the roster sheet has no "expected total" or
-- "second installment amount" column — only what was actually paid so
-- far. second_installment_amount defaults to match the first payment,
-- which is the common convention for a two-part plan here. Admins can
-- correct it per student later if a particular plan differs.

alter table public.profiles
  add column if not exists initial_amount_paid numeric not null default 0,
  add column if not exists second_installment_amount numeric,
  add column if not exists payment_method text,
  add column if not exists installment_status text not null default 'none'
    check (installment_status in ('none', 'pending_second', 'completed'));

-- Backfill students already marked installment_pending from the
-- earlier subscription-status backfill.
update public.profiles
  set installment_status = 'pending_second',
      second_installment_amount = coalesce(second_installment_amount, initial_amount_paid)
  where payment_status = 'installment_pending' and installment_status = 'none';

-- handle_new_user now also reads the financial fields from signup/
-- import metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, full_name, phone, route, pickup_stop, photo_url,
    subscription_type, payment_status, trips_total, trips_remaining,
    initial_amount_paid, second_installment_amount, payment_method, installment_status
  )
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
    coalesce((new.raw_user_meta_data->>'trips_total')::int, 0),
    coalesce((new.raw_user_meta_data->>'initial_amount_paid')::numeric, 0),
    (new.raw_user_meta_data->>'second_installment_amount')::numeric,
    new.raw_user_meta_data->>'payment_method',
    coalesce(new.raw_user_meta_data->>'installment_status', 'none')
  );
  insert into public.user_roles (user_id, role) values (new.id, 'student') on conflict do nothing;
  return new;
end;
$$;

-- Collection log: one row per confirmed second-installment payment.
create table if not exists public.installment_collections (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now()
);
alter table public.installment_collections enable row level security;
create policy "admins read collections" on public.installment_collections
  for select to authenticated using (public.is_admin(auth.uid()));

-- Lists every student ever on an installment plan (pending or
-- completed), admin-only.
create or replace function public.list_installment_students()
returns table (
  user_id uuid,
  full_name text,
  phone text,
  route text,
  initial_amount_paid numeric,
  second_installment_amount numeric,
  payment_method text,
  installment_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.phone, p.route, p.initial_amount_paid,
         p.second_installment_amount, p.payment_method, p.installment_status
  from public.profiles p
  where p.installment_status <> 'none'
  order by p.installment_status, p.full_name;
end;
$$;

revoke all on function public.list_installment_students() from public, anon;
grant execute on function public.list_installment_students() to authenticated;

-- Confirms the second installment: flips both installment_status and
-- the general payment_status to complete/paid, and logs the amount.
create or replace function public.confirm_second_installment(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles
    where id = p_student_id and installment_status = 'pending_second';
  if not found then
    return jsonb_build_object('error', 'Student not found or not pending a second installment');
  end if;

  update public.profiles
    set installment_status = 'completed', payment_status = 'paid_full'
    where id = p_student_id;

  insert into public.installment_collections (student_id, amount, confirmed_by)
  values (p_student_id, coalesce(v_profile.second_installment_amount, v_profile.initial_amount_paid), auth.uid());

  return jsonb_build_object('user_id', p_student_id, 'status', 'completed');
end;
$$;

revoke all on function public.confirm_second_installment(uuid) from public, anon;
grant execute on function public.confirm_second_installment(uuid) to authenticated;
