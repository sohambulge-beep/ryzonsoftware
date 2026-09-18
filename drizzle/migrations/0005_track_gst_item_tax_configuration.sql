ALTER TABLE public.gst_invoice_items
  ADD COLUMN gst_rate_configured boolean NOT NULL DEFAULT false;

ALTER TABLE public.gst_invoices
  ADD COLUMN einvoice_validation_error text;