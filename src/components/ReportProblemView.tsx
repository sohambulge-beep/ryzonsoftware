import { Component, useEffect, useState, type ReactNode } from 'react';
import { PROVIDER_PHONE } from '@/lib/providerConfig';
import {
  buildSupportReport,
  clearErrors,
  collectDeviceInfo,
  ERROR_EVENT,
  readErrors,
  sanitize,
  usableSupportNumber,
  type DeviceInfo,
  type ErrorEntry,
} from '@/lib/errorLog';

const input = 'rounded-md border px-3 py-2 text-sm bg-background';
const APP_NAME = 'TapTrack';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="p-4 text-sm">The problem report page could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  // Read after the page has opened (keeps the server and the browser the same), and again when a new error is saved.
  useEffect(() => {
    const load = () => setErrors(readErrors());
    load();
    setDevice(collectDeviceInfo());
    window.addEventListener(ERROR_EVENT, load);
    return () => window.removeEventListener(ERROR_EVENT, load);
  }, []);

  const number = usableSupportNumber(PROVIDER_PHONE);
  const report = device ? buildSupportReport({ appName: APP_NAME, note, errors, device }) : '';

  function sendOnWhatsApp() {
    const text = encodeURIComponent(report);
    const url = number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // ignore
    }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard can be blocked on some phones; WhatsApp still works
    }
  }

  return (
    <div className="space-y-4 p-1">
      <div>
        <h2 className="text-lg font-semibold">Report a problem</h2>
        <p className="text-sm text-muted-foreground">
          If something is not working, write what went wrong and tap "Send on WhatsApp". The app adds the recent errors
          and phone details, so support can find the cause fast. Your bills, customers and stock are not sent.
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">What went wrong? (optional)</span>
        <textarea
          className={`${input} w-full`}
          rows={3}
          maxLength={400}
          placeholder="Example: when I tap Cash, the bill does not open"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {!number && (
        <p className="rounded-md border border-amber-500/50 p-3 text-xs text-amber-500">
          The support WhatsApp number is not set yet, so WhatsApp will open without a number and you can pick a contact.
          The owner of the software should put the real number in providerConfig.ts.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={sendOnWhatsApp}
          disabled={!device}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Send on WhatsApp
        </button>
        <button type="button" onClick={copyReport} disabled={!device} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
          {copied ? 'Copied' : 'Copy report'}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Recent errors on this phone ({errors.length})</div>
          {errors.length > 0 && (
            <button type="button" onClick={clearErrors} className="text-xs text-red-500 underline">
              Clear list
            </button>
          )}
        </div>
        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No errors recorded. That is good.</p>
        ) : (
          errors.slice(0, 20).map((e) => (
            <div key={e.id} className="rounded-md bg-muted/40 p-2 text-sm">
              <div className="font-medium break-words">
                {e.message}
                {e.count > 1 ? ` (x${e.count})` : ''}
              </div>
              <div className="text-xs text-muted-foreground">
                {when(e.at)}
                {e.where ? ` | ${e.where}` : ''}
              </div>
            </div>
          ))
        )}
      </div>

      {device && (
        <div className="space-y-0.5 rounded-md border p-3 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">What will be sent along</div>
          <div>Page: {device.page || '-'}</div>
          <div className="break-words">Phone/browser: {sanitize(device.userAgent, 200) || '-'}</div>
          <div>
            Screen: {device.screen || '-'} | Online: {device.online === null ? 'unknown' : device.online ? 'yes' : 'no'}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReportProblemView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
