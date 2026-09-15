/**
 * IRP / GSP e-Invoice provider layer (server-only).
 *
 * This is the ONLY place that is allowed to talk to a real e-Invoice provider.
 * The billing system never imports it directly — it goes through the server
 * functions in `src/lib/gst.functions.ts`.
 *
 * Today no authorised IRP/GSP is connected, so `NotConfiguredProvider` is used
 * and every call returns a clear, honest "not configured" failure. No dummy
 * IRNs, no simulated government connectivity.
 *
 * To connect a real provider later:
 *   1. Add the credentials as backend secrets (never in frontend code).
 *   2. Implement `EInvoiceProvider` in a new file next to this one.
 *   3. Return it from `getEInvoiceProvider()` when the secrets are present.
 * Nothing in the POS, invoices or UI needs to change.
 */

export interface EInvoiceGenerateResult {
  success: boolean;
  irn?: string;
  ackNo?: string;
  ackDate?: string;
  signedQr?: string;
  signedInvoice?: string;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: unknown;
}

export interface EInvoiceCancelResult {
  success: boolean;
  cancelDate?: string;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: unknown;
}

export interface EInvoiceProvider {
  readonly name: string;
  readonly configured: boolean;
  generate(payload: Record<string, unknown>): Promise<EInvoiceGenerateResult>;
  cancel(args: { irn: string; reasonCode: string; remark: string }): Promise<EInvoiceCancelResult>;
}

const NOT_CONFIGURED_MESSAGE =
  'e-Invoice provider is not connected yet. Connect an authorised IRP/GSP account to generate real IRNs. Your sale and invoice are unaffected.';

class NotConfiguredProvider implements EInvoiceProvider {
  readonly name = 'none';
  readonly configured = false;

  async generate(): Promise<EInvoiceGenerateResult> {
    return {
      success: false,
      errorCode: 'PROVIDER_NOT_CONFIGURED',
      errorMessage: NOT_CONFIGURED_MESSAGE,
    };
  }

  async cancel(): Promise<EInvoiceCancelResult> {
    return {
      success: false,
      errorCode: 'PROVIDER_NOT_CONFIGURED',
      errorMessage: NOT_CONFIGURED_MESSAGE,
    };
  }
}

/**
 * Resolve the active provider. Credentials are read from backend environment
 * secrets only, inside the handler — never bundled into frontend code.
 */
export function getEInvoiceProvider(): EInvoiceProvider {
  const baseUrl = process.env['EINVOICE_API_BASE_URL'];
  const clientId = process.env['EINVOICE_CLIENT_ID'];
  const clientSecret = process.env['EINVOICE_CLIENT_SECRET'];

  if (baseUrl && clientId && clientSecret) {
    // A real GSP implementation plugs in here once credentials exist.
    // Until an authorised integration is written and certified we still refuse
    // rather than fabricate a response.
    return new NotConfiguredProvider();
  }

  return new NotConfiguredProvider();
}
