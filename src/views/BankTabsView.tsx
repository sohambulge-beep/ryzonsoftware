import { useState } from "react";
import BankStatementView from "@/views/BankStatementView";
import BankTransferView from "@/views/BankTransferView";

const TABS = [
  { id: "statement", label: "Statement" },
  { id: "transfers", label: "Transfers" },
] as const;

export default function BankTabsView() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("statement");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              tab === t.id ? "bg-amber-500 text-zinc-950" : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "statement" && <BankStatementView />}
      {tab === "transfers" && <BankTransferView />}
    </div>
  );
}
