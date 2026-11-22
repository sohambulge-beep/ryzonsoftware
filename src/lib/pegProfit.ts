// Peg profit maths. Everything is worked out in paise (whole numbers) so the totals add up exactly.

export type PegStatus = 'ok' | 'low' | 'loss' | 'no-price';

export interface PegRow {
  /** Peg size in ml. */
  ml: number;
  /** How many pegs one bottle gives (after spillage). */
  pegsPerBottle: number;
  /** Cost of one peg, in rupees. */
  costPerPeg: number;
  /** Selling price of one peg, in rupees. Null when no price is known. */
  sellPrice: number | null;
  /** True when the price was worked out from the bottle rate, not saved by the owner. */
  priceIsAuto: boolean;
  profitPerPeg: number | null;
  marginPct: number | null;
  /** Profit when the whole bottle is sold as pegs, in rupees. */
  bottleProfit: number | null;
  /** The price to charge to reach the target margin (rounded up to the step), in rupees. */
  suggestedPrice: number | null;
  status: PegStatus;
}

export interface PegInput {
  /** Bottle size in ml. */
  sizeMl: number;
  /** What one bottle costs the bar, in rupees. */
  bottleCost: number;
  /** The brand rate saved in Brands & settings (used only to guess a price when none is saved). */
  rate: number;
  /** Saved peg prices for this brand, keyed by peg size in ml (as text). */
  savedPrices?: Record<string, string>;
  pegSizes: number[];
  /** Share of a bottle lost to spillage, in percent (0 to 50). */
  spillagePct: number;
  /** The margin the owner wants on each peg, in percent. */
  targetMarginPct: number;
  /** Suggested prices are rounded up to a multiple of this many rupees. */
  step?: number;
}

const toPaise = (n: number): number => Math.round(((Number(n) || 0) + Number.EPSILON) * 100);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Reads a money amount typed by a person. Returns null when it is blank, not a number, or below zero. */
export function parseMoney(text: string): number | null {
  const n = parseFloat(String(text ?? '').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** How many whole pegs of `ml` one bottle gives, after spillage. */
export function pegsPerBottle(sizeMl: number, ml: number, spillagePct: number): number {
  if (!(sizeMl > 0) || !(ml > 0)) return 0;
  const usable = sizeMl * (1 - clamp(Number(spillagePct) || 0, 0, 50) / 100);
  return Math.floor(usable / ml + 1e-9);
}

/** The price to charge so that the margin is `targetMarginPct`, rounded UP to a multiple of `step` rupees. */
export function suggestPrice(costPerPeg: number, targetMarginPct: number, step = 5): number | null {
  const t = Number(targetMarginPct);
  if (!(costPerPeg > 0) || !Number.isFinite(t) || t < 0 || t >= 100) return null;
  const s = step > 0 ? step : 1;
  return Math.ceil(costPerPeg / (1 - t / 100) / s - 1e-9) * s;
}

export function computePegRows(input: PegInput): PegRow[] {
  const costPaise = toPaise(input.bottleCost);
  if (!(input.sizeMl > 0) || costPaise <= 0) return [];

  const rows: PegRow[] = [];
  for (const ml of input.pegSizes) {
    if (!Number.isInteger(ml) || ml <= 0 || ml > input.sizeMl) continue;
    const pegs = pegsPerBottle(input.sizeMl, ml, input.spillagePct);
    if (pegs < 1) continue;

    const costPerPegPaise = Math.round(costPaise / pegs);

    let sellPaise: number | null = null;
    let auto = false;
    const saved = parseFloat(String(input.savedPrices?.[String(ml)] ?? ''));
    if (Number.isFinite(saved) && saved > 0) {
      sellPaise = toPaise(saved);
    } else if (input.rate > 0) {
      const guess = Math.round((input.rate * ml) / input.sizeMl);
      if (guess > 0) {
        sellPaise = toPaise(guess);
        auto = true;
      }
    }

    const suggested = suggestPrice(costPerPegPaise / 100, input.targetMarginPct, input.step ?? 5);

    if (sellPaise === null) {
      rows.push({
        ml,
        pegsPerBottle: pegs,
        costPerPeg: costPerPegPaise / 100,
        sellPrice: null,
        priceIsAuto: false,
        profitPerPeg: null,
        marginPct: null,
        bottleProfit: null,
        suggestedPrice: suggested,
        status: 'no-price',
      });
      continue;
    }

    const profitPaise = sellPaise - costPerPegPaise;
    const margin = (profitPaise / sellPaise) * 100;
    const bottleProfitPaise = pegs * sellPaise - costPaise;
    const status: PegStatus = profitPaise < 0 ? 'loss' : margin < input.targetMarginPct ? 'low' : 'ok';

    rows.push({
      ml,
      pegsPerBottle: pegs,
      costPerPeg: costPerPegPaise / 100,
      sellPrice: sellPaise / 100,
      priceIsAuto: auto,
      profitPerPeg: profitPaise / 100,
      marginPct: margin,
      bottleProfit: bottleProfitPaise / 100,
      suggestedPrice: suggested,
      status,
    });
  }
  return rows;
}
