import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password • TapTrack" },
      {
        name: "description",
        content: "Choose a new password for your TapTrack beer bar account.",
      },
      { property: "og:title", content: "Set a new password • TapTrack" },
      { property: "og:description", content: "Choose a new password for your TapTrack account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setTimeout(() => void navigate({ to: "/" }), 1200);
  }

  const inputCls =
    "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <h1 className="text-lg font-bold text-white">Set a new password</h1>
        <p className="text-xs text-zinc-400 mt-1 mb-5">Enter your new password twice to confirm.</p>

        {done ? (
          <p className="text-sm text-emerald-400">Password updated. Taking you to your dashboard…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400" htmlFor="new-password">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            </div>
            <div>
              <label className="text-xs text-zinc-400" htmlFor="confirm-password">Confirm password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required />
            </div>
            {error && <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={busy} className="w-full bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 text-sm hover:brightness-110 transition disabled:opacity-60">
              {busy ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
