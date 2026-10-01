import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import {
  getGstSettings,
  saveGstSettings,
  listGstInvoices,
  getGstInvoiceDetail,
  recordGstInvoice,
  generateEInvoice,
  cancelEInvoice,
  getEInvoiceConnectionStatus,
  testEInvoiceConnection,
  validateBusinessGstin,
  type GstSettingsInput,
  type RecordGstInvoiceInput,
} from '@/lib/gst.functions';
import {
  EMPTY_GST_SETTINGS,
  writeCachedGstSettings,
  type GstBusinessSettings,
} from '@/lib/gst';

type SettingsRow = Awaited<ReturnType<typeof getGstSettings>>;

function rowToSettings(row: SettingsRow): GstBusinessSettings {
  if (!row) return EMPTY_GST_SETTINGS;
  return {
    legalName: row.legal_name,
    tradeName: row.trade_name,
    gstin: row.gstin,
    stateName: row.state_name,
    stateCode: row.state_code,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    pincode: row.pincode,
    placeOfSupply: row.place_of_supply,
    gstEnabled: row.gst_enabled,
    einvoiceApplicable: row.einvoice_applicable,
    einvoiceApplicabilityStatus: row.einvoice_applicability_status as GstBusinessSettings['einvoiceApplicabilityStatus'],
    turnoverThresholdCrossed: row.turnover_threshold_crossed,
    supplierExemptionCategory: row.supplier_exemption_category as GstBusinessSettings['supplierExemptionCategory'],
    exemptionNotes: row.exemption_notes,
    applicabilityAssessedAt: row.applicability_assessed_at,
    applicabilityRuleThreshold: Number(row.applicability_rule_threshold),
    applicabilityRuleReference: row.applicability_rule_reference,
    einvoiceMode: row.einvoice_mode === 'ready' ? 'ready' : 'off',
    einvoiceThreshold: Number(row.einvoice_threshold),
    defaultHsn: row.default_hsn,
    defaultGstRate: row.default_tax_confirmed ? Number(row.default_gst_rate) : 0,
    defaultTaxConfirmed: row.default_tax_confirmed,
  };
}

export function useGstSettings() {
  const fetchSettings = useServerFn(getGstSettings);
  const query = useQuery({
    queryKey: ['gst-settings'],
    queryFn: () => fetchSettings(),
  });

  const settings = rowToSettings(query.data ?? null);

  useEffect(() => {
    if (query.data !== undefined) writeCachedGstSettings(rowToSettings(query.data ?? null));
  }, [query.data]);

  return { ...query, settings };
}

export function useSaveGstSettings() {
  const save = useServerFn(saveGstSettings);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GstSettingsInput) => save({ data: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gst-settings'] });
    },
  });
}

export function useGstInvoices() {
  const list = useServerFn(listGstInvoices);
  return useQuery({
    queryKey: ['gst-invoices'],
    queryFn: () => list(),
  });
}

export function useEInvoiceConnection() {
  const getStatus = useServerFn(getEInvoiceConnectionStatus);
  return useQuery({
    queryKey: ['einvoice-connection'],
    queryFn: () => getStatus(),
  });
}

export function useTestEInvoiceConnection() {
  const test = useServerFn(testEInvoiceConnection);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (environment: 'sandbox' | 'production') => test({ data: { environment } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['einvoice-connection'] }),
  });
}

export function useValidateBusinessGstin() {
  const validate = useServerFn(validateBusinessGstin);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => validate(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['einvoice-connection'] }),
  });
}

export function useGstInvoiceDetail(gstInvoiceId: string | null) {
  const detail = useServerFn(getGstInvoiceDetail);
  return useQuery({
    queryKey: ['gst-invoice-detail', gstInvoiceId],
    queryFn: () => detail({ data: { gstInvoiceId: gstInvoiceId as string } }),
    enabled: !!gstInvoiceId,
  });
}

export function useRecordGstInvoice() {
  const record = useServerFn(recordGstInvoice);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordGstInvoiceInput) => record({ data: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gst-invoices'] });
    },
  });
}

export function useGenerateEInvoice() {
  const generate = useServerFn(generateEInvoice);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gstInvoiceId: string) => generate({ data: { gstInvoiceId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gst-invoices'] });
      void qc.invalidateQueries({ queryKey: ['gst-invoice-detail'] });
    },
  });
}

export function useCancelEInvoice() {
  const cancel = useServerFn(cancelEInvoice);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { gstInvoiceId: string; reasonCode: string; remark: string }) =>
      cancel({ data: args }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gst-invoices'] });
      void qc.invalidateQueries({ queryKey: ['gst-invoice-detail'] });
    },
  });
}
