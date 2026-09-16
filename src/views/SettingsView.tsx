import { Link } from '@tanstack/react-router';
import { usePlan, PLAN_LABELS, FEATURE_LABELS, FEATURE_REQUIREMENT, type PlanId, type FeatureId } from '@/lib/plan';
import { GstSettingsForm } from '@/components/gst/GstSettingsForm';

const PLAN_PRICE: Record<PlanId, string> = {
  basic: '₹499/month',
  pro: '₹999/month',
  premium: '₹1,999/month',
};

const FEATURES = Object.keys(FEATURE_LABELS) as FeatureId[];

export function SettingsView() {
  const { plan, setPlan, hasFeature } = usePlan();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h2 className="text-white font-bold text-lg mb-1">Change Plan</h2>
        <p className="text-sm text-zinc-400 mb-5">
          Choose the plan you want to simulate. Features unlock instantly based on your selection.
        </p>

        <label htmlFor="plan-select" className="block text-xs font-mono uppercase tracking-wider text-zinc-500 mb-2">
          Current Plan
        </label>
        <select
          id="plan-select"
          value={plan}
          onChange={e => setPlan(e.target.value as PlanId)}
          className="w-full md:w-72 bg-zinc-950 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
        >
          <option value="basic">Basic — ₹499/month</option>
          <option value="pro">Pro — ₹999/month</option>
          <option value="premium">Premium — ₹1,999/month</option>
        </select>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Active: {PLAN_LABELS[plan]} · {PLAN_PRICE[plan]}
          </span>
          <Link to="/pricing" className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2">
            View Monthly &amp; Yearly Pricing
          </Link>
        </div>
      </div>

      <GstSettingsForm />

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-white font-bold text-base mb-4">Feature Access</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {FEATURES.map(f => {
            const unlocked = hasFeature(f);
            return (
              <div
                key={f}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 border text-sm ${
                  unlocked ? 'border-emerald-900/50 bg-emerald-950/20 text-zinc-200' : 'border-zinc-800 bg-zinc-950 text-zinc-500'
                }`}
              >
                <span className="flex items-center gap-2">
                  <i className={`fa-solid ${unlocked ? 'fa-circle-check text-emerald-400' : 'fa-lock text-zinc-600'}`} />
                  {FEATURE_LABELS[f]}
                </span>
                {!unlocked && (
                  <span className="text-[10px] font-mono text-amber-400">{PLAN_LABELS[FEATURE_REQUIREMENT[f]]}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
