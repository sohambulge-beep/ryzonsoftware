# GST & e-Invoice Ready Module

A new, self-contained GST module added alongside the existing billing system. Nothing currently working is changed, removed or restyled — the POS, tabs, receipts, insights and staff screens keep behaving exactly as today.

## What you get

**1. GST details in Settings**
A new "GST & e-Invoice" section in Settings: business legal name, GSTIN, state and state code, address, place of supply, whether GST billing is switched on, and whether e-invoicing is legally applicable for the business (with the turnover threshold as a note). Also an e-invoice mode toggle: Off / Ready (structure only, no live government connection).

**2. Customer GST billing details**
The customer form gains optional GSTIN, legal/trade name, billing address, state and state code. Existing customers keep working with these blank.

**3. HSN/SAC and GST rate per item**
Each beer/item gets an HSN or SAC code and a GST rate (0/5/12/18/28 plus custom), with a default HSN and default rate in Settings used when an item has none.

**4. Automatic CGST/SGST/IGST**
At billing time the system compares your state code with the place of supply: same state splits tax into CGST + SGST, different state charges IGST. Per-line taxable value, rate and tax amounts are computed and rolled up into invoice totals. When GST billing is off, the current simple tax rate keeps working untouched.

**5. Proper tax invoice**
The receipt view gains a full tax-invoice layout when GST is on: seller GSTIN and address, buyer GSTIN and address, place of supply, invoice number and date, per-line HSN/qty/rate/taxable value/CGST/SGST/IGST, rate-wise tax summary, total taxable amount, total tax, grand total, and the IRN / Ack No / Ack Date / signed QR block once available. Non-GST sales keep the existing simple receipt.

**6. e-Invoice status and actions**
Every invoice carries a status: Not Required / Pending / Generated / Failed / Cancelled. A new "GST & e-Invoice" screen lists invoices with status filters, and shows a **Generate e-Invoice** action only where it is legally applicable (GST on, e-invoicing applicable, B2B buyer with GSTIN, above threshold, not already generated). A **Cancel IRN** action appears for generated invoices within the 24-hour window. Every action shows loading, a clear error message and a Retry button — a failure never blocks the sale, which stays completed and collectible.

**7. Stored securely, no fake data**
IRN, Ack No, Ack Date, signed QR, signed invoice payload, error codes/messages, attempt count and full request/response history are stored in the backend under your account only. No dummy IRNs and no fake government connectivity: with no IRP/GSP credentials configured, the Generate action returns a clear "e-Invoice provider not configured" result and marks nothing as generated.

**8. Future IRP/GSP integration, cleanly separated**
A backend service layer with a provider interface (generate, cancel, status) sits behind the billing system. A "not configured" provider ships now; connecting a real GSP later means adding credentials and one provider file — no changes to billing, POS or the UI. Credentials live only in backend secrets, never in the app's frontend code.

## Technical notes

- **New tables** (Lovable Cloud, RLS scoped to the owner, GRANTs included):
  - `gst_settings` — one row per user: legal name, GSTIN, state code, address, place of supply, gst_enabled, einvoice_applicable, default HSN, default rate, provider mode.
  - `gst_invoices` — one row per GST invoice: local invoice id + invoice no, date, buyer GSTIN/name/address/state, supply type (B2B/B2C), intra/inter state, taxable total, cgst/sgst/igst/cess totals, grand total, `einvoice_status` enum (`not_required|pending|generated|failed|cancelled`), irn, ack_no, ack_date, signed_qr, signed_invoice, cancel_reason/date, attempt_count, last_error_code/message.
  - `gst_invoice_items` — per line: description, hsn_sac, qty, unit, unit price, discount, taxable value, gst rate, cgst/sgst/igst amounts, line total.
  - `gst_einvoice_logs` — append-only audit: invoice id, action (generate/cancel), request payload, response payload, http status, error, created_at. Readable by the owner; written server-side only.
- **Item/customer GST fields** stay on the existing local `Tap`/`Customer`/`Settings` shapes in `src/types.ts` (optional fields, defaulted) so nothing existing breaks; GST invoice records are pushed to the backend at checkout when GST billing is on.
- **New code**:
  - `src/lib/gst.ts` — pure calculation helpers (line tax split, rate-wise summary, applicability check). No UI, fully testable.
  - `src/lib/gst.functions.ts` — server functions (`saveGstSettings`, `getGstSettings`, `recordGstInvoice`, `generateEInvoice`, `cancelEInvoice`, `listGstInvoices`) with `requireSupabaseAuth`.
  - `src/lib/einvoice/provider.server.ts` — provider interface + `NotConfiguredProvider`; `src/lib/einvoice/payload.server.ts` — builds the standard IRP JSON schema (Version 1.1) from a stored invoice, ready for a real GSP.
  - `src/views/GstView.tsx` + new `gst` entry in `ViewId`, sidebar, and the TopBar title map; `src/hooks/useGst.ts` for queries/mutations.
  - Extensions (additive only): `SettingsView` GST section, `CustomerModal` GST fields, `BeerModal` HSN + rate, `InvoiceViewModal` tax-invoice layout, POS totals using the GST engine when enabled.
- **Gating**: GST module follows the existing plan system; it is available to all plans (compliance is not an upsell) unless you prefer it Pro+ — say the word and it gets `FEATURE_REQUIREMENT.gst = 'pro'`.
