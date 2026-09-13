import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

export type PlanId = 'basic' | 'pro' | 'premium';

export const PLAN_LABELS: Record<PlanId, string> = {
  basic: 'Basic',
  pro: 'Pro',
  premium: 'Premium',
};

const PLAN_RANK: Record<PlanId, number> = { basic: 0, pro: 1, premium: 2 };

export type FeatureId =
  | 'expenses'
  | 'profit'
  | 'alerts'
  | 'insights'
  | 'whatsapp'
  | 'ai'
  | 'prediction'
  | 'voice'
  | 'staff';

/** Minimum plan required for each gated feature. Everything else stays open. */
export const FEATURE_REQUIREMENT: Record<FeatureId, PlanId> = {
  expenses: 'pro',
  profit: 'pro',
  alerts: 'pro',
  insights: 'pro',
  whatsapp: 'pro',
  ai: 'premium',
  prediction: 'premium',
  voice: 'premium',
  staff: 'premium',
};

export const FEATURE_LABELS: Record<FeatureId, string> = {
  expenses: 'Expense Tracking',
  profit: 'Profit Tracking',
  alerts: 'Smart Alerts',
  insights: 'Business Insights',
  whatsapp: 'WhatsApp Billing',
  ai: 'AI Business Assistant',
  prediction: 'Sales Prediction',
  voice: 'Voice Input',
  staff: 'Staff Login',
};

const STORAGE_KEY = 'taptrack_plan';

export function readPersistedPlan(): PlanId {
  if (typeof window === 'undefined') return 'premium';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'basic' || stored === 'pro' || stored === 'premium') return stored;
  } catch {
    /* noop */
  }
  return 'premium';
}

export function persistPlan(next: PlanId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* noop */
  }
}

interface PlanContextValue {
  plan: PlanId;
  setPlan: (plan: PlanId) => void;
  hasFeature: (feature: FeatureId) => boolean;
  requireFeature: (feature: FeatureId) => boolean;
  lockedFeature: FeatureId | null;
  closeUpgrade: () => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlanState] = useState<PlanId>(readPersistedPlan);
  const [lockedFeature, setLockedFeature] = useState<FeatureId | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'basic' || stored === 'pro' || stored === 'premium') {
        setPlanState(stored);
      }
    } catch {
      /* noop */
    }
  }, []);

  const setPlan = useCallback((next: PlanId) => {
    setPlanState(next);
    persistPlan(next);
  }, []);

  const hasFeature = useCallback(
    (feature: FeatureId) => PLAN_RANK[plan] >= PLAN_RANK[FEATURE_REQUIREMENT[feature]],
    [plan]
  );

  const requireFeature = useCallback(
    (feature: FeatureId) => {
      if (PLAN_RANK[plan] >= PLAN_RANK[FEATURE_REQUIREMENT[feature]]) return true;
      setLockedFeature(feature);
      return false;
    },
    [plan]
  );

  const closeUpgrade = useCallback(() => setLockedFeature(null), []);

  const value = useMemo(
    () => ({ plan, setPlan, hasFeature, requireFeature, lockedFeature, closeUpgrade }),
    [plan, setPlan, hasFeature, requireFeature, lockedFeature, closeUpgrade]
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}

export function UpgradeDialog() {
  const { lockedFeature, closeUpgrade } = usePlan();
  if (!lockedFeature) return null;
  const requiredPlan = PLAN_LABELS[FEATURE_REQUIREMENT[lockedFeature]];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 cursor-default" onClick={closeUpgrade} />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-amber-500/30 rounded-2xl shadow-2xl p-6 text-center">
        <div className="w-12 h-12 mx-auto rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center mb-4">
          <i className="fa-solid fa-lock text-xl" />
        </div>
        <h3 className="text-white font-bold text-lg mb-1">{FEATURE_LABELS[lockedFeature]}</h3>
        <p className="text-sm text-zinc-400 mb-5">
          This feature is available in {requiredPlan}. Upgrade to unlock.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            to="/pricing"
            onClick={closeUpgrade}
            className="w-full bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm hover:brightness-110 transition"
          >
            View Plans &amp; Upgrade
          </Link>
          <button
            type="button"
            onClick={closeUpgrade}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg py-2.5 text-sm hover:bg-zinc-700 transition"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

/** Full-page locked state shown when a whole section is unavailable on the current plan. */
export function LockedFeature({ feature }: { feature: FeatureId }) {
  const requiredPlan = PLAN_LABELS[FEATURE_REQUIREMENT[feature]];
  return (
    <div className="max-w-lg mx-auto mt-10 bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
      <div className="w-14 h-14 mx-auto rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center mb-4">
        <i className="fa-solid fa-lock text-2xl" />
      </div>
      <h2 className="text-white font-bold text-xl mb-2">{FEATURE_LABELS[feature]} is locked</h2>
      <p className="text-sm text-zinc-400 mb-6">
        This feature is available in {requiredPlan}. Upgrade to unlock.
      </p>
      <Link
        to="/pricing"
        className="inline-block bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 font-semibold rounded-lg py-2.5 px-5 text-sm hover:brightness-110 transition"
      >
        Upgrade to {requiredPlan}
      </Link>
    </div>
  );
}
