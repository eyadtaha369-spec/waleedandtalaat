-- Returns total bookings per (kind, slot) for a given date, used for
-- the "per departure time" summary badges on the Manifests page —
-- these span every slot simultaneously, unlike the main table which
-- only ever shows one slot (whichever tab is selected) at a time, so
-- this is a genuinely separate aggregate query rather than something
-- derivable from what the panel already fetches.
--
-- 4:00 PM is handled specially to match ManifestsPanel's existing
-- frontend logic exactly: it's a guaranteed-seat default (every
-- student rides unless they opted out), not a plain booking count —
-- so its row is computed from profiles minus opt_outs, and explicit
-- bookings rows with slot='04:00 PM' are excluded from the generic
-- aggregate to avoid double-counting a student who proactively chose
-- a specific 4PM stop.
create or replace function public.get_slot_totals(p_date date)
returns table (kind text, slot text, total int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select b.kind, b.slot, count(*)::int
  from public.bookings b
  where b.service_date = p_date and b.slot <> '04:00 PM'
  group by b.kind, b.slot

  union all

  select
    'return'::text,
    '04:00 PM'::text,
    (
      select count(*)::int
      from public.profiles p
      join public.user_roles r on r.user_id = p.id and r.role = 'student'
    ) - (
      select count(*)::int from public.opt_outs where service_date = p_date
    );
end;
$$;

revoke all on function public.get_slot_totals(date) from public, anon;
grant execute on function public.get_slot_totals(date) to authenticated;
