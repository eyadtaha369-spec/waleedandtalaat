-- Root cause of the 500/"Admin access required" error on the
-- migration button: this RPC's own internal is_admin(auth.uid())
-- check always failed when called from the Edge Function's
-- service-role connection, which carries no "current user" JWT —
-- auth.uid() is NULL in that context regardless of who triggered the
-- request. The Edge Function already verifies the real caller is
-- admin (using their actual user id, not auth.uid()) before ever
-- calling this RPC, so the internal check here was both redundant
-- and broken. Removed entirely — this function is only ever reached
-- from that already-verified, trusted server context.
create or replace function public.list_all_students_for_migration()
returns table (
  user_id uuid,
  full_name text,
  phone text,
  username text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.phone, p.username
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'student';
$$;

-- No grant to 'authenticated' here on purpose: with the internal
-- admin check removed, granting client access would let any signed-in
-- student or supervisor call this directly and see every student's
-- phone number. The Edge Function's service-role connection bypasses
-- grants entirely regardless, so revoking client access doesn't
-- affect the only intended caller.
revoke all on function public.list_all_students_for_migration() from public, anon, authenticated;
