-- Early-return bookings (12:30/1:30/2:30 PM) now carry a mandatory
-- sector relative to Sidi Gaber, independent of the student's own
-- assigned route. Morning bookings never set this.
alter table public.bookings
  add column if not exists sector text
  check (sector in ('before_sidi_gaber', 'after_sidi_gaber'));
