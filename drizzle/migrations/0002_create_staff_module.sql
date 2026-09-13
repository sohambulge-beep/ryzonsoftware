-- Roles -------------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('owner', 'manager', 'staff');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

-- Effective role: defaults to owner when the account has no explicit role yet.
CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::text FROM public.user_roles
      WHERE user_id = auth.uid()
      ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END
      LIMIT 1),
    'owner'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_role_name() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_role_name() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_role_name() = 'owner';
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_role_name() IN ('owner', 'manager');
$$;

REVOKE EXECUTE ON FUNCTION public.is_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_manager_or_owner() TO authenticated, service_role;

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_manager_or_owner());

-- Staff --------------------------------------------------------------------
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT,
  role public.app_role NOT NULL DEFAULT 'staff',
  photo_url TEXT,
  joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX staff_owner_idx ON public.staff(owner_id);
CREATE INDEX staff_user_idx ON public.staff(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER staff_set_updated_at BEFORE UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.my_staff_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.my_staff_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_staff_id() TO authenticated, service_role;

CREATE POLICY "View staff" ON public.staff FOR SELECT TO authenticated
  USING (public.is_manager_or_owner() OR user_id = auth.uid());
CREATE POLICY "Owners insert staff" ON public.staff FOR INSERT TO authenticated
  WITH CHECK (public.is_owner() AND owner_id = auth.uid());
CREATE POLICY "Managers and owners update staff" ON public.staff FOR UPDATE TO authenticated
  USING (public.is_manager_or_owner()) WITH CHECK (public.is_manager_or_owner());
CREATE POLICY "Owners delete staff" ON public.staff FOR DELETE TO authenticated
  USING (public.is_owner());

-- Attendance ---------------------------------------------------------------
CREATE TABLE public.staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, work_date)
);

CREATE INDEX staff_attendance_date_idx ON public.staff_attendance(work_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance TO authenticated;
GRANT ALL ON public.staff_attendance TO service_role;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER staff_attendance_set_updated_at BEFORE UPDATE ON public.staff_attendance
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "View attendance" ON public.staff_attendance FOR SELECT TO authenticated
  USING (public.is_manager_or_owner() OR staff_id = public.my_staff_id());
CREATE POLICY "Insert attendance" ON public.staff_attendance FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_owner() OR staff_id = public.my_staff_id());
CREATE POLICY "Update attendance" ON public.staff_attendance FOR UPDATE TO authenticated
  USING (public.is_manager_or_owner() OR staff_id = public.my_staff_id())
  WITH CHECK (public.is_manager_or_owner() OR staff_id = public.my_staff_id());
CREATE POLICY "Owners delete attendance" ON public.staff_attendance FOR DELETE TO authenticated
  USING (public.is_owner());

-- Shifts -------------------------------------------------------------------
CREATE TABLE public.staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  weekday SMALLINT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  is_off BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, week_start, weekday)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_shifts TO authenticated;
GRANT ALL ON public.staff_shifts TO service_role;
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER staff_shifts_set_updated_at BEFORE UPDATE ON public.staff_shifts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "View shifts" ON public.staff_shifts FOR SELECT TO authenticated
  USING (public.is_manager_or_owner() OR staff_id = public.my_staff_id());
CREATE POLICY "Managers write shifts" ON public.staff_shifts FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_owner());
CREATE POLICY "Managers update shifts" ON public.staff_shifts FOR UPDATE TO authenticated
  USING (public.is_manager_or_owner()) WITH CHECK (public.is_manager_or_owner());
CREATE POLICY "Managers delete shifts" ON public.staff_shifts FOR DELETE TO authenticated
  USING (public.is_manager_or_owner());

-- Salary -------------------------------------------------------------------
CREATE TABLE public.staff_salary_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  period_month TEXT NOT NULL,
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  earned NUMERIC(12,2) NOT NULL DEFAULT 0,
  advance NUMERIC(12,2) NOT NULL DEFAULT 0,
  deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_payable NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  payment_method TEXT,
  paid_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, period_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_salary_payments TO authenticated;
GRANT ALL ON public.staff_salary_payments TO service_role;
ALTER TABLE public.staff_salary_payments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER staff_salary_set_updated_at BEFORE UPDATE ON public.staff_salary_payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "View salary" ON public.staff_salary_payments FOR SELECT TO authenticated
  USING (public.is_owner() OR staff_id = public.my_staff_id());
CREATE POLICY "Owners insert salary" ON public.staff_salary_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());
CREATE POLICY "Owners update salary" ON public.staff_salary_payments FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY "Owners delete salary" ON public.staff_salary_payments FOR DELETE TO authenticated
  USING (public.is_owner());

-- Activity log --------------------------------------------------------------
CREATE TABLE public.staff_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID DEFAULT auth.uid(),
  actor_name TEXT,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX staff_activity_created_idx ON public.staff_activity_log(created_at DESC);

GRANT SELECT, INSERT ON public.staff_activity_log TO authenticated;
GRANT ALL ON public.staff_activity_log TO service_role;
ALTER TABLE public.staff_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View activity" ON public.staff_activity_log FOR SELECT TO authenticated
  USING (public.is_manager_or_owner() OR staff_id = public.my_staff_id());
CREATE POLICY "Insert activity" ON public.staff_activity_log FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

-- Approvals -----------------------------------------------------------------
CREATE TABLE public.staff_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID DEFAULT auth.uid(),
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  amount NUMERIC(12,2),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_approval_requests TO authenticated;
GRANT ALL ON public.staff_approval_requests TO service_role;
ALTER TABLE public.staff_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER staff_approval_set_updated_at BEFORE UPDATE ON public.staff_approval_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "View approvals" ON public.staff_approval_requests FOR SELECT TO authenticated
  USING (public.is_manager_or_owner() OR requested_by = auth.uid() OR staff_id = public.my_staff_id());
CREATE POLICY "Create approvals" ON public.staff_approval_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());
CREATE POLICY "Review approvals" ON public.staff_approval_requests FOR UPDATE TO authenticated
  USING (public.is_manager_or_owner()) WITH CHECK (public.is_manager_or_owner());
CREATE POLICY "Owners delete approvals" ON public.staff_approval_requests FOR DELETE TO authenticated
  USING (public.is_owner());
