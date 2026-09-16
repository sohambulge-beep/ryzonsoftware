import { useEffect, useState } from 'react';
import { useGstSettings, useSaveGstSettings } from '@/hooks/useGst';
import { EMPTY_GST_SETTINGS, GST_RATES, isValidGstin, stateCodeFromGstin, type GstBusinessSettings } from '@/lib/gst';

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
  }, [isLoading, settings.gstin, settings.gstEnabled, settings.einvoiceApplicable]);

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
          <label className="flex items-center justify-between gap-3 text-sm text-zinc-200 cursor-pointer">
            <span className="font-semibold">e-Invoicing applicable</span>
            <input type="checkbox" checked={form.einvoiceApplicable} onChange={e => set('einvoiceApplicable', e.target.checked)} className="accent-amber-500 w-4 h-4" />
          </label>
          <p className="text-[11px] text-zinc-500 mt-1.5">
            Switch this on only if your business crosses the turnover limit notified by the GST department.
            e-Invoices are then prepared only for registered (B2B / SEZ / Export) sales.
          </p>
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
          <label className={labelClass}>Default HSN / SAC</label>
          <input value={form.defaultHsn} onChange={e => set('defaultHsn', e.target.value)} className={`${inputClass} font-mono`} placeholder="22030000" />
        </div>
        <div>
          <label className={labelClass}>Default GST Rate</label>
          <select value={form.defaultGstRate} onChange={e => set('defaultGstRate', Number(e.target.value))} className={inputClass}>
            {GST_RATES.map(r => (
              <option key={r} value={r}>{r}%</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-xs font-semibold text-zinc-300 mb-2">e-Invoice connection</div>
        <select value={form.einvoiceMode} onChange={e => set('einvoiceMode', e.target.value === 'ready' ? 'ready' : 'off')} className={`${inputClass} sm:w-72`}>
          <option value="off">Off — no e-Invoice actions</option>
          <option value="ready">Ready — prepare e-Invoices for an IRP/GSP account</option>
        </select>
        <p className="text-[11px] text-zinc-500 mt-2">
          No government e-Invoice provider is connected yet, so real IRNs cannot be issued. Invoices are prepared
          and stored so they can be filed the moment an authorised provider is connected.
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
