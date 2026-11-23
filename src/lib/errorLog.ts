// A small record of the errors this app runs into on a phone, so a customer can send them to support.
// It keeps the last few errors on this phone only. Nothing is sent anywhere until the person taps "Send".

export type ErrorKind = 'error' | 'promise';

export interface ErrorEntry {
  id: string;
  at: string;
  kind: ErrorKind;
  message: string;
  where: string;
  stack: string;
  count: number;
}

export interface DeviceInfo {
  time: string;
  page: string;
  userAgent: string;
  language: string;
  online: boolean | null;
  screen: string;
  installed: boolean | null;
}

export const ERROR_EVENT = 'pt-error-log';

const KEY = 'pt_error_log';
const MAX = 50;

// Harmless noise that browsers report and that nobody can act on.
const IGNORED: RegExp[] = [/ResizeObserver loop/i, /^script error\.?$/i, /AbortError/i, /The user aborted a request/i];

/** The number that is in providerConfig.ts when the owner has not set their own yet. */
export const PLACEHOLDER_PHONE = '919876543210';

/** Removes anything that looks like a password, token, key, email or a long secret, and the part of a link after "?". */
export function sanitize(text: unknown, max = 300): string {
  let s = String(text ?? '');
  s = s.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [hidden]');
  s = s.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[hidden]');
  s = s.replace(/\b(access_token|refresh_token|id_token|apikey|api_key|token|secret|password|key)=([^&\s"')]+)/gi, '$1=[hidden]');
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  s = s.replace(/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, '[hidden]');
  s = s.replace(/\?[^\s)"']+/g, '?...');
  return s.slice(0, max);
}

function clean(v: any): ErrorEntry | null {
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !v.id) return null;
  return {
    id: v.id.slice(0, 40),
    at: String(v.at ?? ''),
    kind: v.kind === 'promise' ? 'promise' : 'error',
    message: String(v.message ?? '').slice(0, 300),
    where: String(v.where ?? '').slice(0, 120),
    stack: String(v.stack ?? '').slice(0, 800),
    count: Math.max(1, Math.floor(Number(v.count) || 1)),
  };
}

/** Newest first. */
export function readErrors(): ErrorEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const out: ErrorEntry[] = [];
    for (const v of parsed) {
      const c = clean(v);
      if (c) out.push(c);
    }
    return out;
  } catch {
    return [];
  }
}

function write(list: ErrorEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    try {
      window.dispatchEvent(new Event(ERROR_EVENT));
    } catch {
      // ignore
    }
  } catch {
    // storage can be blocked or full; the error is just not kept
  }
}

export function clearErrors() {
  write([]);
}

function messageOf(err: unknown): { message: string; stack: string } {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; stack?: unknown };
    const message = typeof e.message === 'string' && e.message ? e.message : '';
    const stack = typeof e.stack === 'string' ? e.stack : '';
    if (message || stack) return { message: message || 'Unknown error', stack };
    try {
      return { message: JSON.stringify(err).slice(0, 300), stack: '' };
    } catch {
      return { message: 'Unknown error', stack: '' };
    }
  }
  return { message: String(err ?? 'Unknown error'), stack: '' };
}

/** Saves one error. The same error twice in a row is counted, not repeated. */
export function captureError(kind: ErrorKind, err: unknown, where = ''): void {
  try {
    const raw = messageOf(err);
    const message = sanitize(raw.message, 300);
    if (!message || IGNORED.some((re) => re.test(message))) return;
    const stack = sanitize(raw.stack.split('\n').slice(0, 4).join('\n'), 800);
    const at = new Date().toISOString();
    const place = sanitize(where, 120);

    const list = readErrors();
    const last = list[0];
    if (last && last.message === message && last.where === place && last.kind === kind) {
      list[0] = { ...last, at, count: last.count + 1 };
    } else {
      list.unshift({ id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at, kind, message, where: place, stack, count: 1 });
    }
    write(list);
  } catch {
    // never let the error recorder cause another error
  }
}

let installed = false;

/** Starts listening for errors anywhere in the app. Returns a function that stops it. */
export function installErrorCapture(): () => void {
  if (typeof window === 'undefined' || installed) return () => {};
  installed = true;
  const onError = (e: ErrorEvent) => {
    const file = String(e.filename ?? '').split('/').pop()?.split('?')[0] ?? '';
    captureError('error', e.error ?? e.message, file ? `${file}:${e.lineno ?? 0}` : '');
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    captureError('promise', e.reason);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    installed = false;
  };
}

/** Facts about this phone and browser that help to find a problem. Contains no bills, customers or stock. */
export function collectDeviceInfo(): DeviceInfo {
  const safe = <T,>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    time: new Date().toLocaleString('en-IN'),
    page: safe(() => window.location.pathname, ''),
    userAgent: safe(() => sanitize(navigator.userAgent, 200), ''),
    language: safe(() => navigator.language, ''),
    online: safe(() => navigator.onLine, null),
    screen: safe(() => `${window.screen.width}x${window.screen.height}`, ''),
    installed: safe(() => window.matchMedia('(display-mode: standalone)').matches, null),
  };
}

/** The message a customer sends to support. Kept short enough for a WhatsApp link. */
export function buildSupportReport(opts: {
  appName: string;
  note: string;
  errors: ErrorEntry[];
  device: DeviceInfo;
  maxErrors?: number;
}): string {
  const d = opts.device;
  const yn = (v: boolean | null) => (v === null ? 'unknown' : v ? 'yes' : 'no');
  const lines: string[] = [];
  lines.push(`${opts.appName} problem report`);
  lines.push(`Time: ${d.time}`);
  lines.push(`Page: ${d.page || '-'}`);
  lines.push(`Phone/browser: ${d.userAgent || '-'}`);
  lines.push(`Screen: ${d.screen || '-'} | Online: ${yn(d.online)} | Installed app: ${yn(d.installed)}`);
  const note = sanitize(opts.note, 400).trim();
  if (note) lines.push(`What went wrong: ${note}`);
  const shown = opts.errors.slice(0, opts.maxErrors ?? 5);
  if (shown.length === 0) {
    lines.push('Recent errors: none recorded');
  } else {
    lines.push(`Recent errors (${shown.length} of ${opts.errors.length}):`);
    shown.forEach((e, i) => {
      const when = new Date(e.at);
      const t = Number.isNaN(when.getTime()) ? '' : when.toLocaleString('en-IN');
      lines.push(`${i + 1}) ${t} - ${e.message}${e.count > 1 ? ` (x${e.count})` : ''}${e.where ? ` @ ${e.where}` : ''}`);
      const first = e.stack.split('\n').slice(0, 2).join(' | ');
      if (first) lines.push(`   ${first}`);
    });
  }
  return lines.join('\n').slice(0, 1800);
}

/** The digits of a usable support number, or null when it is empty, too short or still the sample number. */
export function usableSupportNumber(phone: string | undefined | null): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits === PLACEHOLDER_PHONE) return null;
  return digits;
}
