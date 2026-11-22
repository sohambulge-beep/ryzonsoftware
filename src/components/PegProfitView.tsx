import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { listExciseBrands, type ExciseBrand } from '@/lib/exciseService';
import { computePegRows, parseMoney, type PegRow } from '@/lib/pegProfit';

const input = 'rounded-md border px-3 py-2 text-sm bg-background';

const COST_KEY = 'pt_peg_profit_costs'; // bottle cost per brand, kept on this phone
const SETTINGS_KEY = 'pt_peg_profit_settings'; // target margin and spillage, kept on this phone
const PEG_CFG_KEY = 'taptrack_peg_cfg'; // peg sizes and prices saved by the Liquor counter / Brand prices
const DEFAULT_SIZES = [30, 60];

const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="p-4 text-sm">The peg profit page could not open here.</p>;
    return this.props.children;
  }
}

function readCosts(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(COST_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries<any>(raw)) {
      if (typeof v === 'string' && v.length <= 12) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeCosts(costs: Record<string, string>) {
  try {
    localStorage.setItem(COST_KEY, JSON.stringify(costs));
  } catch {
    // storage can be blocked; the cost is just not remembered
  }
}

function readSettings(): { target: string; spill: string } {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    const target = typeof raw?.target === 'string' && raw.target.length <= 6 ? raw.target : '60';
    const spill = typeof raw?.spill === 'string' && raw.spill.length <= 6 ? raw.spill : '0';
    return { target, spill };
  } catch {
    return { target: '60', spill: '0' };
  }
}

function writeSettings(s: { target: string; spill: string }) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

// The peg sizes and saved prices come from the Liquor counter. This page only reads them.
function readPegCfg(): { sizes: number[]; prices: Record<string, Record<string, string>> } {
  try {
    const p = JSON.parse(localStorage.getItem(PEG_CFG_KEY) ?? 'null');
    const sizes: number[] = Array.isArray(p?.sizes)
      ? p.sizes.filter((n: any) => Number.isInteger(n) && n >= 5 && n <= 500).slice(0, 4)
      : [];
    const prices: Record<string, Record<string, string>> = {};
    if (p?.prices && typeof p.prices === 'object' && !Array.isArray(p.prices)) {
      for (const [bid, row] of Object.entries<any>(p.prices)) {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          const clean: Record<string, string> = {};
          for (const [k, v] of Object.entries<any>(row)) {
            if (typeof v === 'string' && v.length <= 12) clean[k] = v;
          }
          prices[bid] = clean;
        }
      }
    }
    return { sizes: sizes.length > 0 ? sizes : DEFAULT_SIZES, prices };
  } catch {
    return { sizes: DEFAULT_SIZES, prices: {} };
  }
}

const STATUS_TEXT: Record<PegRow['status'], string> = {
  ok: 'Good',
  low: 'Low margin',
  loss: 'LOSS',
  'no-price': 'No price',
};
const STATUS_COLOR: Record<PegRow['status'], string> = {
  ok: 'text-emerald-500',
  low: 'text-amber-500',
  loss: 'text-red-500',
  'no-price': 'text-muted-foreground',
};

function Inner() {
  const [brands, setBrands] = useState<ExciseBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [target, setTarget] = useState('60');
  const [spill, setSpill] = useState('0');
  const [query, setQuery] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [cfg, setCfg] = useState<{ sizes: number[]; prices: Record<string, Record<string, string>> }>({
    sizes: DEFAULT_SIZES,
    prices: {},
  });

  // Read the saved values after the page has opened (keeps the server and the browser the same).
  useEffect(() => {
    setCosts(readCosts());
    const s = readSettings();
    setTarget(s.target);
    setSpill(s.spill);
    setCfg(readPegCfg());
  }, []);

  useEffect(() => {
    let alive = true;
    listExciseBrands()
      .then((list) => {
        if (alive) {
          setBrands(list);
          setError('');
        }
      })
      .catch((e: any) => {
        if (alive) setError(String(e?.message ?? 'Brands could not be loaded.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const targetNum = Math.min(95, Math.max(0, parseMoney(target) ?? 60));
  const spillNum = Math.min(50, Math.max(0, parseMoney(spill) ?? 0));

  const cards = useMemo(() => {
    return brands.map((b) => {
      const cost = parseMoney(costs[b.id] ?? '');
      const rows =
        cost && cost > 0
          ? computePegRows({
              sizeMl: Number(b.size_ml) || 0,
              bottleCost: cost,
              rate: Number(b.rate) || 0,
              savedPrices: cfg.prices[b.id],
              pegSizes: cfg.sizes,
              spillagePct: spillNum,
              targetMarginPct: targetNum,
            })
          : [];
      return { brand: b, cost, rows };
    });
  }, [brands, costs, cfg, spillNum, targetNum]);

  const summary = useMemo(() => {
    let withCost = 0;
    let problems = 0;
    let marginSum = 0;
    let marginCount = 0;
    for (const c of cards) {
      if (c.rows.length > 0) withCost += 1;
      for (const r of c.rows) {
        if (r.status === 'low' || r.status === 'loss') problems += 1;
        if (r.marginPct !== null) {
          marginSum += r.marginPct;
          marginCount += 1;
        }
      }
    }
    return { withCost, problems, avg: marginCount > 0 ? marginSum / marginCount : null };
  }, [cards]);

  const shown = cards.filter((c) => {
    const q = query.trim().toLowerCase();
    if (q && !c.brand.name.toLowerCase().includes(q)) return false;
    if (onlyProblems && !c.rows.some((r) => r.status === 'low' || r.status === 'loss')) return false;
    return true;
  });

  function setCost(id: string, text: string) {
    setCosts((prev) => {
      const next = { ...prev, [id]: text };
      if (text.trim() === '') delete next[id];
      writeCosts(next);
      return next;
    });
  }

  function changeTarget(v: string) {
    setTarget(v);
    writeSettings({ target: v, spill });
  }

  function changeSpill(v: string) {
    setSpill(v);
    writeSettings({ target, spill: v });
  }

  return (
    <div className="space-y-4 p-1">
      <div>
        <h2 className="text-lg font-semibold">Peg profit</h2>
        <p className="text-sm text-muted-foreground">
          Type what one bottle costs you. This page shows what each peg costs, what you earn on it, and which
          drinks earn too little. Nothing here changes your bills or stock.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="space-y-1">
          <span className="block text-muted-foreground">Margin you want (%)</span>
          <input
            className={`${input} w-full`}
            inputMode="decimal"
            value={target}
            onChange={(e) => changeTarget(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-muted-foreground">Spillage per bottle (%)</span>
          <input
            className={`${input} w-full`}
            inputMode="decimal"
            value={spill}
            onChange={(e) => changeSpill(e.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Peg sizes and peg prices are taken from your Liquor counter ({cfg.sizes.join(', ')} ml). Where no price is
        saved there, the price is guessed from the brand rate and marked "auto".
      </p>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-md border p-2">
          <div className="text-lg font-semibold">{summary.withCost}</div>
          <div className="text-xs text-muted-foreground">brands with cost</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-lg font-semibold">{summary.avg === null ? '-' : pct(summary.avg)}</div>
          <div className="text-xs text-muted-foreground">average margin</div>
        </div>
        <div className="rounded-md border p-2">
          <div className={`text-lg font-semibold ${summary.problems > 0 ? 'text-red-500' : ''}`}>{summary.problems}</div>
          <div className="text-xs text-muted-foreground">pegs to fix</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input
          className={`${input} flex-1 min-w-[160px]`}
          placeholder="Search brand..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
          Only low margin or loss
        </label>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading brands...</p>}
      {error && (
        <p className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          Brands could not be loaded: {error}
        </p>
      )}
      {!loading && !error && brands.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No brands yet. Add them in "Brands &amp; settings" or "Import brands" first.
        </p>
      )}

      <div className="space-y-3">
        {shown.map(({ brand, cost, rows }) => (
          <div key={brand.id} className="rounded-md border p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{brand.name}</div>
                <div className="text-xs text-muted-foreground">
                  {brand.size_ml} ml | {brand.category}
                </div>
              </div>
              <label className="text-xs text-muted-foreground text-right">
                <span className="block">Bottle cost (₹)</span>
                <input
                  className={`${input} w-28 text-right`}
                  inputMode="decimal"
                  placeholder="e.g. 1200"
                  value={costs[brand.id] ?? ''}
                  onChange={(e) => setCost(brand.id, e.target.value)}
                />
              </label>
            </div>

            {cost === null || cost <= 0 ? (
              <p className="text-xs text-muted-foreground">Type the bottle cost to see the profit.</p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No peg size fits this bottle. Check the peg sizes in the Liquor counter.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => (
                  <div key={r.ml} className="rounded-md bg-muted/40 p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {r.ml} ml peg <span className="text-xs text-muted-foreground">({r.pegsPerBottle} per bottle)</span>
                      </span>
                      <span className={`text-xs font-semibold ${STATUS_COLOR[r.status]}`}>{STATUS_TEXT[r.status]}</span>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                      <span className="text-muted-foreground">Cost per peg</span>
                      <span className="text-right">₹{inr(r.costPerPeg)}</span>
                      <span className="text-muted-foreground">Selling price{r.priceIsAuto ? ' (auto)' : ''}</span>
                      <span className="text-right">{r.sellPrice === null ? 'Not set' : `₹${inr(r.sellPrice)}`}</span>
                      <span className="text-muted-foreground">Profit per peg</span>
                      <span className="text-right">{r.profitPerPeg === null ? '-' : `₹${inr(r.profitPerPeg)}`}</span>
                      <span className="text-muted-foreground">Margin</span>
                      <span className="text-right">{r.marginPct === null ? '-' : pct(r.marginPct)}</span>
                      <span className="text-muted-foreground">Profit per full bottle</span>
                      <span className="text-right">{r.bottleProfit === null ? '-' : `₹${inr(r.bottleProfit)}`}</span>
                      {(r.status === 'low' || r.status === 'loss' || r.status === 'no-price') && r.suggestedPrice !== null && (
                        <>
                          <span className="text-muted-foreground">Price for {pct(targetNum)} margin</span>
                          <span className="text-right font-semibold">₹{inr(r.suggestedPrice)}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PegProfitView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
