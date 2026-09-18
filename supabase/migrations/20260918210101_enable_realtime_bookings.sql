-- Required for ManifestsPanel's live-updating slot-totals
-- subscription (added in the previous migration) to actually receive
-- postgres_changes events — a channel subscription silently receives
-- nothing for a table that isn't in this publication, no error either
-- way. Guarded with a check since ALTER PUBLICATION ... ADD TABLE
-- fails outright if the table is already a member (unlike a plain
-- CREATE, there's no IF NOT EXISTS form for this).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'opt_outs'
  ) then
    alter publication supabase_realtime add table public.opt_outs;
  end if;
end $$;
