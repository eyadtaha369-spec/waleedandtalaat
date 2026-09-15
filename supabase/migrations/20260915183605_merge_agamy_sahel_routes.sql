-- Merges "خط العجمي" and the stray, never-properly-seeded "خط الساحل"
-- (2 students found with this value, matching no real route at all)
-- into one unified route: "خط العجمي والساحل". Renaming the existing
-- routes row (rather than delete+recreate) preserves its id, seeded
-- stops, and whatsapp_group_link automatically.

update public.routes set name = 'خط العجمي والساحل' where name = 'خط العجمي';

update public.profiles
  set route = 'خط العجمي والساحل'
  where route in ('خط العجمي', 'خط الساحل', 'الساحل');

update public.profiles
  set assigned_route = 'خط العجمي والساحل'
  where assigned_route in ('خط العجمي', 'خط الساحل', 'الساحل');

update public.bookings
  set route = 'خط العجمي والساحل'
  where route in ('خط العجمي', 'خط الساحل', 'الساحل');

update public.daily_pass_requests
  set route = 'خط العجمي والساحل'
  where route in ('خط العجمي', 'خط الساحل', 'الساحل');
