-- =====================================================================
-- Locked, import-only profile photos
-- =====================================================================

-- handle_new_user now also accepts a photo_url from signup/import
-- metadata (the "4x6 صورة شخصية" field from the roster sheet).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, route, pickup_stop, photo_url, subscription_type, trips_total, trips_remaining)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'route',
    new.raw_user_meta_data->>'pickup_stop',
    new.raw_user_meta_data->>'photo_url',
    coalesce(new.raw_user_meta_data->>'subscription_type', 'full_term'),
    coalesce((new.raw_user_meta_data->>'trips_total')::int, 0),
    coalesce((new.raw_user_meta_data->>'trips_total')::int, 0)
  );
  insert into public.user_roles (user_id, role) values (new.id, 'student') on conflict do nothing;
  return new;
end;
$$;

-- Students can no longer upload/replace their own avatar — the photo
-- is set once at import time from the roster sheet and is read-only
-- from the student side. Keep public read (needed to display it on
-- boarding passes and the admin scanner).
drop policy if exists "users can upload their own avatar" on storage.objects;
drop policy if exists "users can update their own avatar" on storage.objects;
drop policy if exists "users can delete their own avatar" on storage.objects;
