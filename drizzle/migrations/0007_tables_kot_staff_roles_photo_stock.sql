-- Tables & KOT
CREATE TABLE IF NOT EXISTS public.dining_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  seats integer NOT NULL DEFAULT 4,
  status text NOT NULL DEFAULT 'Free' CHECK (status IN ('Free','Occupied','Bill Pending')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dining_tables TO authenticated;
GRANT ALL ON public.dining_tables TO service_role;
ALTER TABLE public.dining_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dining_tables" ON public.dining_tables FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.table_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.dining_tables(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Billed','Cancelled')),
  invoice_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz NOT NULL DEFAULT now(),
  billed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS table_orders_one_open ON public.table_orders(table_id) WHERE status = 'Open';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_orders TO authenticated;
GRANT ALL ON public.table_orders TO service_role;
ALTER TABLE public.table_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own table_orders" ON public.table_orders FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.kot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.table_orders(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.dining_tables(id) ON DELETE CASCADE,
  kot_no integer NOT NULL,
  type text NOT NULL CHECK (type IN ('New','Add','Cancel')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kot TO authenticated;
GRANT ALL ON public.kot TO service_role;
ALTER TABLE public.kot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own kot" ON public.kot FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.next_kot_no(p_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(MAX(kot_no), 0) + 1 FROM public.kot WHERE user_id = p_user_id AND user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.next_kot_no(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_kot_no(uuid) TO authenticated, service_role;

-- Staff roles
CREATE TABLE IF NOT EXISTS public.staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'waiter' CHECK (role IN ('owner','manager','cashier','waiter')),
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_owner_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_roles TO authenticated;
GRANT ALL ON public.staff_roles TO service_role;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff see own role" ON public.staff_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR business_owner_id = auth.uid());
CREATE POLICY "owner inserts roles" ON public.staff_roles FOR INSERT TO authenticated
  WITH CHECK (business_owner_id = auth.uid() AND (user_id <> auth.uid() OR role = 'owner'));
CREATE POLICY "owner updates roles" ON public.staff_roles FOR UPDATE TO authenticated
  USING (business_owner_id = auth.uid()) WITH CHECK (business_owner_id = auth.uid());
CREATE POLICY "owner deletes roles" ON public.staff_roles FOR DELETE TO authenticated
  USING (business_owner_id = auth.uid() AND user_id <> auth.uid());

-- Photo stock (product_id kept as plain text: there is no products table; items live in the app store)
CREATE TABLE IF NOT EXISTS public.stock_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_path text NOT NULL,
  photo_hash text NOT NULL,
  status varchar(20) DEFAULT 'processed',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_user_photo_hash UNIQUE (user_id, photo_hash)
);
CREATE TABLE IF NOT EXISTS public.photo_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text,
  quantity_change numeric NOT NULL,
  type varchar(50) DEFAULT 'purchase',
  source varchar(50) DEFAULT 'photo_scan',
  photo_id uuid REFERENCES public.stock_photos(id) ON DELETE SET NULL,
  notes text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_photos TO authenticated;
GRANT ALL ON public.stock_photos TO service_role;
GRANT SELECT, INSERT ON public.photo_stock_movements TO authenticated;
GRANT ALL ON public.photo_stock_movements TO service_role;
ALTER TABLE public.stock_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own stock_photos" ON public.stock_photos FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own stock_photos" ON public.stock_photos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can view own photo_stock_movements" ON public.photo_stock_movements FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own photo_stock_movements" ON public.photo_stock_movements FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());