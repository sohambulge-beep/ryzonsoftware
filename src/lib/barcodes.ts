// Barcode scanning for the physical stock check.
// A bottle's barcode is linked once to a brand (kept on this phone). After that, every scan of that barcode
// adds one bottle to the brand's counted number. A USB or Bluetooth scanner types the number and presses Enter,
// the phone camera reads it too, and a number can also be typed by hand.

/** barcode -> brand id */
export type BarcodeMap = Record<string, string>;

const MAP_KEY = 'pt_brand_barcodes';
const MAX_LINKS = 5000;

/** A barcode is 6 to 20 letters, digits or dashes. Spaces and line breaks added by a scanner are removed. */
export function normalizeBarcode(raw: unknown): string | null {
  const s = String(raw ?? '')
    .replace(/[\s\u0000-\u001f]/g, '')
    .toUpperCase();
  return /^[0-9A-Z-]{6,20}$/.test(s) ? s : null;
}

export function readBarcodeMap(): BarcodeMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: BarcodeMap = {};
    let n = 0;
    for (const [code, brandId] of Object.entries<any>(parsed)) {
      if (n >= MAX_LINKS) break;
      if (typeof brandId === 'string' && brandId.length > 0 && brandId.length <= 80 && normalizeBarcode(code) === code) {
        out[code] = brandId;
        n += 1;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveBarcodeMap(map: BarcodeMap): void {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
  } catch {
    // storage can be blocked; the link is just not remembered
  }
}

/** Links a barcode to a brand. A barcode belongs to one brand; a brand can have many barcodes. */
export function linkBarcode(map: BarcodeMap, code: string, brandId: string): BarcodeMap {
  return { ...map, [code]: brandId };
}

export function findBrandId(map: BarcodeMap, code: string): string | null {
  return Object.prototype.hasOwnProperty.call(map, code) ? map[code] : null;
}

export function countLinks(map: BarcodeMap): number {
  return Object.keys(map).length;
}

export interface ScanBrand {
  brand_id: string;
  name: string;
  size_ml: number;
  category: string;
}

export type ScanResult =
  | { kind: 'invalid' }
  | { kind: 'unknown'; code: string }
  | { kind: 'counted'; code: string; brandId: string; prev: string | undefined; next: string };

/** The counted number after one more bottle. Counts are kept as text, like the numbers typed on the page. */
export function addBottle(counts: Record<string, string>, brandId: string): Record<string, string> {
  const n = Number(counts[brandId] ?? 0);
  const next = Math.min(999999, (Number.isFinite(n) ? Math.floor(n) : 0) + 1);
  return { ...counts, [brandId]: String(next) };
}

/** Puts a brand's counted number back to what it was before a scan. "undefined" means it was not counted yet. */
export function restoreCount(
  counts: Record<string, string>,
  brandId: string,
  prev: string | undefined,
): Record<string, string> {
  const next = { ...counts };
  if (prev === undefined) delete next[brandId];
  else next[brandId] = prev;
  return next;
}

/** Decides what a scan means. It does not change anything. */
export function processScan(
  raw: unknown,
  map: BarcodeMap,
  brands: ScanBrand[],
  counts: Record<string, string>,
): ScanResult {
  const code = normalizeBarcode(raw);
  if (!code) return { kind: 'invalid' };
  const brandId = findBrandId(map, code);
  if (!brandId || !brands.some((b) => b.brand_id === brandId)) return { kind: 'unknown', code };
  const prev = counts[brandId];
  return { kind: 'counted', code, brandId, prev, next: addBottle(counts, brandId)[brandId] };
}

// ---------------------------------------------------------------------------------------------
// The scan "state machine". The stock check page keeps this state and sends it actions.
// It is plain code with no screen in it, so every case can be tested.
// ---------------------------------------------------------------------------------------------

export interface ScanNote {
  kind: 'ok' | 'info' | 'warn';
  text: string;
}

export interface ScanHistoryEntry {
  id: number;
  label: string;
  brandId: string;
  /** The counted number before this scan. "undefined" means the brand had not been counted yet. */
  prev: string | undefined;
}

export interface ScanState {
  counts: Record<string, string>;
  map: BarcodeMap;
  /** A barcode that is not linked to a brand yet, waiting for the person to choose one. */
  pending: string | null;
  history: ScanHistoryEntry[];
  note: ScanNote | null;
  nextId: number;
}

export type ScanAction =
  | { type: 'scan'; raw: string }
  | { type: 'pick'; brandId: string }
  | { type: 'cancel' }
  | { type: 'undo' }
  | { type: 'forget' }
  | { type: 'clear-history' };

const MAX_HISTORY = 50;

export function emptyScanState(counts: Record<string, string>, map: BarcodeMap): ScanState {
  return { counts, map, pending: null, history: [], note: null, nextId: 1 };
}

function countOne(state: ScanState, brand: ScanBrand, code: string): ScanState {
  const prev = state.counts[brand.brand_id];
  const counts = addBottle(state.counts, brand.brand_id);
  const label = `${brand.name} ${brand.size_ml} ml: counted ${counts[brand.brand_id]}`;
  return {
    ...state,
    counts,
    pending: null,
    history: [{ id: state.nextId, label, brandId: brand.brand_id, prev }, ...state.history].slice(0, MAX_HISTORY),
    note: { kind: 'ok', text: `${label} (barcode ${code})` },
    nextId: state.nextId + 1,
  };
}

export function scanReducer(state: ScanState, action: ScanAction, brands: ScanBrand[]): ScanState {
  switch (action.type) {
    case 'scan': {
      if (brands.length === 0) {
        return { ...state, note: { kind: 'warn', text: 'The stock list is not loaded yet. Tap "Refresh stock" and scan again.' } };
      }
      const r = processScan(action.raw, state.map, brands, state.counts);
      if (r.kind === 'invalid') {
        return { ...state, note: { kind: 'warn', text: 'That does not look like a barcode. Scan again or type the full number.' } };
      }
      if (r.kind === 'unknown') {
        return { ...state, pending: r.code, note: { kind: 'info', text: `New barcode ${r.code}. Choose which brand it is.` } };
      }
      const brand = brands.find((b) => b.brand_id === r.brandId);
      return brand ? countOne(state, brand, r.code) : state;
    }
    case 'pick': {
      if (!state.pending) return state;
      const brand = brands.find((b) => b.brand_id === action.brandId);
      if (!brand) return { ...state, note: { kind: 'warn', text: 'That brand was not found. Choose again.' } };
      const linked: ScanState = { ...state, map: linkBarcode(state.map, state.pending, brand.brand_id) };
      return countOne(linked, brand, state.pending);
    }
    case 'cancel':
      return { ...state, pending: null, note: null };
    case 'undo': {
      const [last, ...rest] = state.history;
      if (!last) return { ...state, note: { kind: 'info', text: 'There is no scan to undo.' } };
      return {
        ...state,
        counts: restoreCount(state.counts, last.brandId, last.prev),
        history: rest,
        note: { kind: 'info', text: 'Last scan undone.' },
      };
    }
    case 'forget':
      return { ...state, map: {}, pending: null, note: { kind: 'info', text: 'All barcode links were forgotten.' } };
    case 'clear-history':
      return { ...state, history: [] };
    default:
      return state;
  }
}
