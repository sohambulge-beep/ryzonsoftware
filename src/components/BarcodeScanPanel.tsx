import type { ScanBrand, ScanNote } from '@/lib/barcodes';
import { BarcodeCameraScanner } from '@/components/BarcodeCameraScanner';

const input = 'rounded-md border px-3 py-2 text-sm bg-background';

export interface ScanHistoryItem {
  id: number;
  label: string;
}

interface Props {
  scanText: string;
  onScanText: (v: string) => void;
  onSubmit: () => void;
  note: ScanNote | null;
  /** An unknown barcode waiting to be linked to a brand. */
  pendingCode: string | null;
  pickQuery: string;
  onPickQuery: (v: string) => void;
  brandOptions: ScanBrand[];
  onPickBrand: (brandId: string) => void;
  onCancelPending: () => void;
  history: ScanHistoryItem[];
  onUndo: () => void;
  linkedCount: number;
  onForgetLinks: () => void;
  cameraSupported: boolean;
  cameraOpen: boolean;
  onToggleCamera: () => void;
  onCameraCode: (code: string) => void;
}

const NOTE_COLOR: Record<ScanNote['kind'], string> = {
  ok: 'text-emerald-500',
  info: 'text-sky-500',
  warn: 'text-amber-500',
};

/** The "Scan bottles" box on the stock check page. It only shows things; the page decides what a scan does. */
export function BarcodeScanPanel(p: Props) {
  const matches = p.brandOptions.slice(0, 8);
  return (
    <div className="space-y-2 rounded-md border p-3 no-print">
      <div className="text-sm font-semibold">Scan bottles</div>
      <p className="text-xs text-muted-foreground">
        Scan each bottle's barcode with a USB or Bluetooth scanner, or with the phone camera. The first time, choose
        which brand the barcode is. After that, every scan adds one bottle to that brand's counted number.
      </p>

      <div className="flex gap-2">
        <input
          className={`${input} grow`}
          inputMode="text"
          placeholder="Scan or type the barcode, then press Enter"
          value={p.scanText}
          onChange={(e) => p.onScanText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              p.onSubmit();
            }
          }}
        />
        <button type="button" onClick={p.onSubmit} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
          Add
        </button>
      </div>

      {p.cameraSupported && (
        <button type="button" onClick={p.onToggleCamera} className="rounded-md border px-3 py-1.5 text-sm">
          {p.cameraOpen ? 'Close camera' : 'Scan with phone camera'}
        </button>
      )}
      {p.cameraOpen && <BarcodeCameraScanner onCode={p.onCameraCode} onClose={p.onToggleCamera} />}

      {p.note && <p className={`text-sm ${NOTE_COLOR[p.note.kind]}`}>{p.note.text}</p>}

      {p.pendingCode && (
        <div className="space-y-2 rounded-md bg-muted/40 p-2">
          <div className="text-sm">
            Which brand is barcode <span className="font-mono font-semibold">{p.pendingCode}</span>?
          </div>
          <input
            className={`${input} w-full`}
            placeholder="Type part of the brand name"
            value={p.pickQuery}
            onChange={(e) => p.onPickQuery(e.target.value)}
          />
          {matches.length === 0 ? (
            <p className="text-xs text-muted-foreground">No brand matches.</p>
          ) : (
            <div className="space-y-1">
              {matches.map((b) => (
                <button
                  key={b.brand_id}
                  type="button"
                  onClick={() => p.onPickBrand(b.brand_id)}
                  className="block w-full rounded-md border px-3 py-2 text-left text-sm"
                >
                  {b.name} {b.size_ml} ml <span className="text-xs text-muted-foreground">({b.category})</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={p.onCancelPending} className="text-xs underline">
            Cancel
          </button>
        </div>
      )}

      {p.history.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold">Last scans</div>
            <button type="button" onClick={p.onUndo} className="text-xs text-red-500 underline">
              Undo last scan
            </button>
          </div>
          {p.history.slice(0, 5).map((h) => (
            <div key={h.id} className="text-xs text-muted-foreground">
              {h.label}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{p.linkedCount} barcode(s) linked on this phone</span>
        {p.linkedCount > 0 && (
          <button type="button" onClick={p.onForgetLinks} className="underline">
            Forget all links
          </button>
        )}
      </div>
    </div>
  );
}
