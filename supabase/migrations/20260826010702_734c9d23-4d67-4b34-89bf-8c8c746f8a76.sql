CREATE TYPE public.app_role AS ENUM ('admin','supervisor','student');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  username text UNIQUE,
  phone text,
  route text,
  pickup_stop text,
  subscription_type text NOT NULL DEFAULT 'full_term',
  trips_total integer NOT NULL DEFAULT 0,
  trips_remaining integer NOT NULL DEFAULT 0,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'));
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid())) WITH CHECK (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "staff delete profiles" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('morning','return')),
  slot text NOT NULL,
  pickup_stop text,
  route text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, service_date, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings read" ON public.bookings FOR SELECT TO authenticated USING (student_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "bookings insert" ON public.bookings FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "bookings update" ON public.bookings FOR UPDATE TO authenticated USING (student_id = auth.uid() OR public.is_staff(auth.uid())) WITH CHECK (student_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "bookings delete" ON public.bookings FOR DELETE TO authenticated USING (student_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TABLE public.opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, service_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opt_outs TO authenticated;
GRANT ALL ON public.opt_outs TO service_role;
ALTER TABLE public.opt_outs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "optouts read" ON public.opt_outs FOR SELECT TO authenticated USING (student_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "optouts insert" ON public.opt_outs FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "optouts delete" ON public.opt_outs FOR DELETE TO authenticated USING (student_id = auth.uid());

CREATE TABLE public.scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scanned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  service_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Cairo')::date,
  slot text,
  scanned_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.scans TO authenticated;
GRANT ALL ON public.scans TO service_role;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scans read" ON public.scans FOR SELECT TO authenticated USING (student_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "scans insert" ON public.scans FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.daily_pass_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  route text NOT NULL,
  slot text NOT NULL,
  service_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Cairo')::date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.daily_pass_requests TO anon, authenticated;
GRANT SELECT, UPDATE ON public.daily_pass_requests TO authenticated;
GRANT ALL ON public.daily_pass_requests TO service_role;
ALTER TABLE public.daily_pass_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can request" ON public.daily_pass_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "staff read requests" ON public.daily_pass_requests FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff update requests" ON public.daily_pass_requests FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, route, pickup_stop, subscription_type, trips_total, trips_remaining)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'route',
    NEW.raw_user_meta_data->>'pickup_stop',
    COALESCE(NEW.raw_user_meta_data->>'subscription_type','full_term'),
    COALESCE((NEW.raw_user_meta_data->>'trips_total')::int, 0),
    COALESCE((NEW.raw_user_meta_data->>'trips_total')::int, 0)
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();