// How the person wants their own side menu: which screens to show, and how big the text is.
// Everything is saved on this phone. It only changes what is shown. It never changes who is allowed to open what.

// The screens kept in the "Simple" menu. Everything else is still one tap away from the Search button at the top.
export const ESSENTIAL_IDS = ['dashboard', 'pos', 'billing', 'customers', 'payments', 'expenses', 'inventory', 'tableskot', 'excise'];

const HIDDEN_KEY = 'pt_hidden_nav';
const SIZE_KEY = 'pt_text_size';

export type TextSize = 'normal' | 'large';
export type MenuMode = 'full' | 'simple' | 'custom';

const LOCKED = ['dashboard']; // the home screen can never be hidden

// Keeps only ids that exist, once each, and never the locked ones.
export function cleanHidden(raw: unknown, validIds: string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === 'string' && validIds.includes(x) && !LOCKED.includes(x) && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

export function readHidden(validIds: string[]): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return cleanHidden(raw ? JSON.parse(raw) : [], validIds);
  } catch {
    return [];
  }
}

export function saveHidden(ids: string[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
  } catch {
    // storage can be blocked; the choice is just not remembered
  }
}

export function simpleHidden(allIds: string[]): string[] {
  return allIds.filter(id => !ESSENTIAL_IDS.includes(id));
}

export function menuMode(hidden: string[], allIds: string[]): MenuMode {
  if (hidden.length === 0) return 'full';
  const simple = simpleHidden(allIds).filter(id => !LOCKED.includes(id));
  const same = simple.length === hidden.length && simple.every(id => hidden.includes(id));
  return same ? 'simple' : 'custom';
}

export function toggleId(hidden: string[], id: string, validIds: string[]): string[] {
  if (LOCKED.includes(id) || !validIds.includes(id)) return hidden;
  return hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id];
}

export function readTextSize(): TextSize {
  try {
    return localStorage.getItem(SIZE_KEY) === 'large' ? 'large' : 'normal';
  } catch {
    return 'normal';
  }
}

export function saveTextSize(size: TextSize) {
  try {
    localStorage.setItem(SIZE_KEY, size);
  } catch {
    // storage can be blocked; the choice is just not remembered
  }
}

// The whole screen is built in rem units, so changing the root size makes everything bigger together.
export function applyTextSize(size: TextSize) {
  try {
    document.documentElement.style.fontSize = size === 'large' ? '112.5%' : '';
  } catch {
    // ignore
  }
}
