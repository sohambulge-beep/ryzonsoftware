import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '@/store';
import { readVoidLog, VOID_EVENT, type VoidEntry } from '@/lib/voidLog';
import { readReturnLog, RETURN_EVENT, type SalesReturnEntry } from '@/lib/salesReturnLog';
import {
  buildLeakageReport,
  MANY_VOIDS,
  type LeakageKind,
  type PeriodId,
} from '@/lib/leakageReport';

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All' },
];

const KIND_TEXT: Record<LeakageKind, string> = {
  void: 'Cancelled bill',
  return: 'Items returned',
  discount: 'Discount',
  free: 'FREE bill',
};
const KIND_COLOR: Record<LeakageKind, string> = {
  void: 'text-red-500',
  return: 'text-amber-500',
  discount: 'text-sky-500',
  free: 'text-red-500',
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    if (this.state.failed) return <p className="p-4 text-sm">The leakage page could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const { db } = useStore();
  const [period, setPeriod] = useState<PeriodId>('7d');
  const [voids, setVoids] = useState<VoidEntry[]>([]);
  const [returns, setReturns] = useState<SalesReturnEntry[]>([]);

  // The saved records are read after the page has opened, and read again when a new one is added.
  useEffect(() => {
    const load = () => {
      setVoids(readVoidLog());
      setReturns(readReturnLog());
    };
    load();
    window.addEventListener(VOID_EVENT, load);
    window.addEventListener(RETURN_EVENT, load);
    return () => {
      window.removeEventListener(VOID_EVENT, load);
      window.removeEventListener(RETURN_EVENT, load);
    };
  }, []);

  const report = useMemo(
    () => buildLeakageReport({ voids, returns, invoices: db.invoices, period }),
    [voids, returns, db.invoices, period],
  );

  const flagged = report.staff.filter((s) => s.watch.length > 0);
  const nothing = report.voidCount + report.returnCount + report.discountCount === 0;

  return (
    <div className="space-y-4 p-1">
      <div>
        <h2 className="text-lg font-semibold">Leakage watch</h2>
        <p className="text-sm text-muted-foreground">
          Shows where money slips away: cancelled bills, items returned and discounts or free drinks, and who did
          them. It only reads what is already saved. It never changes a bill.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={`rounded-md border px-3 py-1.5 text-sm ${period === p.id ? 'bg-amber-500 text-zinc-950 font-semibold' : ''}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="rounded-md border p-3 text-center">
        <div className="text-xs text-muted-foreground">Money lost in this period (approx.)</div>
        <div className={`text-2xl font-bold ${report.leakageAmount > 0 ? 'text-red-500' : ''}`}>{inr(report.leakageAmount)}</div>
        <div className="text-xs text-muted-foreground">
          {report.leakagePct === null ? 'No sales yet' : `${report.leakagePct.toFixed(1)}% of what sales would have been`}
        </div>
        <div className="text-xs text-muted-foreground">Net sales: {inr(report.netSales)}</div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-md border p-2">
          <div className="text-lg font-semibold">{report.voidCount}</div>
          <div className="text-xs text-muted-foreground">cancelled bills</div>
          <div className="text-xs">{inr(report.voidAmount)}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-lg font-semibold">{report.returnCount}</div>
          <div className="text-xs text-muted-foreground">returns</div>
          <div className="text-xs">{inr(report.returnAmount)}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-lg font-semibold">{report.discountCount}</div>
          <div className="text-xs text-muted-foreground">discounts</div>
          <div className="text-xs">{inr(report.discountAmount)}</div>
        </div>
      </div>

      {flagged.length > 0 && (
        <div className="rounded-md border border-red-500/50 p-3 space-y-1">
          <div className="text-sm font-semibold text-red-500">Needs your attention</div>
          {flagged.map((s) => (
            <div key={s.by} className="text-sm">
              <span className="font-medium">{s.by}</span>: {s.watch.join(', ')}
            </div>
          ))}
          <div className="text-xs text-muted-foreground">
            A login is flagged for any free bill (100% discount) or {MANY_VOIDS} or more cancelled bills. Ask the
            person what happened. Some of these can be genuine.
          </div>
        </div>
      )}

      {nothing ? (
        <p className="text-sm text-muted-foreground">
          Nothing to show for this period. Cancelled bills, returns and discounts will appear here.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="text-sm font-semibold">By login</div>
            {report.staff.map((s) => (
              <div key={s.by} className="rounded-md border p-3 text-sm space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium break-all">{s.by}</span>
                  <span className="font-semibold">{inr(s.total)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.voids} cancelled ({inr(s.voidAmount)}) | {s.returns} returns ({inr(s.returnAmount)}) |{' '}
                  {s.discounts} discounts ({inr(s.discountAmount)})
                  {s.free > 0 ? ` | ${s.free} free` : ''}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Latest events</div>
            {report.events.slice(0, 30).map((e, i) => (
              <div key={`${e.kind}-${e.invoiceNo}-${e.at}-${i}`} className="rounded-md bg-muted/40 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${KIND_COLOR[e.kind]}`}>{KIND_TEXT[e.kind]}</span>
                  <span className="font-medium">{inr(e.amount)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.invoiceNo} | {e.by} | {when(e.at)}
                </div>
                {e.reason && <div className="text-xs">Reason: {e.reason}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Note: the records of cancelled bills and returns are kept on this phone, so this page shows what was done on
        this phone. For each person to show separately, every person must use their own login.
      </p>
    </div>
  );
}

export default function LeakageWatchView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
