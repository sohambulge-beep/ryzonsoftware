// Splitting a bill between people. Everything is worked out in paise (whole numbers), so the shares always
// add up to the exact bill total. Two ways to split:
//  - equally between N people
//  - by items: each person takes the items they had; items nobody took are shared equally, and the service
//    charge and tax are shared in the same proportion as what each person had.

export const MIN_PEOPLE = 2;
export const MAX_PEOPLE = 20;

const toPaise = (n: number): number => Math.round(((Number(n) || 0) + Number.EPSILON) * 100);

/** Splits an amount (in paise) between n people. Leftover paise go one each to the first people. */
export function splitPaise(totalPaise: number, n: number): number[] {
  const people = Math.max(1, Math.floor(Number(n) || 1));
  const t = Math.max(0, Math.round(Number(totalPaise) || 0));
  const base = Math.floor(t / people);
  const extra = t - base * people;
  return Array.from({ length: people }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Splits a bill equally. Example: 1000.00 between 3 people -> 333.34, 333.33, 333.33
 */
export function splitEqually(total: number, people: number): number[] {
  return splitPaise(toPaise(total), people).map((p) => p / 100);
}

/**
 * Shares `amount` (paise, can be 0 or negative) in proportion to `weights`, to the exact paisa.
 * When all weights are 0 the amount is shared equally.
 */
export function allocateProportional(amount: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const w = weights.map((x) => Math.max(0, Math.round(Number(x) || 0)));
  const sum = w.reduce((a, b) => a + b, 0);
  const a = Math.round(Number(amount) || 0);
  const sign = a < 0 ? -1 : 1;
  const abs = Math.abs(a);
  if (sum <= 0) return splitPaise(abs, n).map((p) => p * sign);

  const raw = w.map((x) => (x * abs) / sum);
  const shares = raw.map((r) => Math.floor(r));
  let left = abs - shares.reduce((x, y) => x + y, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((p, q) => q.frac - p.frac || p.i - q.i);
  for (let k = 0; k < order.length && left > 0; k++) {
    shares[order[k].i] += 1;
    left -= 1;
  }
  return shares.map((s) => s * sign);
}

/** The price of each unit of an item (paise). The units add up to the item total exactly. */
export function unitPrices(totalPaise: number, qty: number): number[] {
  const q = Math.max(1, Math.round(Number(qty) || 1));
  const t = Math.round(Number(totalPaise) || 0);
  const base = Math.floor(t / q);
  const rem = t - base * q;
  return Array.from({ length: q }, (_, i) => base + (i < rem ? 1 : 0));
}

export interface SplitItem {
  name: string;
  qty: number;
  /** The item's total on the bill (rupees). Any discount is already included. */
  total: number;
}

export interface SplitLine {
  name: string;
  qty: number;
  paise: number;
}

export interface PersonShare {
  /** What this person's own items cost. */
  itemsPaise: number;
  /** This person's equal part of the items nobody took. */
  sharedPaise: number;
  /** This person's part of the service charge and tax. */
  extrasPaise: number;
  totalPaise: number;
  lines: SplitLine[];
}

export type ItemSplitResult =
  | { ok: false; reason: string }
  | { ok: true; persons: PersonShare[]; unassignedUnits: number; unassignedPaise: number; extrasPaise: number };

/**
 * Works out what each person pays when the bill is split by items.
 * `assigned[item][person]` is how many units of that item the person had.
 * The shares always add up to `totalPaise`.
 */
export function splitByItems(input: {
  items: SplitItem[];
  totalPaise: number;
  people: number;
  assigned: number[][];
}): ItemSplitResult {
  const n = Math.max(1, Math.floor(Number(input.people) || 1));
  const persons: PersonShare[] = Array.from({ length: n }, () => ({
    itemsPaise: 0,
    sharedPaise: 0,
    extrasPaise: 0,
    totalPaise: 0,
    lines: [],
  }));
  let unassignedUnits = 0;
  let unassignedPaise = 0;
  let itemsTotal = 0;

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const q = Math.max(1, Math.round(Number(item.qty) || 1));
    const itemTotal = toPaise(item.total);
    itemsTotal += itemTotal;
    const units = unitPrices(itemTotal, q);

    const row = input.assigned[i] ?? [];
    const take: number[] = [];
    let taken = 0;
    for (let p = 0; p < n; p++) {
      const a = Math.max(0, Math.floor(Number(row[p]) || 0));
      take.push(a);
      taken += a;
    }
    if (taken > q) return { ok: false, reason: `Too many units are given to people for "${item.name}".` };

    let cursor = 0;
    for (let p = 0; p < n; p++) {
      const a = take[p];
      if (a === 0) continue;
      let paise = 0;
      for (let k = 0; k < a; k++) paise += units[cursor + k];
      cursor += a;
      persons[p].itemsPaise += paise;
      persons[p].lines.push({ name: item.name, qty: a, paise });
    }
    for (let k = cursor; k < q; k++) unassignedPaise += units[k];
    unassignedUnits += q - cursor;
  }

  const shared = splitPaise(unassignedPaise, n);
  for (let p = 0; p < n; p++) persons[p].sharedPaise = shared[p];

  const extrasPaise = Math.round(Number(input.totalPaise) || 0) - itemsTotal;
  const extraShares = allocateProportional(
    extrasPaise,
    persons.map((x) => x.itemsPaise + x.sharedPaise),
  );
  for (let p = 0; p < n; p++) {
    persons[p].extrasPaise = extraShares[p];
    persons[p].totalPaise = persons[p].itemsPaise + persons[p].sharedPaise + extraShares[p];
  }
  return { ok: true, persons, unassignedUnits, unassignedPaise, extrasPaise };
}

// ---------------------------------------------------------------------------------------------
// The screen state. It is plain code, so every tap can be tested.
// ---------------------------------------------------------------------------------------------

export type SplitMode = 'equal' | 'items';

export interface SplitState {
  mode: SplitMode;
  people: number;
  /** The person whose items are being picked. */
  active: number;
  /** assigned[item][person] = units of that item the person had. */
  assigned: number[][];
}

export type SplitAction =
  | { type: 'mode'; mode: SplitMode }
  | { type: 'people'; delta: number }
  | { type: 'active'; person: number }
  | { type: 'adjust'; item: number; delta: number }
  | { type: 'clear' };

export function initSplit(itemCount: number): SplitState {
  return {
    mode: 'equal',
    people: MIN_PEOPLE,
    active: 0,
    assigned: Array.from({ length: Math.max(0, itemCount) }, () => Array(MAX_PEOPLE).fill(0)),
  };
}

/** `qtys[item]` is how many units the bill has of each item. */
export function splitReducer(state: SplitState, action: SplitAction, qtys: number[]): SplitState {
  switch (action.type) {
    case 'mode':
      return { ...state, mode: action.mode };
    case 'people': {
      const people = Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, state.people + action.delta));
      if (people === state.people) return state;
      // Units given to a person who is no longer there go back to "nobody took it".
      const assigned = state.assigned.map((row) => row.map((v, p) => (p < people ? v : 0)));
      return { ...state, people, active: Math.min(state.active, people - 1), assigned };
    }
    case 'active':
      return { ...state, active: Math.min(state.people - 1, Math.max(0, Math.floor(action.person) || 0)) };
    case 'adjust': {
      const row = state.assigned[action.item];
      if (!row) return state;
      const qty = Math.max(0, Math.round(Number(qtys[action.item]) || 0));
      const given = row.slice(0, state.people).reduce((a, b) => a + b, 0);
      const mine = row[state.active] ?? 0;
      let next = mine;
      if (action.delta > 0) next = given < qty ? mine + 1 : mine;
      else if (action.delta < 0) next = mine > 0 ? mine - 1 : mine;
      if (next === mine) return state;
      const assigned = state.assigned.map((r, i) =>
        i === action.item ? r.map((v, p) => (p === state.active ? next : v)) : r,
      );
      return { ...state, assigned };
    }
    case 'clear':
      return { ...state, assigned: state.assigned.map((r) => r.map(() => 0)) };
    default:
      return state;
  }
}
