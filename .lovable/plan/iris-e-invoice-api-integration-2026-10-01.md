# IRIS e-Invoice API Integration

## Goal
Add a sandbox-first, server-only IRIS IRP/GSP integration to the existing GST module. Reuse the current invoices, items, settings, statuses, invoice design, retry flow, and audit log. Keep every existing non-GST feature and navigation unchanged.

## What will be built

### 1. Secure IRIS provider layer
- Replace the current disconnected provider stub with an IRIS adapter behind the existing provider interface.
- Support explicit `sandbox` and `production` environments; default to sandbox and never switch automatically.
- Read the IRIS Client ID, Client Secret, Portal ID, base URLs, and any additional IRIS-issued values only from encrypted backend secrets.
- Keep credentials, access tokens, and authorization material out of browser code, database rows visible to users, responses, and audit logs.
- Do not guess undocumented IRIS endpoints or response fields; wire only contracts confirmed by official IRIS documentation.

### 2. Connection and taxpayer authorization
- Add authenticated server actions for connection status, Test Connection, GSTIN authorization/onboarding, authorization refresh, and GSTIN validation.
- Track connection environment, provider name, connection result, last successful connection, and taxpayer authorization status: Not Connected, Pending Authorization, Authorized, Failed, or Revoked.
- Store only non-secret returned taxpayer/business details and safe provider references.
- Require a real successful IRIS response before showing Connected or Authorized.

### 3. Safe generation, retries, and cancellation
- Keep the existing official payload builder and complete it only where IRIS requires verified fields already available in GST settings/invoices.
- Re-check applicability, seller/buyer GSTINs, line HSN/SAC, and confirmed GST rates on the server before submission.
- Add a database-backed submission claim and stable idempotency/document key so concurrent clicks or retries cannot submit the same document twice.
- Do not call IRIS for non-applicable sales; retain Not Required.
- Mark Generated only after a complete genuine response containing IRN, Ack No, Ack Date, and signed QR data.
- Mark Failed and retain the sale on provider/network errors; reuse the existing Retry action.
- Cancel only an existing genuine IRN and update local status only after IRIS confirms cancellation.

### 4. Audit and database additions
- Add provider/environment, request lifecycle status, safe provider request ID, document/idempotency key, payload hash, GSTIN, IRN, acknowledgement data, retry number, request/response timestamps, and sanitized error fields to the existing audit structure.
- Add a provider-connection/authorization table keyed to the signed-in business owner; it stores status and safe metadata only, never credentials or tokens.
- Add database functions for atomic generation/cancellation claims and release/finalization to prevent duplicate submissions.
- Preserve all current GST tables and columns; changes are additive with grants and row-level security.

### 5. Existing GST screen additions
- Keep the current invoice and settings design.
- Make the current API status dynamic: API Not Connected, Sandbox Connected, or Production Connected.
- Add Test Connection, authorization state, GSTIN validation result, last successful connection, and clear sandbox/production labels inside the existing Connect e-Invoice API section.
- Enable Generate/Retry/Cancel only from real server-reported connection and authorization state, not a frontend constant.
- Continue showing IRN, acknowledgement, QR data, and status only when genuine values exist.

## Technical details
- Use authenticated TanStack server functions for all app actions; no public credential or submission endpoint.
- Keep the existing authenticated bearer middleware and user-scoped database access.
- Provider calls use `fetch` from server-only files with timeouts, response-shape validation, sanitized errors, and no secret logging.
- Access tokens remain server-only; if IRIS requires reusable short-lived tokens, store them encrypted/server-side or obtain them per provider guidance—never expose them to the client.
- The existing invoice sale remains authoritative and unaffected by all IRIS failures.

## Validation
- Verify disconnected behavior with no secrets: status remains API Not Connected and no submission occurs.
- Verify sandbox credential, authorization, GSTIN-validation, generation, duplicate/retry, cancellation, and sanitized audit paths against IRIS once credentials are supplied.
- Verify malformed/incomplete provider responses never save identifiers or mark success.
- Verify the GST invoice view and all existing POS, Sales, Inventory, Staff, Customers, Reports, and Expenses screens remain unchanged.

## Required external setup
- IRIS sandbox account access and official API documentation/endpoint contract.
- IRIS-issued sandbox Client ID, Client Secret, Portal ID, and any required GSTIN onboarding credentials entered through the secure secret form after the server architecture is ready.
- Production remains blocked until separate real production credentials are explicitly configured and tested.
