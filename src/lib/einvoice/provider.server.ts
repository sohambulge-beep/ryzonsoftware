/**
 * IRP / GSP e-Invoice provider layer (server-only).
 *
 * This is the ONLY place that is allowed to talk to a real e-Invoice provider.
 * The billing system never imports it directly — it goes through the server
 * functions in `src/lib/gst.functions.ts`.
 *
 * IRIS is selected only when all environment-specific credentials and public
 * encryption key material are present. Otherwise every call fails closed with
 * a clear "not configured" result. No dummy IRNs or simulated connectivity.
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
  providerRequestId?: string;
}

export interface EInvoiceCancelResult {
  success: boolean;
  cancelDate?: string;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: unknown;
  providerRequestId?: string;
}

export type EInvoiceEnvironment = 'sandbox' | 'production';
export interface EInvoiceConnectionResult { success: boolean; httpStatus?: number; errorCode?: string; errorMessage?: string }
export interface EInvoiceGstinResult extends EInvoiceConnectionResult { details?: Record<string, unknown>; rawResponse?: unknown }

export interface EInvoiceProvider {
  readonly name: string;
  readonly configured: boolean;
  readonly environment: EInvoiceEnvironment;
  testConnection(): Promise<EInvoiceConnectionResult>;
  validateGstin(gstin: string): Promise<EInvoiceGstinResult>;
  generate(payload: Record<string, unknown>, documentKey: string): Promise<EInvoiceGenerateResult>;
  cancel(args: { irn: string; reasonCode: string; remark: string }): Promise<EInvoiceCancelResult>;
}

const NOT_CONFIGURED_MESSAGE =
  'e-Invoice provider is not connected yet. Connect an authorised IRP/GSP account to generate real IRNs. Your sale and invoice are unaffected.';

class NotConfiguredProvider implements EInvoiceProvider {
  readonly name = 'none';
  readonly configured = false;
  readonly environment: EInvoiceEnvironment;

  constructor(environment: EInvoiceEnvironment) { this.environment = environment; }

  async testConnection(): Promise<EInvoiceConnectionResult> {
    return { success: false, errorCode: 'PROVIDER_NOT_CONFIGURED', errorMessage: NOT_CONFIGURED_MESSAGE };
  }

  async validateGstin(): Promise<EInvoiceGstinResult> {
    return { success: false, errorCode: 'PROVIDER_NOT_CONFIGURED', errorMessage: NOT_CONFIGURED_MESSAGE };
  }

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
export async function getEInvoiceProvider(environment: EInvoiceEnvironment, gstin: string): Promise<EInvoiceProvider> {
  const { getIrisConfig, IrisProvider } = await import('@/lib/einvoice/providers/iris.server');
  const config = getIrisConfig(environment, gstin);
  return config ? new IrisProvider(config) : new NotConfiguredProvider(environment);
}
