ALTER TABLE public.gst_settings
  ADD COLUMN einvoice_applicability_status text NOT NULL DEFAULT 'needs_review',
  ADD COLUMN turnover_threshold_crossed boolean NOT NULL DEFAULT false,
  ADD COLUMN supplier_exemption_category text NOT NULL DEFAULT 'none',
  ADD COLUMN exemption_notes text NOT NULL DEFAULT '',
  ADD COLUMN applicability_assessed_at timestamptz,
  ADD COLUMN applicability_rule_threshold numeric NOT NULL DEFAULT 50000000,
  ADD COLUMN applicability_rule_reference text NOT NULL DEFAULT 'Notification 10/2023-Central Tax; verify current rules',
  ADD COLUMN default_tax_confirmed boolean NOT NULL DEFAULT false;

ALTER TABLE public.gst_settings
  ALTER COLUMN default_gst_rate SET DEFAULT 0;

ALTER TABLE public.gst_settings
  ADD CONSTRAINT gst_settings_applicability_status_check
    CHECK (einvoice_applicability_status IN ('needs_review', 'applicable', 'not_applicable', 'exempt')),
  ADD CONSTRAINT gst_settings_exemption_category_check
    CHECK (supplier_exemption_category IN ('none', 'bank_insurer_financial_institution', 'gta', 'passenger_transport', 'cinema_admission', 'sez_unit', 'government_local_authority', 'oidar_rule_14', 'other')),
  ADD CONSTRAINT gst_settings_rule_threshold_nonnegative_check
    CHECK (applicability_rule_threshold >= 0);