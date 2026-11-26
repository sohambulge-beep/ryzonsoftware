/// <reference types="vite/client" />
import { useSyncExternalStore } from 'react';

// How the language system works
// - The app is written in English. Each language is a dictionary: "English text": "text in that language".
// - When a language other than English is chosen, every piece of text on the screen is looked up in the dictionary
//   and replaced. Text that is not in the dictionary stays in English (it is never half-translated).
// - A dictionary line can have a gap for a changing value:
//     {n}  any text   {#n}  a number   {$n}  an amount such as ₹1,250.00
//   Example: "Last {#n} days": "पिछले {n} दिन"
// - Numbers, amounts, names and anything not in the dictionary are never changed.
// - Dictionaries are loaded automatically from src/i18n/locales/<language code>/*.ts

type Dict = Record<string, string>;

const modules = import.meta.glob('./locales/*/*.ts', { eager: true }) as Record<string, { default?: Dict }>;
const bank: Record<string, Dict> = {};
for (const [path, mod] of Object.entries(modules)) {
  const m = /\.\/locales\/([^/]+)\//.exec(path);
  if (!m || !mod || typeof mod.default !== 'object' || mod.default === null) continue;
  bank[m[1]] = { ...(bank[m[1]] ?? {}), ...mod.default };
}

// ---------- looking text up ----------

interface Pattern {
  re: RegExp;
  out: string;
  names: string[];
  weight: number;
}
interface Prepared {
  exact: Map<string, string>;
  patterns: Pattern[];
}

const prepared = new Map<string, Prepared>();
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HAS_GAP = /\{[#$]?[A-Za-z0-9_]+\}/;
const GAP = /\{([#$]?)([A-Za-z0-9_]+)\}/g;
const GAP_IN_OUTPUT = /\{[#$]?([A-Za-z0-9_]+)\}/g;
const NUMBER = '(\\d+(?:\\.\\d+)?)';
const MONEY = '([-+]?\\s?₹?\\s?[\\d,]+(?:\\.\\d+)?)';

function prepare(code: string): Prepared {
  const cached = prepared.get(code);
  if (cached) return cached;
  const exact = new Map<string, string>();
  const patterns: Pattern[] = [];
  for (const [k, v] of Object.entries(bank[code] ?? {})) {
    const key = norm(k);
    if (!key || typeof v !== 'string') continue;
    if (!HAS_GAP.test(key)) {
      exact.set(key, v);
      continue;
    }
    let source = '';
    let last = 0;
    let literal = 0;
    const names: string[] = [];
    for (const m of key.matchAll(GAP)) {
      const before = key.slice(last, m.index);
      source += esc(before);
      literal += before.length;
      source += m[1] === '#' ? NUMBER : m[1] === '$' ? MONEY : '(.+?)';
      names.push(m[2]);
      last = (m.index ?? 0) + m[0].length;
    }
    const tail = key.slice(last);
    source += esc(tail);
    literal += tail.length;
    try {
      patterns.push({ re: new RegExp(`^${source}$`), out: v, names, weight: literal });
    } catch {
      // a broken dictionary line is skipped
    }
  }
  patterns.sort((a, b) => b.weight - a.weight);
  const p = { exact, patterns };
  prepared.set(code, p);
  return p;
}

const missing = new Set<string>();
const misses = new Set<string>();
const HAS_LETTER = /[A-Za-z]/;
const MISSING_KEY = 'pt_i18n_missing';
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function rememberMissing(text: string) {
  if (missing.size >= 3000 || missing.has(text)) return;
  missing.add(text);
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      sessionStorage.setItem(MISSING_KEY, JSON.stringify([...missing]));
    } catch {
      // ignore
    }
  }, 800);
}

function lookup(code: string, text: string): string | null {
  const n = norm(text);
  if (!n || n.length > 400 || !HAS_LETTER.test(n)) return null;
  const p = prepare(code);
  const hit = p.exact.get(n);
  if (hit !== undefined) return hit;
  const missKey = `${code}|${n}`;
  if (misses.has(missKey)) return null;
  for (const pat of p.patterns) {
    const m = pat.re.exec(n);
    if (!m) continue;
    return pat.out.replace(GAP_IN_OUTPUT, (whole, name: string) => {
      const i = pat.names.indexOf(name);
      return i >= 0 && m[i + 1] !== undefined ? m[i + 1] : whole;
    });
  }
  if (misses.size < 6000) misses.add(missKey);
  if (code !== 'en') rememberMissing(n);
  return null;
}

// ---------- changing the screen ----------

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = 'script,style,textarea,[translate="no"],[contenteditable="true"],.notranslate';

interface Saved {
  orig: string;
  applied: string;
}
const textState = new WeakMap<Text, Saved>();
const attrState = new WeakMap<Element, Map<string, Saved>>();

let active = 'en';
let observer: MutationObserver | null = null;
let queueNodes = new Set<Node>();
let queueAttrs = new Set<Element>();
let scheduled = false;

function applyText(node: Text) {
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const cur = node.data;
  const st = textState.get(node);
  if (st && cur === st.applied) return;
  const tr = lookup(active, cur);
  if (tr === null) {
    if (st) textState.delete(node);
    return;
  }
  const lead = /^\s*/.exec(cur)?.[0] ?? '';
  const trail = /\s*$/.exec(cur)?.[0] ?? '';
  const applied = lead + tr + trail;
  if (applied === cur) {
    if (st) textState.delete(node);
    return;
  }
  textState.set(node, { orig: cur, applied });
  node.data = applied;
}

function applyAttrs(el: Element) {
  if (el.closest(SKIP)) return;
  for (const attr of ATTRS) {
    const v = el.getAttribute(attr);
    if (v === null) continue;
    let map = attrState.get(el);
    const st = map?.get(attr);
    if (st && v === st.applied) continue;
    const tr = lookup(active, v);
    if (tr === null || tr === v) {
      if (st) map?.delete(attr);
      continue;
    }
    if (!map) {
      map = new Map();
      attrState.set(el, map);
    }
    map.set(attr, { orig: v, applied: tr });
    el.setAttribute(attr, tr);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    applyText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.closest(SKIP)) return;
  applyAttrs(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const e = n as Element;
        if (e.matches(SKIP)) return NodeFilter.FILTER_REJECT;
        applyAttrs(e);
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let t: Node | null = walker.nextNode();
  while (t) {
    applyText(t as Text);
    t = walker.nextNode();
  }
}

function restoreAll() {
  if (typeof document === 'undefined' || !document.body) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n: Node | null = walker.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text;
      const st = textState.get(t);
      if (st && t.data === st.applied) t.data = st.orig;
      textState.delete(t);
    } else {
      const el = n as Element;
      const map = attrState.get(el);
      if (map) {
        for (const [attr, st] of map) if (el.getAttribute(attr) === st.applied) el.setAttribute(attr, st.orig);
        attrState.delete(el);
      }
    }
    n = walker.nextNode();
  }
}

function flush() {
  scheduled = false;
  const nodes = queueNodes;
  const attrs = queueAttrs;
  queueNodes = new Set();
  queueAttrs = new Set();
  for (const n of nodes) if (n.isConnected) walk(n);
  for (const e of attrs) if (e.isConnected) applyAttrs(e);
  observer?.takeRecords(); // drop the changes made by this pass itself
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
  else setTimeout(flush, 16);
}

function startObserver() {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') queueNodes.add(r.target);
      else if (r.type === 'attributes') queueAttrs.add(r.target as Element);
      else r.addedNodes.forEach(n => queueNodes.add(n));
    }
    schedule();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}

function applyLanguage(code: string) {
  if (typeof document === 'undefined') return;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  restoreAll();
  active = code;
  document.documentElement.setAttribute('data-ui-lang', code);
  document.documentElement.setAttribute('lang', code);
  if (!document.body || Object.keys(bank[code] ?? {}).length === 0) return;
  walk(document.body);
  startObserver();
}

// ---------- the language choice ----------

const PREF_KEY = 'pt_lang';
export interface LanguageState {
  pref: string; // 'auto' or a language code
  active: string; // the language really shown
}
const SERVER_STATE: LanguageState = { pref: 'auto', active: 'en' };
let state: LanguageState = SERVER_STATE;
const listeners = new Set<() => void>();

export function availableCodes(): string[] {
  return ['en', ...Object.keys(bank).filter(c => c !== 'en' && Object.keys(bank[c]).length > 0)];
}

// The language of the phone or computer. If its first language is English, everything stays English.
export function detectDevice(): string {
  try {
    const tags = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language];
    const ready = availableCodes();
    for (const tag of tags) {
      const base = String(tag).toLowerCase().split('-')[0];
      if (base === 'en') return 'en';
      if (ready.includes(base)) return base;
    }
  } catch {
    // ignore
  }
  return 'en';
}

function resolve(pref: string): string {
  if (pref === 'auto') return detectDevice();
  return availableCodes().includes(pref) ? pref : 'en';
}

function readPref(): string {
  try {
    return localStorage.getItem(PREF_KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

function setState(pref: string) {
  const next = resolve(pref);
  state = { pref, active: next };
  applyLanguage(next);
  listeners.forEach(l => l());
}

export function initLanguage() {
  try {
    const raw = sessionStorage.getItem(MISSING_KEY);
    if (raw) for (const s of JSON.parse(raw)) if (typeof s === 'string') missing.add(s);
  } catch {
    // ignore
  }
  setState(readPref());
}

export function setPreference(pref: string) {
  try {
    if (pref === 'auto') localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, pref);
  } catch {
    // the choice is just not remembered
  }
  setState(pref);
}

export function useLanguage() {
  const s = useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => state,
    () => SERVER_STATE
  );
  return { pref: s.pref, active: s.active, setPreference };
}

// Translates one sentence in code (for popups such as confirm(), which are not part of the page).
export function tr(text: string): string {
  return lookup(active, text) ?? text;
}

// ---------- finding what is not translated yet ----------

export function getMissing(): string[] {
  return [...missing].sort();
}
export function clearMissing() {
  missing.clear();
  misses.clear();
  try {
    sessionStorage.removeItem(MISSING_KEY);
  } catch {
    // ignore
  }
}
