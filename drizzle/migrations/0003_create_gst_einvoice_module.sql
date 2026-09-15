-- GST & e-Invoice module

CREATE TYPE public.einvoice_status AS ENUM ('not_required','pending','generated','failed','cancelled');

CREATE TABLE public.gst_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() UNIQUE,
  legal_name text NOT NULL DEFAULT '',
  trade_name text NOT NULL DEFAULT '',
  gstin text NOT NULL DEFAULT '',
  state_name text NOT NULL DEFAULT '',
  state_code text NOT NULL DEFAULT '',
  address_line1 text NOT NULL DEFAULT '',
  address_line2 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  pincode text NOT NULL DEFAULT '',
  place_of_supply text NOT NULL DEFAULT '',
  gst_enabled boolean NOT NULL DEFAULT false,
  einvoice_applicable boolean NOT NULL DEFAULT false,
  einvoice_mode text NOT NULL DEFAULT 'off',
  einvoice_threshold numeric NOT NULL DEFAULT 0,
  default_hsn text NOT NULL DEFAULT '',
  default_gst_rate numeric NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gst_settings TO authenticated;
GRANT ALL ON public.gst_settings TO service_role;
ALTER TABLE public.gst_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own gst settings select" ON public.gst_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own gst settings insert" ON public.gst_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own gst settings update" ON public.gst_settings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER gst_settings_set_updated_at BEFORE UPDATE ON public.gst_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.gst_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  local_invoice_id text NOT NULL,
  invoice_no text NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  invoice_timestamp timestamptz NOT NULL DEFAULT now(),
  supply_type text NOT NULL DEFAULT 'B2C',
  is_interstate boolean NOT NULL DEFAULT false,
  seller_gstin text NOT NULL DEFAULT '',
  seller_legal_name text NOT NULL DEFAULT '',
  seller_state_code text NOT NULL DEFAULT '',
  buyer_name text NOT NULL DEFAULT '',
  buyer_gstin text NOT NULL DEFAULT '',
  buyer_address text NOT NULL DEFAULT '',
  buyer_state_code text NOT NULL DEFAULT '',
  place_of_supply text NOT NULL DEFAULT '',
  taxable_total numeric NOT NULL DEFAULT 0,
  cgst_total numeric NOT NULL DEFAULT 0,
  sgst_total numeric NOT NULL DEFAULT 0,
  igst_total numeric NOT NULL DEFAULT 0,
  cess_total numeric NOT NULL DEFAULT 0,
  tax_total numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  einvoice_status public.einvoice_status NOT NULL DEFAULT 'not_required',
  einvoice_required boolean NOT NULL DEFAULT false,
  irn text,
  ack_no text,
  ack_date timestamptz,
  signed_qr text,
  signed_invoice text,
  cancel_reason text,
  cancel_remark text,
  cancelled_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error_message text,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, local_invoice_id)
);

CREATE INDEX gst_invoices_user_created_idx ON public.gst_invoices (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gst_invoices TO authenticated;
GRANT ALL ON public.gst_invoices TO service_role;
ALTER TABLE public.gst_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own gst invoices select" ON public.gst_invoices FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own gst invoices insert" ON public.gst_invoices FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own gst invoices update" ON public.gst_invoices FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own gst invoices delete" ON public.gst_invoices FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER gst_invoices_set_updated_at BEFORE UPDATE ON public.gst_invoices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.gst_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  gst_invoice_id uuid NOT NULL REFERENCES public.gst_invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  hsn_sac text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'NOS',
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  taxable_value numeric NOT NULL DEFAULT 0,
  gst_rate numeric NOT NULL DEFAULT 0,
  cgst_amount numeric NOT NULL DEFAULT 0,
  sgst_amount numeric NOT NULL DEFAULT 0,
  igst_amount numeric NOT NULL DEFAULT 0,
  cess_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gst_invoice_items_invoice_idx ON public.gst_invoice_items (gst_invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gst_invoice_items TO authenticated;
GRANT ALL ON public.gst_invoice_items TO service_role;
ALTER TABLE public.gst_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own gst items select" ON public.gst_invoice_items FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own gst items insert" ON public.gst_invoice_items FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own gst items update" ON public.gst_invoice_items FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own gst items delete" ON public.gst_invoice_items FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.gst_einvoice_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  gst_invoice_id uuid REFERENCES public.gst_invoices(id) ON DELETE CASCADE,
  action text NOT NULL,
  provider text NOT NULL DEFAULT 'none',
  http_status integer,
  success boolean NOT NULL DEFAULT false,
  request_payload jsonb,
  response_payload jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gst_einvoice_logs_invoice_idx ON public.gst_einvoice_logs (gst_invoice_id, created_at DESC);

GRANT SELECT ON public.gst_einvoice_logs TO authenticated;
GRANT ALL ON public.gst_einvoice_logs TO service_role;
ALTER TABLE public.gst_einvoice_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own einvoice logs select" ON public.gst_einvoice_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
