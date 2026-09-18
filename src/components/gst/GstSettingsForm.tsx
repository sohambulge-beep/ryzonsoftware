import { useEffect, useState } from 'react';
import { useGstSettings, useSaveGstSettings } from '@/hooks/useGst';
import { EMPTY_GST_SETTINGS, GST_RATES, SUPPLIER_EXEMPTIONS, isValidGstin, stateCodeFromGstin, type GstBusinessSettings } from '@/lib/gst';

const inputClass =
  'w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500 transition';
const labelClass =
  'block text-[0.65rem] uppercase tracking-wider text-zinc-400 mb-1.5 font-semibold font-mono';

export function GstSettingsForm() {
  const { settings, isLoading } = useGstSettings();
  const save = useSaveGstSettings();
  const [form, setForm] = useState<GstBusinessSettings>(EMPTY_GST_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isLoading) setForm(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, settings.gstin, settings.gstEnabled, settings.einvoiceApplicabilityStatus]);

  const set = <K extends keyof GstBusinessSettings>(key: K, value: GstBusinessSettings[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const gstinValid = !form.gstin || isValidGstin(form.gstin);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const stateCode = form.stateCode || stateCodeFromGstin(form.gstin);
    save.mutate(
      { ...form, stateCode, placeOfSupply: form.placeOfSupply || stateCode },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
      <div>
        <h3 className="text-white font-bold text-base flex items-center gap-2">
          <i className="fa-solid fa-file-invoice text-amber-400" /> GST &amp; e-Invoice
        </h3>
        <p className="text-sm text-zinc-400 mt-1">
          Your business tax details. Used on tax invoices and for e-Invoice eligibility.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
          <label className="flex items-center justify-between gap-3 text-sm text-zinc-200 cursor-pointer">
            <span className="font-semibold">GST Billing — {form.gstEnabled ? 'ON' : 'OFF'}</span>
            <input type="checkbox" checked={form.gstEnabled} onChange={e => set('gstEnabled', e.target.checked)} className="accent-amber-500 w-4 h-4" />
          </label>
          <p className="text-[11px] text-zinc-500 mt-1.5">
            ON: every sale becomes a proper tax invoice with HSN codes and an automatic CGST/SGST or IGST split.
            OFF: billing stays exactly as it is today with your simple sales tax rate.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
          <label className="block text-sm text-zinc-200">
            <span className="font-semibold">e-Invoice applicability assessment</span>
            <select
              value={form.einvoiceApplicabilityStatus}
              onChange={e => {
                const status = e.target.value as GstBusinessSettings['einvoiceApplicabilityStatus'];
                set('einvoiceApplicabilityStatus', status);
                set('einvoiceApplicable', status === 'applicable');
                set('applicabilityAssessedAt', status === 'needs_review' ? null : new Date().toISOString());
              }}
              className={`${inputClass} mt-2`}
            >
              <option value="needs_review">Needs Review</option>
              <option value="applicable">Applicable</option>
              <option value="not_applicable">Not Applicable</option>
              <option value="exempt">Exempt</option>
            </select>
          </label>
          <p className="text-[11px] text-zinc-500 mt-1.5">
            Set this after checking current rules and exemptions with your GST practitioner. This setting is a recorded assessment, not legal advice.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <label className="flex items-center justify-between gap-3 text-sm text-zinc-200 cursor-pointer">
          <span>Notified turnover threshold crossed in a relevant financial year</span>
          <input type="checkbox" checked={form.turnoverThresholdCrossed} onChange={e => set('turnoverThresholdCrossed', e.target.checked)} className="accent-amber-500 w-4 h-4" />
        </label>
        <div>
          <label className={labelClass}>Supplier exemption category</label>
          <select value={form.supplierExemptionCategory} onChange={e => set('supplierExemptionCategory', e.target.value as GstBusinessSettings['supplierExemptionCategory'])} className={inputClass}>
            {SUPPLIER_EXEMPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Rule threshold (₹)</label>
          <input type="number" min="0" value={form.applicabilityRuleThreshold} onChange={e => set('applicabilityRuleThreshold', Number(e.target.value) || 0)} className={`${inputClass} font-mono`} />
        </div>
        <div>
          <label className={labelClass}>Rule reference</label>
          <input value={form.applicabilityRuleReference} onChange={e => set('applicabilityRuleReference', e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Exemption / assessment notes</label>
          <input value={form.exemptionNotes} onChange={e => set('exemptionNotes', e.target.value)} className={inputClass} placeholder="Record the basis confirmed by your GST practitioner" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Legal Name</label>
          <input value={form.legalName} onChange={e => set('legalName', e.target.value)} className={inputClass} placeholder="As per GST registration" />
        </div>
        <div>
          <label className={labelClass}>Trade Name</label>
          <input value={form.tradeName} onChange={e => set('tradeName', e.target.value)} className={inputClass} placeholder="Brand / bar name" />
        </div>
        <div>
          <label className={labelClass}>GSTIN</label>
          <input
            value={form.gstin}
            onChange={e => {
              const v = e.target.value.toUpperCase();
              set('gstin', v);
              if (!form.stateCode) set('stateCode', stateCodeFromGstin(v));
            }}
            className={`${inputClass} font-mono ${gstinValid ? '' : 'border-red-600'}`}
            placeholder="27ABCDE1234F1Z5"
            maxLength={15}
          />
          {!gstinValid && <p className="text-[11px] text-red-400 mt-1">This GSTIN does not look valid.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>State</label>
            <input value={form.stateName} onChange={e => set('stateName', e.target.value)} className={inputClass} placeholder="Maharashtra" />
          </div>
          <div>
            <label className={labelClass}>State Code</label>
            <input value={form.stateCode} onChange={e => set('stateCode', e.target.value)} className={`${inputClass} font-mono`} placeholder="27" maxLength={2} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Address Line 1</label>
          <input value={form.addressLine1} onChange={e => set('addressLine1', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Address Line 2</label>
          <input value={form.addressLine2} onChange={e => set('addressLine2', e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>City</label>
            <input value={form.city} onChange={e => set('city', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>PIN Code</label>
            <input value={form.pincode} onChange={e => set('pincode', e.target.value)} className={`${inputClass} font-mono`} maxLength={6} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Default Place of Supply (state code)</label>
          <input value={form.placeOfSupply} onChange={e => set('placeOfSupply', e.target.value)} className={`${inputClass} font-mono`} placeholder="27" maxLength={2} />
        </div>
        <div>
          <label className={labelClass}>Optional Default HSN / SAC</label>
          <input value={form.defaultHsn} onChange={e => set('defaultHsn', e.target.value)} className={`${inputClass} font-mono`} placeholder="Enter only if confirmed for your items" />
        </div>
        <div>
          <label className={labelClass}>Optional Default GST Rate</label>
          <select value={form.defaultGstRate} onChange={e => set('defaultGstRate', Number(e.target.value))} className={inputClass}>
            <option value={0}>Not set</option>
            {GST_RATES.map(r => (
              r > 0 && <option key={r} value={r}>{r}%</option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
            <input type="checkbox" checked={form.defaultTaxConfirmed} onChange={e => set('defaultTaxConfirmed', e.target.checked)} className="accent-amber-500" />
            I confirm this default rate is appropriate where an item has no rate.
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-xs font-semibold text-zinc-300 mb-2 flex items-center gap-2">
          Connect e-Invoice API
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            e-Invoice Ready
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-600/30">
            API Not Connected
          </span>
        </div>
        <select value={form.einvoiceMode} onChange={e => set('einvoiceMode', e.target.value === 'ready' ? 'ready' : 'off')} className={`${inputClass} sm:w-72`}>
          <option value="off">Off — no e-Invoice actions</option>
          <option value="ready">e-Invoice Ready — prepare invoices for an IRP/GSP account</option>
        </select>
        <p className="text-[11px] text-zinc-500 mt-2">
          No authorised e-Invoice provider is connected, so no IRN can be issued and none is ever invented.
          Tax invoices are saved in TapTrack for your records only. Saving, printing or syncing them does not file
          a GST return and does not submit them to GSTN or an IRP.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={save.isPending}
          className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 font-semibold rounded-lg py-2.5 px-5 text-sm hover:brightness-110 transition disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Save GST Details'}
        </button>
        {saved && <span className="text-xs text-emerald-400"><i className="fa-solid fa-circle-check mr-1" />Saved</span>}
        {save.isError && (
          <span className="text-xs text-red-400">
            Could not save. <button type="submit" className="underline">Retry</button>
          </span>
        )}
      </div>
    </form>
  );
}
