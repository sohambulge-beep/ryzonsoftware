import { Component, useEffect, useState, type ReactNode } from "react";
import { loadState } from "../data";
import { supabase } from "../integrations/supabase/client";

const STREAK_KEY = "pt_close_streak";
const LAST_CLOSE_KEY = "pt_last_close_date";
const LAST_BACKUP_KEY = "pt_auto_last_at";

const NOTES = [
  "Aaj ki mehnat, kal ka fayda.",
  "Aaj ka hisaab saaf, kal ki shuruaat taiyar.",
  "Thoda aaram karo, kal phir naye hisaab ke saath milte hain.",
  "Har bottle ka hisaab rakhne wala hi asli malik hota hai.",
  "Kal ka din aaj se bhi accha hoga.",
  "Aaj ka kaam khatam. Ab chain ki neend.",
];

const STARS: [number, number][] = [
  [10, 8], [25, 20], [40, 6], [55, 14], [70, 9], [85, 18], [92, 5],
  [15, 32], [48, 28], [78, 30], [5, 45], [63, 40], [33, 44], [90, 38],
];

const css = `
@keyframes ptc-fill { from { transform: translateY(86px); } to { transform: translateY(0); } }
@keyframes ptc-rise { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: .8; } 100% { transform: translateY(-70px); opacity: 0; } }
@keyframes ptc-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes ptc-twinkle { 0%, 100% { opacity: .15; } 50% { opacity: 1; } }
@keyframes ptc-glow { 0%, 100% { filter: drop-shadow(0 0 6px rgba(245,158,11,.35)); } 50% { filter: drop-shadow(0 0 16px rgba(245,158,11,.8)); } }
.ptc-beer, .ptc-foam { animation: ptc-fill 2.4s ease-out forwards; transform: translateY(86px); }
.ptc-bub { animation: ptc-rise 2.4s ease-in infinite; opacity: 0; }
.ptc-glow { animation: ptc-glow 3s ease-in-out infinite; }
.ptc-star { position: absolute; width: 3px; height: 3px; border-radius: 9999px; background: #fef3c7; animation: ptc-twinkle 3s ease-in-out infinite; }
.ptc-fade { opacity: 0; animation: ptc-fade .7s ease-out forwards; }
.ptc-d1 { animation-delay: 1.8s; } .ptc-d2 { animation-delay: 2.2s; } .ptc-d3 { animation-delay: 2.6s; }
.ptc-d4 { animation-delay: 3s; } .ptc-d5 { animation-delay: 3.4s; } .ptc-d6 { animation-delay: 3.8s; }
@media (prefers-reduced-motion: reduce) {
  .ptc-beer, .ptc-foam { animation: none; transform: none; }
  .ptc-bub { display: none; }
  .ptc-glow, .ptc-star { animation: none; }
  .ptc-fade { animation: none; opacity: 1; }
}
`;

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const stamp = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

interface Summary {
  bar: string;
  bills: number;
  salesP: number;
  collectedP: number;
  dueP: number;
  expenseP: number;
  topItem: string;
  owingCount: number;
  owingP: number;
  owingNames: string[];
  lowNames: string[];
  backupAt: number;
  streak: number;
  note: string;
}

// Counts how many days in a row the shop was closed properly with this screen.
function updateStreak(): number {
  try {
    const today = localDate(0);
    const last = localStorage.getItem(LAST_CLOSE_KEY);
    const cur = parseInt(localStorage.getItem(STREAK_KEY) ?? "0", 10) || 0;
    let next = 1;
    if (last === today) next = Math.max(cur, 1);
    else if (last === localDate(-1)) next = cur + 1;
    localStorage.setItem(LAST_CLOSE_KEY, today);
    localStorage.setItem(STREAK_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

function build(): Summary {
  const note = NOTES[Math.floor(Date.now() / 86400000) % NOTES.length];
  let backupAt = 0;
  try {
    backupAt = Number(localStorage.getItem(LAST_BACKUP_KEY) || 0) || 0;
  } catch {
    // storage can be blocked
  }
  const streak = updateStreak();
  try {
    const db: any = loadState();
    const today = localDate(0);
    const invoices: any[] = Array.isArray(db?.invoices) ? db.invoices : [];
    const bills = invoices.filter((i) => dateOf(String(i?.timestamp ?? "")) === today);
    const sum = (arr: any[], f: (x: any) => any) => arr.reduce((s, x) => s + paise(f(x)), 0);

    const items = new Map<string, number>();
    for (const b of bills) {
      for (const it of Array.isArray(b?.items) ? b.items : []) {
        const name = String(it?.beerName ?? "");
        if (!name) continue;
        items.set(name, (items.get(name) ?? 0) + (Number(it?.qty) || 0));
      }
    }
    const top = Array.from(items.entries()).sort((a, b) => b[1] - a[1])[0];

    const customers: any[] = Array.isArray(db?.customers) ? db.customers : [];
    const owing = customers
      .filter((c) => paise(c?.currentBalance) > 0)
      .sort((a, b) => paise(b.currentBalance) - paise(a.currentBalance));

    const taps: any[] = Array.isArray(db?.taps) ? db.taps : [];
    const low = taps
      .filter((t) => (Number(t?.currentLiters) || 0) < 10)
      .sort((a, b) => (Number(a.currentLiters) || 0) - (Number(b.currentLiters) || 0));

    const expenses: any[] = Array.isArray(db?.expenses) ? db.expenses : [];
    const todays = expenses.filter((e) => String(e?.date ?? "") === today);

    return {
      bar: String(db?.settings?.barName ?? ""),
      bills: bills.length,
      salesP: sum(bills, (b) => b.total),
      collectedP: sum(bills, (b) => b.paidAmount),
      dueP: sum(bills, (b) => b.balanceDue),
      expenseP: sum(todays, (e) => e.amount),
      topItem: top ? `${top[0]} (${top[1]} pint)` : "",
      owingCount: owing.length,
      owingP: owing.reduce((s, c) => s + paise(c.currentBalance), 0),
      owingNames: owing.slice(0, 3).map((c) => String(c.name)),
      lowNames: low.slice(0, 3).map((t) => String(t.name)),
      backupAt,
      streak,
      note,
    };
  } catch {
    return {
      bar: "",
      bills: 0,
      salesP: 0,
      collectedP: 0,
      dueP: 0,
      expenseP: 0,
      topItem: "",
      owingCount: 0,
      owingP: 0,
      owingNames: [],
      lowNames: [],
      backupAt,
      streak,
      note,
    };
  }
}

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Inner() {
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [sum, setSum] = useState<Summary | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setSignedIn(!!data.session);
      })
      .catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setSignedIn(!!session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openIt() {
    setSum(build());
    setOpen(true);
  }

  if (!signedIn && !open) return null;

  const backupOld = sum ? sum.backupAt > 0 && Date.now() - sum.backupAt > 24 * 60 * 60 * 1000 : false;

  return (
    <>
      <style>{css}</style>

      {!open && (
        <button
          type="button"
          aria-label="Close shop for today"
          title="Close shop for today"
          onClick={openIt}
          className="fixed bottom-3 left-3 flex h-11 w-11 items-center justify-center rounded-full border bg-background text-foreground shadow"
          style={{ zIndex: 40 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 2v10" />
            <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
          </svg>
        </button>
      )}

      {open && sum && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Closing the shop"
          className="fixed inset-0 overflow-y-auto"
          style={{
            zIndex: 100,
            color: "#f5f5f4",
            background: "linear-gradient(180deg, #0b1020 0%, #1b1030 55%, #2a1608 100%)",
          }}
        >
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            {STARS.map(([x, y], i) => (
              <span
                key={i}
                className="ptc-star"
                style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i % 7) * 0.4}s` }}
              />
            ))}
          </div>

          <div className="relative mx-auto flex min-h-full max-w-md flex-col items-center px-5 py-10 text-center">
            <svg width="140" height="160" viewBox="0 0 120 140" className="ptc-glow" aria-hidden="true">
              <defs>
                <clipPath id="ptcMug">
                  <rect x="22" y="32" width="60" height="86" rx="6" />
                </clipPath>
              </defs>
              <path d="M84 52h12a14 14 0 0 1 0 38H84" fill="none" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" />
              <rect x="20" y="30" width="64" height="90" rx="8" fill="none" stroke="#fbbf24" strokeWidth="4" />
              <g clipPath="url(#ptcMug)">
                <rect className="ptc-beer" x="22" y="32" width="60" height="86" fill="#f59e0b" />
                <g className="ptc-foam">
                  <circle cx="30" cy="36" r="8" fill="#fff7ed" />
                  <circle cx="44" cy="35" r="9" fill="#fff7ed" />
                  <circle cx="58" cy="36" r="8" fill="#fff7ed" />
                  <circle cx="72" cy="35" r="9" fill="#fff7ed" />
                </g>
                <circle className="ptc-bub" cx="36" cy="112" r="2.5" fill="#fde68a" style={{ animationDelay: "2.4s" }} />
                <circle className="ptc-bub" cx="52" cy="112" r="2" fill="#fde68a" style={{ animationDelay: "3s", animationDuration: "2.8s" }} />
                <circle className="ptc-bub" cx="68" cy="112" r="3" fill="#fde68a" style={{ animationDelay: "3.5s", animationDuration: "3.1s" }} />
              </g>
            </svg>

            <h2 className="ptc-fade ptc-d1 mt-4 text-2xl font-bold">Shabaash! Aaj ka din poora hua</h2>
            {sum.bar && <p className="ptc-fade ptc-d1 mt-1 text-sm" style={{ color: "#fcd34d" }}>{sum.bar}</p>}

            <p className="ptc-fade ptc-d2 mt-3 rounded-full px-3 py-1 text-xs" style={{ background: "rgba(245,158,11,.18)", color: "#fde68a" }}>
              🔥 {sum.streak} din lagatar hisaab band kiya
            </p>

            <div className="ptc-fade ptc-d3 mt-5 w-full rounded-xl p-4 text-left text-sm" style={{ background: "rgba(255,255,255,.07)" }}>
              <p className="mb-2 font-semibold">Aaj ka hisaab</p>
              <p>Bills: {sum.bills}</p>
              <p>Bikri: {inr(sum.salesP)}</p>
              <p>Mile hue paise: {inr(sum.collectedP)}</p>
              <p>Aaj ka udhaar: {inr(sum.dueP)}</p>
              <p>Kharche: {inr(sum.expenseP)}</p>
              {sum.topItem && <p className="mt-1" style={{ color: "#fcd34d" }}>Aaj ka sitara: {sum.topItem}</p>}
            </div>

            <div className="ptc-fade ptc-d4 mt-4 w-full rounded-xl p-4 text-left text-sm" style={{ background: "rgba(255,255,255,.07)" }}>
              <p className="mb-2 font-semibold">Kal ke liye</p>
              {sum.owingCount === 0 && sum.lowNames.length === 0 ? (
                <p>Sab theek hai, kal ke liye koi pending nahi.</p>
              ) : (
                <>
                  {sum.owingCount > 0 && (
                    <p>
                      {sum.owingCount} customer par {inr(sum.owingP)} baaki: {sum.owingNames.join(", ")}
                    </p>
                  )}
                  {sum.lowNames.length > 0 && <p>Keg kam bachi: {sum.lowNames.join(", ")}</p>}
                </>
              )}
            </div>

            <p className="ptc-fade ptc-d5 mt-4 text-xs" style={{ color: backupOld ? "#fca5a5" : "#d6d3d1" }}>
              {sum.backupAt > 0
                ? `Cloud backup: ${stamp(sum.backupAt)}${backupOld ? " (24 ghante se purana, Excise me Cloud backup kholo)" : ""}`
                : "Cloud backup abhi on nahi hai"}
            </p>

            <p className="ptc-fade ptc-d6 mt-5 text-base" style={{ color: "#fde68a" }}>{sum.note}</p>

            <button
              type="button"
              autoFocus
              onClick={() => setOpen(false)}
              className="ptc-fade ptc-d6 mt-8 rounded-lg px-6 py-3 text-sm font-semibold"
              style={{ background: "#f59e0b", color: "#18181b" }}
            >
              Wapas kaam par
            </button>
            <p className="ptc-fade ptc-d6 mt-3 text-xs" style={{ color: "#a8a29e" }}>
              Ab aap app band kar sakte hain. Kal milte hain!
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export default function ClosingScreen() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
