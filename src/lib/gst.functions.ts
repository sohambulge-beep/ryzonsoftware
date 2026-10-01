import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

type EInvoiceEnvironment = 'sandbox' | 'production';

function sanitizeProviderError(message: string | undefined): string {
  const safe = (message ?? 'The e-Invoice provider request failed.').replace(/[\r\n]+/g, ' ').trim();
  return safe.slice(0, 500);
}

function readText(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Shapes exchanged with the client. Kept plain so they serialise cleanly. */
export interface GstSettingsInput {
  legalName: string;
  tradeName: string;
  gstin: string;
  stateName: string;
  stateCode: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pincode: string;
  placeOfSupply: string;
  gstEnabled: boolean;
  einvoiceApplicable: boolean;
  einvoiceApplicabilityStatus: 'needs_review' | 'applicable' | 'not_applicable' | 'exempt';
  turnoverThresholdCrossed: boolean;
  supplierExemptionCategory: string;
  exemptionNotes: string;
  applicabilityAssessedAt: string | null;
  applicabilityRuleThreshold: number;
  applicabilityRuleReference: string;
  einvoiceMode: 'off' | 'ready';
  einvoiceThreshold: number;
  defaultHsn: string;
  defaultGstRate: number;
  defaultTaxConfirmed: boolean;
}

export interface RecordGstInvoiceInput {
  localInvoiceId: string;
  invoiceNo: string;
  invoiceTimestamp: string;
  supplyType: 'B2B' | 'B2C' | 'EXPORT' | 'SEZ' | 'GOVT';
  isInterstate: boolean;
  sellerGstin: string;
  sellerLegalName: string;
  sellerStateCode: string;
  buyerName: string;
  buyerGstin: string;
  buyerAddress: string;
  buyerStateCode: string;
  placeOfSupply: string;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  cessTotal: number;
  taxTotal: number;
  grandTotal: number;
  einvoiceRequired: boolean;
  items: {
    lineNo: number;
    description: string;
    hsnSac: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxableValue: number;
    gstRate: number;
    gstRateConfigured: boolean;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    cessAmount: number;
    lineTotal: number;
  }[];
}

export const getGstSettings = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('gst_settings')
      .select('*')
      .eq('user_id', context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const saveGstSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GstSettingsInput) => input)
  .handler(async ({ data, context }) => {
    const row = {
      user_id: context.userId,
      legal_name: data.legalName,
      trade_name: data.tradeName,
      gstin: data.gstin.trim().toUpperCase(),
      state_name: data.stateName,
      state_code: data.stateCode,
      address_line1: data.addressLine1,
      address_line2: data.addressLine2,
      city: data.city,
      pincode: data.pincode,
      place_of_supply: data.placeOfSupply,
      gst_enabled: data.gstEnabled,
      einvoice_applicable: data.einvoiceApplicable,
      einvoice_applicability_status: data.einvoiceApplicabilityStatus,
      turnover_threshold_crossed: data.turnoverThresholdCrossed,
      supplier_exemption_category: data.supplierExemptionCategory,
      exemption_notes: data.exemptionNotes,
      applicability_assessed_at: data.applicabilityAssessedAt,
      applicability_rule_threshold: data.applicabilityRuleThreshold,
      applicability_rule_reference: data.applicabilityRuleReference,
      einvoice_mode: data.einvoiceMode,
      einvoice_threshold: data.einvoiceThreshold,
      default_hsn: data.defaultHsn,
      default_gst_rate: data.defaultGstRate,
      default_tax_confirmed: data.defaultTaxConfirmed,
    };
    const { data: saved, error } = await context.supabase
      .from('gst_settings')
      .upsert(row, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const getEInvoiceConnectionStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('gst_einvoice_connections')
      .select('*')
      .eq('user_id', context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? {
      provider: 'iris',
      environment: 'sandbox',
      connection_status: 'not_connected',
      authorization_status: 'not_connected',
      authorized_gstin: '',
      gstin_validated_at: null,
      last_connection_attempt_at: null,
      last_successful_connection_at: null,
      authorization_updated_at: null,
      last_error_code: null,
      last_error_message: null,
      validated_legal_name: null,
      validated_trade_name: null,
    };
  });

export const testEInvoiceConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { environment: EInvoiceEnvironment }) => input)
  .handler(async ({ data, context }) => {
    const { data: settings } = await context.supabase.from('gst_settings').select('gstin').eq('user_id', context.userId).maybeSingle();
    const gstin = settings?.gstin?.trim().toUpperCase() ?? '';
    if (!gstin) return { success: false, errorMessage: 'Save the business GSTIN before testing IRIS.' };
    const { getEInvoiceProvider } = await import('@/lib/einvoice/provider.server');
    const provider = await getEInvoiceProvider(data.environment, gstin);
    const attemptedAt = new Date().toISOString();
    const result = provider.configured
      ? await provider.testConnection()
      : { success: false, errorCode: 'PROVIDER_NOT_CONFIGURED', errorMessage: `IRIS ${data.environment} credentials are not configured.` };
    const errorMessage = result.success ? null : sanitizeProviderError(result.errorMessage);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await supabaseAdmin.from('gst_einvoice_connections').upsert({
      user_id: context.userId,
      provider: 'iris',
      environment: data.environment,
      connection_status: result.success ? 'connected' : 'failed',
      authorization_status: result.success ? 'authorized' : 'not_connected',
      authorized_gstin: result.success ? gstin : '',
      last_connection_attempt_at: attemptedAt,
      last_successful_connection_at: result.success ? attemptedAt : undefined,
      authorization_updated_at: attemptedAt,
      last_error_code: result.success ? null : (result.errorCode ?? 'IRIS_CONNECTION_FAILED'),
      last_error_message: errorMessage,
    }, { onConflict: 'user_id' });
    return { success: result.success, configured: provider.configured, environment: data.environment, errorMessage };
  });

export const validateBusinessGstin = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: settings }, { data: connection }] = await Promise.all([
      context.supabase.from('gst_settings').select('gstin').eq('user_id', context.userId).maybeSingle(),
      context.supabase.from('gst_einvoice_connections').select('*').eq('user_id', context.userId).maybeSingle(),
    ]);
    const gstin = settings?.gstin?.trim().toUpperCase() ?? '';
    if (!gstin) return { success: false, errorMessage: 'Save the business GSTIN before validation.' };
    if (!connection || connection.connection_status !== 'connected' || connection.authorization_status !== 'authorized') {
      return { success: false, errorMessage: 'Connect and authorize IRIS before validating the GSTIN.' };
    }
    const environment = connection.environment as EInvoiceEnvironment;
    const { getEInvoiceProvider } = await import('@/lib/einvoice/provider.server');
    const provider = await getEInvoiceProvider(environment, gstin);
    if (!provider.configured) return { success: false, errorMessage: 'IRIS credentials are not configured.' };
    const result = await provider.validateGstin(gstin);
    const details = result.details ?? {};
    const errorMessage = result.success ? null : sanitizeProviderError(result.errorMessage);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await supabaseAdmin.from('gst_einvoice_connections').update({
      gstin_validated_at: result.success ? new Date().toISOString() : null,
      validated_legal_name: result.success ? readText(details, ['LegalName', 'LglNm', 'legalName']) : null,
      validated_trade_name: result.success ? readText(details, ['TradeName', 'TrdNm', 'tradeName']) : null,
      validated_address: result.success ? details as never : null,
      last_error_code: result.success ? null : (result.errorCode ?? 'GSTIN_VALIDATION_FAILED'),
      last_error_message: errorMessage,
    }).eq('user_id', context.userId);
    return { success: result.success, gstin, legalName: readText(details, ['LegalName', 'LglNm', 'legalName']), tradeName: readText(details, ['TradeName', 'TrdNm', 'tradeName']), errorMessage };
  });

export const listGstInvoices = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('gst_invoices')
      .select('*')
      .eq('user_id', context.userId)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getGstInvoiceDetail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { gstInvoiceId: string }) => input)
  .handler(async ({ data, context }) => {
    const [invoiceRes, itemsRes, logsRes] = await Promise.all([
      context.supabase.from('gst_invoices').select('*').eq('id', data.gstInvoiceId).maybeSingle(),
      context.supabase
        .from('gst_invoice_items')
        .select('*')
        .eq('gst_invoice_id', data.gstInvoiceId)
        .order('line_no'),
      context.supabase
        .from('gst_einvoice_logs')
        .select('id, action, provider, success, http_status, error_code, error_message, created_at')
        .eq('gst_invoice_id', data.gstInvoiceId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (invoiceRes.error) throw new Error(invoiceRes.error.message);
    return {
      invoice: invoiceRes.data,
      items: itemsRes.data ?? [],
      logs: logsRes.data ?? [],
    };
  });

/**
 * Stores the GST breakdown of a completed sale. Billing never waits on this —
 * if it fails the sale is already recorded locally and can be re-synced.
 */
export const recordGstInvoice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: RecordGstInvoiceInput) => input)
  .handler(async ({ data, context }) => {
    const invoiceRow = {
      user_id: context.userId,
      local_invoice_id: data.localInvoiceId,
      invoice_no: data.invoiceNo,
      invoice_date: data.invoiceTimestamp.slice(0, 10),
      invoice_timestamp: data.invoiceTimestamp,
      supply_type: data.supplyType,
      is_interstate: data.isInterstate,
      seller_gstin: data.sellerGstin,
      seller_legal_name: data.sellerLegalName,
      seller_state_code: data.sellerStateCode,
      buyer_name: data.buyerName,
      buyer_gstin: data.buyerGstin,
      buyer_address: data.buyerAddress,
      buyer_state_code: data.buyerStateCode,
      place_of_supply: data.placeOfSupply,
      taxable_total: data.taxableTotal,
      cgst_total: data.cgstTotal,
      sgst_total: data.sgstTotal,
      igst_total: data.igstTotal,
      cess_total: data.cessTotal,
      tax_total: data.taxTotal,
      grand_total: data.grandTotal,
      einvoice_required: data.einvoiceRequired,
      einvoice_status: (data.einvoiceRequired ? 'pending' : 'not_required') as
        | 'pending'
        | 'not_required',
    };

    const { data: saved, error } = await context.supabase
      .from('gst_invoices')
      .upsert(invoiceRow, { onConflict: 'user_id,local_invoice_id' })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from('gst_invoice_items').delete().eq('gst_invoice_id', saved.id);

    if (data.items.length > 0) {
      const { error: itemsError } = await context.supabase.from('gst_invoice_items').insert(
        data.items.map(item => ({
          user_id: context.userId,
          gst_invoice_id: saved.id,
          line_no: item.lineNo,
          description: item.description,
          hsn_sac: item.hsnSac,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount: item.discount,
          taxable_value: item.taxableValue,
          gst_rate: item.gstRate,
          gst_rate_configured: item.gstRateConfigured,
          cgst_amount: item.cgstAmount,
          sgst_amount: item.sgstAmount,
          igst_amount: item.igstAmount,
          cess_amount: item.cessAmount,
          line_total: item.lineTotal,
        })),
      );
      if (itemsError) throw new Error(itemsError.message);
    }

    return saved;
  });

/**
 * Attempts an e-Invoice generation through the configured IRP/GSP provider.
 * With no authorised provider connected this records a clear failure and never
 * fabricates an IRN. The underlying sale always remains valid.
 */
export const generateEInvoice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { gstInvoiceId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: invoice, error } = await context.supabase
      .from('gst_invoices')
      .select('*')
      .eq('id', data.gstInvoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error('Invoice not found.');

    if (invoice.einvoice_status === 'generated') {
      return { success: true, alreadyGenerated: true, errorMessage: null as string | null };
    }
    if (!invoice.einvoice_required) {
      return {
        success: false,
        alreadyGenerated: false,
        errorMessage: 'e-Invoice is not legally applicable for this sale.',
      };
    }

    const [{ data: items }, { data: connection }] = await Promise.all([
      context.supabase
      .from('gst_invoice_items')
      .select('*')
      .eq('gst_invoice_id', invoice.id)
      .order('line_no'),
      context.supabase.from('gst_einvoice_connections').select('*').eq('user_id', context.userId).maybeSingle(),
    ]);

    const invalidItem = (items ?? []).find(item => !item.hsn_sac.trim() || !item.gst_rate_configured);
    if (invalidItem) {
      const message = 'Confirm the HSN/SAC and GST rate for every item before e-Invoice submission.';
      await context.supabase.from('gst_invoices').update({ einvoice_validation_error: message }).eq('id', invoice.id);
      return { success: false, alreadyGenerated: false, apiConnected: false, errorMessage: message };
    }

    if (!connection || connection.connection_status !== 'connected' || connection.authorization_status !== 'authorized') {
      return { success: false, alreadyGenerated: false, apiConnected: false, errorMessage: 'IRIS is not connected and authorized for this GSTIN.' };
    }
    if (connection.authorized_gstin !== invoice.seller_gstin) {
      return { success: false, alreadyGenerated: false, apiConnected: true, errorMessage: 'This seller GSTIN is not authorized on the active IRIS connection.' };
    }
    const { isValidGstin } = await import('@/lib/gst');
    if (!isValidGstin(invoice.seller_gstin) || !isValidGstin(invoice.buyer_gstin)) {
      return { success: false, alreadyGenerated: false, apiConnected: true, errorMessage: 'A valid seller and buyer GSTIN is required before submission.' };
    }

    const { data: lockToken } = await context.supabase.rpc('claim_einvoice_submission', { _invoice_id: invoice.id });
    if (!lockToken) {
      return { success: false, alreadyGenerated: false, apiConnected: true, errorMessage: 'This invoice is already being submitted. Refresh before retrying.' };
    }

    const { buildIrpPayload } = await import('@/lib/einvoice/payload.server');
    const { getEInvoiceProvider } = await import('@/lib/einvoice/provider.server');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const payload = buildIrpPayload(invoice, items ?? []);
    const provider = await getEInvoiceProvider(connection.environment as EInvoiceEnvironment, invoice.seller_gstin);
    if (!provider.configured) {
      await context.supabase.rpc('release_einvoice_claim', { _invoice_id: invoice.id, _lock_token: lockToken });
      return {
        success: false,
        alreadyGenerated: false,
        apiConnected: false,
        errorMessage: 'API Not Connected. This invoice is saved in TapTrack only and has not been submitted to IRP or GSTN.',
      };
    }
    const { createHash } = await import('node:crypto');
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const documentKey = `${invoice.seller_gstin}|INV|${invoice.invoice_no}|${invoice.invoice_date.slice(0, 4)}`;
    const requestStartedAt = new Date().toISOString();
    const result = await provider.generate(payload, documentKey);
    const completeSuccess = Boolean(
      result.success && result.irn?.trim() && result.ackNo?.trim() && result.ackDate?.trim() && result.signedQr?.trim(),
    );
    const safeResult = completeSuccess
      ? result
      : {
          ...result,
          success: false,
          errorCode: result.errorCode ?? 'INCOMPLETE_PROVIDER_RESPONSE',
          errorMessage: result.errorMessage ?? 'The provider returned an incomplete response. No government identifiers were saved.',
        };

    await supabaseAdmin.from('gst_einvoice_logs').insert({
      user_id: context.userId,
      gst_invoice_id: invoice.id,
      action: 'generate',
      provider: provider.name,
      gstin: invoice.seller_gstin,
      api_environment: provider.environment,
      request_status: safeResult.success ? 'succeeded' : 'failed',
      provider_request_id: safeResult.providerRequestId ?? null,
      document_key: documentKey,
      payload_hash: payloadHash,
      irn: safeResult.success ? safeResult.irn : null,
      ack_no: safeResult.success ? safeResult.ackNo : null,
      ack_date: safeResult.success ? safeResult.ackDate : null,
      retry_attempt: invoice.attempt_count + 1,
      request_started_at: requestStartedAt,
      response_received_at: new Date().toISOString(),
      http_status: safeResult.httpStatus ?? null,
      success: safeResult.success,
      request_payload: payload as never,
      response_payload: (safeResult.rawResponse ?? null) as never,
      error_code: safeResult.errorCode ?? null,
      error_message: safeResult.errorMessage ?? null,
    });

    const update = safeResult.success
      ? {
          einvoice_status: 'generated' as const,
          irn: safeResult.irn ?? null,
          ack_no: safeResult.ackNo ?? null,
          ack_date: safeResult.ackDate ?? null,
          signed_qr: safeResult.signedQr ?? null,
          signed_invoice: safeResult.signedInvoice ?? null,
          einvoice_provider: provider.name,
          einvoice_environment: provider.environment,
          provider_request_id: safeResult.providerRequestId ?? null,
          provider_document_id: documentKey,
          einvoice_validation_error: null,
          last_error_code: null,
          last_error_message: null,
          attempt_count: invoice.attempt_count + 1,
          last_attempt_at: new Date().toISOString(),
        }
      : {
          einvoice_status: 'failed' as const,
          last_error_code: safeResult.errorCode ?? 'UNKNOWN',
          last_error_message: safeResult.errorMessage ?? 'Unknown error',
          attempt_count: invoice.attempt_count + 1,
          last_attempt_at: new Date().toISOString(),
        };

    await context.supabase.from('gst_invoices').update(update).eq('id', invoice.id).eq('submission_lock_token', lockToken);
    await context.supabase.rpc('release_einvoice_claim', { _invoice_id: invoice.id, _lock_token: lockToken });

    return {
      success: safeResult.success,
      alreadyGenerated: false,
      apiConnected: provider.configured,
      errorMessage: safeResult.success ? null : (safeResult.errorMessage ?? 'Unknown error'),
    };
  });

/** Cancels an IRN through the provider (allowed within 24 hours of the ack). */
export const cancelEInvoice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { gstInvoiceId: string; reasonCode: string; remark: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: invoice, error } = await context.supabase
      .from('gst_invoices')
      .select('*')
      .eq('id', data.gstInvoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error('Invoice not found.');
    if (invoice.einvoice_status !== 'generated' || !invoice.irn) {
      return { success: false, errorMessage: 'This invoice has no active IRN to cancel.' };
    }

    const { data: connection } = await context.supabase.from('gst_einvoice_connections').select('*').eq('user_id', context.userId).maybeSingle();
    if (!connection || connection.connection_status !== 'connected' || connection.authorization_status !== 'authorized') {
      return { success: false, apiConnected: false, errorMessage: 'IRIS is not connected and authorized.' };
    }
    const { data: lockToken } = await context.supabase.rpc('claim_einvoice_cancellation', { _invoice_id: invoice.id });
    if (!lockToken) return { success: false, apiConnected: true, errorMessage: 'This IRN is already being processed. Refresh before retrying.' };

    const { getEInvoiceProvider } = await import('@/lib/einvoice/provider.server');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const provider = await getEInvoiceProvider(connection.environment as EInvoiceEnvironment, invoice.seller_gstin);
    if (!provider.configured) {
      await context.supabase.rpc('release_einvoice_claim', { _invoice_id: invoice.id, _lock_token: lockToken });
      return { success: false, apiConnected: false, errorMessage: 'API Not Connected. No cancellation was submitted.' };
    }
    const providerResult = await provider.cancel({
      irn: invoice.irn,
      reasonCode: data.reasonCode,
      remark: data.remark,
    });
    const result = providerResult.success && !providerResult.cancelDate?.trim()
      ? {
          ...providerResult,
          success: false,
          errorCode: 'INCOMPLETE_PROVIDER_RESPONSE',
          errorMessage: 'The provider returned an incomplete cancellation response. The IRN remains unchanged.',
        }
      : providerResult;

    await supabaseAdmin.from('gst_einvoice_logs').insert({
      user_id: context.userId,
      gst_invoice_id: invoice.id,
      action: 'cancel',
      provider: provider.name,
      gstin: invoice.seller_gstin,
      api_environment: provider.environment,
      request_status: result.success ? 'succeeded' : 'failed',
      provider_request_id: result.providerRequestId ?? null,
      document_key: invoice.provider_document_id,
      irn: invoice.irn,
      ack_no: invoice.ack_no,
      ack_date: invoice.ack_date,
      retry_attempt: invoice.attempt_count + 1,
      request_started_at: new Date().toISOString(),
      response_received_at: new Date().toISOString(),
      http_status: result.httpStatus ?? null,
      success: result.success,
      request_payload: { irn: invoice.irn, reasonCode: data.reasonCode, remark: data.remark },
      response_payload: (result.rawResponse ?? null) as never,
      error_code: result.errorCode ?? null,
      error_message: result.errorMessage ?? null,
    });

    if (result.success) {
      await context.supabase
        .from('gst_invoices')
        .update({
          einvoice_status: 'cancelled',
          cancel_reason: data.reasonCode,
          cancel_remark: data.remark,
          cancelled_at: result.cancelDate,
        })
        .eq('id', invoice.id);
    } else {
      await context.supabase
        .from('gst_invoices')
        .update({
          last_error_code: result.errorCode ?? 'UNKNOWN',
          last_error_message: result.errorMessage ?? 'Unknown error',
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', invoice.id);
    }
    await context.supabase.rpc('release_einvoice_claim', { _invoice_id: invoice.id, _lock_token: lockToken });

    return {
      success: result.success,
      errorMessage: result.success ? null : (result.errorMessage ?? 'Unknown error'),
    };
  });
