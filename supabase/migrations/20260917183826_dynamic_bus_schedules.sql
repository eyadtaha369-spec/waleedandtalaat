-- =====================================================================
-- Dynamic per-route schedule management
-- =====================================================================
-- Covers morning and early-return time slots only — 4:00 PM return is
-- a structurally different mechanism (opt-out based, route-locked
-- stops rather than a picked time) and isn't part of this table. The
-- booking WINDOW (e.g. "opens 12PM, closes 7PM") is a separate,
-- unrelated concept in enforce_booking_window() — this table controls
-- WHICH times are offered within that window, not WHEN booking itself
-- is allowed.

create table if not exists public.bus_schedules (
  id uuid primary key default gen_random_uuid(),
  route_name text not null,
  time_slot text not null,
  kind text not null check (kind in ('morning', 'return')),
  is_active boolean not null default true,
  display_order int not null default 0,
  unique (route_name, time_slot, kind)
);

alter table public.bus_schedules enable row level security;
-- No direct client access — every read/write goes through the RPCs
-- below, which apply the same admin/supervisor route-scoping used
-- everywhere else in this app.
revoke all on public.bus_schedules from public, anon, authenticated;

-- Seed with the current defaults for every real route. خط برج العرب
-- deliberately only gets 12:30 PM for return — matches the existing
-- server-side restriction in enforce_booking_window(), which stays in
-- place regardless as a second, independent safety net.
insert into public.bus_schedules (route_name, time_slot, kind, display_order)
select r.name, s.slot, s.kind, s.ord
from public.routes r
cross join (
  values
    ('06:00 AM', 'morning', 1),
    ('08:00 AM', 'morning', 2),
    ('12:30 PM', 'return', 1),
    ('01:30 PM', 'return', 2),
    ('02:30 PM', 'return', 3)
) as s(slot, kind, ord)
where not (r.name = 'خط برج العرب' and s.slot in ('01:30 PM', '02:30 PM'))
on conflict (route_name, time_slot, kind) do nothing;

-- Staff management listing: admin sees any/all routes with a filter;
-- supervisor is locked to their own assigned_route. Returns every row
-- (active and inactive) for the admin UI.
create or replace function public.list_bus_schedules(p_route text default null)
returns table (
  id uuid,
  route_name text,
  time_slot text,
  kind text,
  is_active boolean,
  display_order int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  if public.is_admin(auth.uid()) then
    v_route := p_route;
  else
    select assigned_route into v_route from public.profiles where id = auth.uid();
    if v_route is null then
      return;
    end if;
  end if;

  return query
  select b.id, b.route_name, b.time_slot, b.kind, b.is_active, b.display_order
  from public.bus_schedules b
  where v_route is null or b.route_name = v_route
  order by b.route_name, b.kind, b.display_order, b.time_slot;
end;
$$;

revoke all on function public.list_bus_schedules(text) from public, anon;
grant execute on function public.list_bus_schedules(text) to authenticated;

-- Public-ish read for the student booking page: only active slots for
-- one route. Any signed-in user may call this (not staff-gated) since
-- every student needs it for their own booking dropdown.
create or replace function public.list_active_slots_for_route(p_route text)
returns table (time_slot text, kind text)
language sql
security definer
set search_path = public
as $$
  select b.time_slot, b.kind
  from public.bus_schedules b
  where b.route_name = p_route and b.is_active = true
  order by b.kind, b.display_order, b.time_slot;
$$;

revoke all on function public.list_active_slots_for_route(text) from public, anon;
grant execute on function public.list_active_slots_for_route(text) to authenticated;

-- Toggle ON/OFF. Supervisor may only toggle a row on their own route.
create or replace function public.toggle_bus_schedule(p_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route text;
  v_caller_route text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select route_name into v_route from public.bus_schedules where id = p_id;
  if not found then
    raise exception 'Schedule slot not found';
  end if;

  if not public.is_admin(auth.uid()) then
    select assigned_route into v_caller_route from public.profiles where id = auth.uid();
    if v_caller_route is distinct from v_route then
      raise exception 'You can only manage schedules on your own route' using errcode = '42501';
    end if;
  end if;

  update public.bus_schedules set is_active = p_is_active where id = p_id;
end;
$$;

revoke all on function public.toggle_bus_schedule(uuid, boolean) from public, anon;
grant execute on function public.toggle_bus_schedule(uuid, boolean) to authenticated;

-- Create a new slot or edit an existing one's time. p_id null = create.
create or replace function public.upsert_bus_schedule(
  p_route text, p_time_slot text, p_kind text, p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_route text;
  v_existing_route text;
  v_result_id uuid;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_kind not in ('morning', 'return') then
    raise exception 'Invalid kind';
  end if;

  if not public.is_admin(auth.uid()) then
    select assigned_route into v_caller_route from public.profiles where id = auth.uid();
    if v_caller_route is distinct from p_route then
      raise exception 'You can only manage schedules on your own route' using errcode = '42501';
    end if;
    if p_id is not null then
      select route_name into v_existing_route from public.bus_schedules where id = p_id;
      if v_existing_route is distinct from v_caller_route then
        raise exception 'You can only manage schedules on your own route' using errcode = '42501';
      end if;
    end if;
  end if;

  if p_id is null then
    insert into public.bus_schedules (route_name, time_slot, kind)
      values (p_route, p_time_slot, p_kind)
      returning id into v_result_id;
  else
    update public.bus_schedules
      set time_slot = p_time_slot, kind = p_kind
      where id = p_id
      returning id into v_result_id;
  end if;

  return v_result_id;
end;
$$;

revoke all on function public.upsert_bus_schedule(text, text, text, uuid) from public, anon;
grant execute on function public.upsert_bus_schedule(text, text, text, uuid) to authenticated;

-- Delete a slot. Supervisor may only delete a row on their own route.
create or replace function public.delete_bus_schedule(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route text;
  v_caller_route text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select route_name into v_route from public.bus_schedules where id = p_id;
  if not found then
    return;
  end if;

  if not public.is_admin(auth.uid()) then
    select assigned_route into v_caller_route from public.profiles where id = auth.uid();
    if v_caller_route is distinct from v_route then
      raise exception 'You can only manage schedules on your own route' using errcode = '42501';
    end if;
  end if;

  delete from public.bus_schedules where id = p_id;
end;
$$;

revoke all on function public.delete_bus_schedule(uuid) from public, anon;
grant execute on function public.delete_bus_schedule(uuid) to authenticated;
