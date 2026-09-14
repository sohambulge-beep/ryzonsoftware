import { useEffect, useState } from 'react';
import type { PeriodId, Sentence } from './useInsights';

export interface InsightSnapshot {
  id: string;
  date: string; // YYYY-MM-DD
  period: PeriodId;
  createdAt: string;
  sales: number;
  orders: number;
  expenses: number;
  profit: number;
  marginPct: number;
  sentences: Sentence[];
}

const KEY = 'taptrack_insight_history_v1';
const MAX_ENTRIES = 90;

function read(): InsightSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InsightSnapshot[]) : [];
  } catch {
    return [];
  }
}

function write(list: InsightSnapshot[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

/**
 * Keeps one saved snapshot per (day, period). Newest first, capped at 90 entries.
 */
export function useInsightHistory(candidate: Omit<InsightSnapshot, 'id' | 'date' | 'createdAt'> | null, enabled: boolean) {
  const [history, setHistory] = useState<InsightSnapshot[]>([]);

  useEffect(() => {
    setHistory(read());
  }, []);

  useEffect(() => {
    if (!enabled || !candidate) return;
    const now = new Date();
    const date = now.toISOString().split('T')[0]!;
    const existing = read();
    const idx = existing.findIndex(s => s.date === date && s.period === candidate.period);
    const snapshot: InsightSnapshot = {
      id: `${date}-${candidate.period}`,
      date,
      createdAt: now.toISOString(),
      ...candidate,
    };
    const next = idx >= 0 ? existing.map((s, i) => (i === idx ? snapshot : s)) : [snapshot, ...existing];
    next.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const capped = next.slice(0, MAX_ENTRIES);
    write(capped);
    setHistory(capped);
    // Snapshot content is derived from db + period; re-run when the numbers change.
  }, [enabled, candidate?.period, candidate?.sales, candidate?.orders, candidate?.expenses, candidate?.profit]);

  const clear = () => {
    write([]);
    setHistory([]);
  };

  return { history, clear };
}
