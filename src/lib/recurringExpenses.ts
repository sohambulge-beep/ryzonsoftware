// Fixed costs that repeat (rent, electricity, salary...). You set them once and the app records them when they fall due.
// Everything here is plain logic: it only decides which expenses are due. It never saves anything by itself.

export type Frequency = 'monthly' | 'weekly';

export interface RecurringTemplate {
  id: string;
  title: string;
  category: string;
  amount: number;
  paymentMethod: string;
  frequency: Frequency;
  day: number; // monthly: day of the month (1 to 28). weekly: 0 = Sunday ... 6 = Saturday
  startDate: string; // yyyy-mm-dd. Nothing before this date is recorded.
  active: boolean;
}

export interface DueItem {
  key: string; // template id + due date
  title: string;
  category: string;
  amount: number;
  paymentMethod: string;
  dueDate: string;
}

export const CHANGE_EVENT = 'pt-recurring-changed';
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_CATCH_UP = 3; // if the app was not opened for a long time, only the last 3 due items are recorded

const TEMPLATES_KEY = 'pt_recurring_expenses';
const DONE_KEY = 'pt_recurring_done';

const pad = (n: number) => String(n).padStart(2, '0');

// Local date as yyyy-mm-dd (not UTC, so late evening does not become tomorrow).
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

export function expenseTitle(t: RecurringTemplate, dueDate: string): string {
  const d = parseDate(dueDate);
  if (!d) return t.title;
  const label = t.frequency === 'monthly' ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : `week of ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${t.title} (${label})`;
}

// Due dates from the start date up to today (newest 3 only).
export function dueDates(t: RecurringTemplate, today: Date): string[] {
  const start = parseDate(t.startDate);
  if (!start) return [];
  const todayStr = localDateStr(today);
  const startStr = localDateStr(start);
  const out: string[] = [];

  if (t.frequency === 'monthly') {
    const day = Math.min(28, Math.max(1, Math.floor(t.day) || 1));
    let y = start.getFullYear();
    let m = start.getMonth();
    for (let i = 0; i < 600; i++) {
      const dt = new Date(y, m, Math.min(day, daysInMonth(y, m)));
      const s = localDateStr(dt);
      if (s > todayStr) break;
      if (s >= startStr) out.push(s);
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  } else {
    const wd = Math.min(6, Math.max(0, Math.floor(t.day) || 0));
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    for (let i = 0; i < 4000 && localDateStr(cur) <= todayStr; i++) {
      if (cur.getDay() === wd) out.push(localDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  return out.slice(-MAX_CATCH_UP);
}

// The first due date after today (shown in the list).
export function nextDue(t: RecurringTemplate, today: Date): string {
  const todayStr = localDateStr(today);
  if (t.frequency === 'monthly') {
    const day = Math.min(28, Math.max(1, Math.floor(t.day) || 1));
    let y = today.getFullYear();
    let m = today.getMonth();
    for (let i = 0; i < 3; i++) {
      const s = localDateStr(new Date(y, m, Math.min(day, daysInMonth(y, m))));
      if (s > todayStr && s >= t.startDate) return s;
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
    return '';
  }
  const wd = Math.min(6, Math.max(0, Math.floor(t.day) || 0));
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (d.getDay() === wd && localDateStr(d) >= t.startDate) return localDateStr(d);
  }
  return '';
}

// What to record now. An item is recorded only if no expense with the same title exists, so it can never double up.
// Once an item is seen in the expense list it is remembered; if the person later deletes it, it is not brought back.
export function findToCreate(
  templates: RecurringTemplate[],
  expenseTitles: Set<string>,
  doneKeys: Set<string>,
  today: Date
): { create: DueItem[]; confirm: string[] } {
  const create: DueItem[] = [];
  const confirm: string[] = [];
  for (const t of templates) {
    if (!t.active) continue;
    for (const dueDate of dueDates(t, today)) {
      const key = `${t.id}|${dueDate}`;
      const title = expenseTitle(t, dueDate);
      if (expenseTitles.has(title)) {
        if (!doneKeys.has(key)) confirm.push(key);
      } else if (!doneKeys.has(key)) {
        create.push({ key, title, category: t.category, amount: t.amount, paymentMethod: t.paymentMethod, dueDate });
      }
    }
  }
  return { create, confirm };
}

export function makeId(): string {
  return `rec-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function cleanTemplate(v: any): RecurringTemplate | null {
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !v.id) return null;
  const amount = Number(v.amount);
  const frequency: Frequency = v.frequency === 'weekly' ? 'weekly' : 'monthly';
  const day = Math.floor(Number(v.day));
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(day)) return null;
  if (!parseDate(String(v.startDate ?? ''))) return null;
  return {
    id: v.id.slice(0, 60),
    title: String(v.title ?? '').slice(0, 100),
    category: String(v.category ?? 'Other').slice(0, 60),
    amount,
    paymentMethod: String(v.paymentMethod ?? 'Bank Transfer').slice(0, 40),
    frequency,
    day: frequency === 'monthly' ? Math.min(28, Math.max(1, day)) : Math.min(6, Math.max(0, day)),
    startDate: String(v.startDate),
    active: v.active !== false,
  };
}

export function readTemplates(): RecurringTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const out: RecurringTemplate[] = [];
    for (const v of parsed) {
      const c = cleanTemplate(v);
      if (c && c.title.trim()) out.push(c);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveTemplates(list: RecurringTemplate[]) {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // storage can be blocked; the change is just not remembered
  }
}

export function readDone(): string[] {
  try {
    const raw = localStorage.getItem(DONE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveDone(keys: string[]) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(keys.slice(-600)));
  } catch {
    // ignore
  }
}
