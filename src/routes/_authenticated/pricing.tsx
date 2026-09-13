import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { persistPlan, readPersistedPlan, type PlanId } from "@/lib/plan";

interface PricingPlan {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
}

const PLANS: PricingPlan[] = [
  {
    id: "basic",
    name: "Basic",
    monthlyPrice: 499,
    yearlyPrice: 4999,
    description: "Perfect for small bars just getting started with digital billing.",
    features: [
      "Dashboard",
      "Sales/POS",
      "Stock & Kegs Tracking",
      "GST Invoice",
      "Basic Reports",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 999,
    yearlyPrice: 9999,
    description: "Best value for growing bars that want deeper business control.",
    highlighted: true,
    badge: "Most Popular",
    features: [
      "Everything in Basic",
      "Expense & Profit Tracking",
      "Smart Alerts",
      "Business Insights",
      "WhatsApp Billing",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    monthlyPrice: 1999,
    yearlyPrice: 19999,
    description: "Full power for multi-staff bars ready to scale with AI.",
    features: [
      "Everything in Pro",
      "AI Business Assistant",
      "Sales Prediction",
      "Voice Input",
      "Staff Login",
      "Priority Support",
    ],
  },
];

export const Route = createFileRoute("/_authenticated/pricing")({
  head: () => ({
    meta: [
      { title: "TapTrack Pricing • Choose Your Plan" },
      {
        name: "description",
        content:
          "TapTrack pricing plans for beer bars: Basic, Pro, and Premium. POS, billing, inventory, insights, WhatsApp billing and AI assistant.",
      },
      { property: "og:title", content: "TapTrack Pricing • Choose Your Plan" },
      {
        property: "og:description",
        content:
          "Choose the right TapTrack plan for your bar. Start with Basic or unlock AI, predictions and staff login with Premium.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [activePlan, setActivePlan] = useState<PlanId | null>(null);

  useEffect(() => {
    setActivePlan(readPersistedPlan());
  }, []);

  const choosePlan = (plan: PlanId) => {
    persistPlan(plan);
    setActivePlan(plan);
    void navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 cursor-pointer">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20 text-zinc-950 font-bold">
              <i className="fa-solid fa-beer-mug-empty text-xl" />
            </div>
            <div className="flex items-center leading-none">
              <span className="font-display text-2xl font-bold tracking-tight text-amber-400">TAP</span>
              <span className="font-display text-2xl font-bold tracking-tight text-white">TRACK</span>
            </div>
          </Link>
          <Link
            to="/"
            className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <i className="fa-solid fa-arrow-left" />
            <span className="hidden sm:inline">Back to Dashboard</span>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-12 pb-8 px-4 md:px-6 text-center">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-zinc-400 max-w-2xl mx-auto text-base md:text-lg">
          Pick the plan that fits your bar. Upgrade or downgrade anytime as your business grows.
        </p>
        <div className="mt-7 inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900 p-1" aria-label="Billing cycle">
          <button
            type="button"
            aria-pressed={billingCycle === "monthly"}
            onClick={() => setBillingCycle("monthly")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${billingCycle === "monthly" ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-white"}`}
          >
            Monthly
          </button>
          <button
            type="button"
            aria-pressed={billingCycle === "yearly"}
            onClick={() => setBillingCycle("yearly")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${billingCycle === "yearly" ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-white"}`}
          >
            Yearly
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${billingCycle === "yearly" ? "bg-zinc-950/15 text-zinc-950" : "bg-emerald-500/15 text-emerald-400"}`}>
              Save 17%
            </span>
          </button>
        </div>
      </section>

      {/* Pricing Cards */}
      <main className="flex-1 px-4 md:px-6 pb-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 md:p-8 flex flex-col transition-transform duration-200 hover:-translate-y-1 ${
                plan.highlighted
                  ? "bg-zinc-900/80 border-amber-500/60 shadow-xl shadow-amber-500/10"
                  : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full bg-amber-500 text-zinc-950">
                  {plan.badge}
                </span>
              )}

              <div className="mb-6">
                <h2 className="text-xl font-bold text-white mb-1">{plan.name}</h2>
                <p className="text-sm text-zinc-400">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-white">
                  ₹{(billingCycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice).toLocaleString("en-IN")}
                </span>
                <span className="text-zinc-400 text-sm">/{billingCycle === "monthly" ? "month" : "year"}</span>
                {billingCycle === "yearly" && (
                  <p className="mt-1 text-xs text-emerald-400">Two months free compared with monthly billing</p>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-zinc-300">
                    <i className="fa-solid fa-check text-amber-400 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => choosePlan(plan.id)}
                className={`w-full py-3 px-4 rounded-lg font-semibold text-sm transition-colors cursor-pointer ${
                  activePlan === plan.id
                    ? "bg-emerald-600 text-white hover:bg-emerald-500"
                    : plan.highlighted
                    ? "bg-gradient-to-r from-amber-400 to-amber-600 text-zinc-950 hover:brightness-110"
                    : "bg-zinc-800 text-white border border-zinc-700 hover:bg-zinc-700"
                }`}
              >
                {activePlan === plan.id ? "Current Plan" : "Choose Plan"}
              </button>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 px-4 md:px-6 text-center text-xs text-zinc-500">
        <p>All prices in Indian Rupees (₹). Taxes may apply.</p>
        <p className="mt-1">TapTrack v2.4</p>
      </footer>
    </div>
  );
}
