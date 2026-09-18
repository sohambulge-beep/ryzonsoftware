# GST Compliance Corrections Before Phase 2

This update is limited to the GST and e-Invoice functionality. The existing POS, billing flow, inventory behavior, staff, customers, reports, and all other screens remain unchanged.

## What will change

### 1. Clearly separate saving from government filing
- Replace the phrase suggesting invoices “can be filed” with precise wording: completed GST sales are saved in TapTrack for records and future API submission.
- Add a clear note that saving, printing, or syncing a tax invoice does not file a GST return and does not submit anything to GSTN/IRP.

### 2. Replace the turnover toggle with a configurable applicability assessment
- Keep GST Billing ON/OFF separate from e-Invoice applicability.
- Replace the current simple applicability checkbox with configurable statuses: **Needs Review**, **Applicable**, **Not Applicable**, and **Exempt**.
- Capture the basis for that decision: turnover threshold crossed in a relevant financial year, supplier exemption category, exemption notes, and the date the assessment was confirmed.
- Keep the notified threshold and rule reference configurable rather than embedding them permanently in invoice calculations.
- Treat the result as a business-configured compliance assessment, not legal advice or an automatic legal determination.
- Determine each invoice from the configured business assessment plus its customer/supply type. B2C remains non-IRN; registered B2B, export, SEZ, and applicable government supplies can become e-Invoice candidates. Exempt or unconfirmed businesses remain **Not Required** rather than being auto-marked Pending.
- Stop comparing each invoice total with the business turnover threshold; aggregate-turnover applicability and invoice value are different concepts.

### 3. Remove universal item-tax assumptions
- Change the unused default GST rate from an automatic 5% to **Not set**; no HSN/SAC or GST rate will be silently assumed.
- Preserve configurable business defaults as an optional convenience only after the user explicitly sets them.
- Keep every item’s HSN/SAC and GST rate independently editable.
- Replace the bare `22030000` example with neutral guidance that does not imply it is correct for every item.
- If an e-Invoice candidate has an unset HSN/SAC or GST rate, keep the sale completed but mark the record as needing correction and prevent API submission.

### 4. Make connection state unmistakable
- Continue showing **e-Invoice Ready** for prepared records.
- Add a persistent **API Not Connected** status in GST Settings and the GST invoice screen until a real authorised provider is implemented.
- Disable Generate/Retry and Cancel API actions while disconnected, with a short explanation; normal sales remain unaffected.

### 5. Enforce real-response-only government identifiers
- Keep the current no-provider implementation, which always fails safely and returns no government identifiers.
- Add server-side validation so an invoice can be marked **Generated** only when a connected authorised provider returns a non-empty IRN, acknowledgement number/date, and signed QR payload.
- Reject incomplete or malformed “success” responses, record the error securely, and never populate placeholder IRNs, acknowledgement numbers, QR data, or government responses.

## Data changes

- Add GST-setting fields for applicability status, turnover-crossed confirmation, exemption category/notes, assessment date, configurable rule threshold/reference, and explicit tax-default confirmation.
- Change the database default GST rate to unset for future settings records.
- Preserve all existing GST invoices, tax breakdowns, and audit logs.
- Keep row-level access rules and grants unchanged except for access to the new columns on the existing GST settings table.

## Verification

- Check all GST-facing wording for “filed,” “submitted,” and similar government-filing implications.
- Test applicability outcomes for B2C, B2B, Export, SEZ, Government, exempt, and needs-review configurations.
- Confirm missing item tax details never block the sale but do block e-Invoice submission.
- Confirm disconnected mode cannot generate or cancel an IRN and cannot write fake government identifiers.
- Confirm existing POS, ordinary billing, staff, customer, inventory, reports, and non-GST receipt behavior remain unchanged.
