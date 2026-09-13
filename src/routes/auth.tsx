import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in • TapTrack Beer Bar Manager" },
      {
        name: "description",
        content:
          "Sign in or create your TapTrack account to manage your beer bar POS, billing, kegs and reports.",
      },
      { property: "og:title", content: "Sign in • TapTrack Beer Bar Manager" },
      {
        property: "og:description",
        content: "Secure access to your TapTrack beer bar dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [barName, setBarName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const reset = () => {
    setError("");
    setInfo("");
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, bar_name: barName },
          },
        });
        if (err) throw err;
        if (!data.session) {
          setInfo(`Almost there! We sent a confirmation link to ${email}. Click it to activate your account, then sign in.`);
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (err) throw err;
        setInfo(`If an account exists for ${email}, a password reset link is on its way.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    reset();
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError(result.error.message ?? "Google sign-in failed. Please try again.");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/" });
  }

  const inputCls =
    "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-zinc-900 text-lg">
            <i className="fa-solid fa-beer-mug-empty" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">TapTrack</h1>
            <p className="text-xs text-zinc-400">Beer bar POS &amp; business manager</p>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
          {mode !== "forgot" && (
            <div className="grid grid-cols-2 gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1 mb-5">
              <button
                type="button"
                onClick={() => { setMode("signin"); reset(); }}
                className={`py-2 text-sm font-medium rounded-md transition ${mode === "signin" ? "bg-amber-500 text-zinc-900" : "text-zinc-400 hover:text-white"}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => { setMode("signup"); reset(); }}
                className={`py-2 text-sm font-medium rounded-md transition ${mode === "signup" ? "bg-amber-500 text-zinc-900" : "text-zinc-400 hover:text-white"}`}
              >
                Sign up
              </button>
            </div>
          )}

          {mode === "forgot" && (
            <div className="mb-5">
              <h2 className="text-white font-semibold">Reset your password</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <>
                <div>
                  <label className="text-xs text-zinc-400" htmlFor="fullName">Your name</label>
                  <input id="fullName" className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Rishi Sharma" required />
                </div>
                <div>
                  <label className="text-xs text-zinc-400" htmlFor="barName">Bar name (optional)</label>
                  <input id="barName" className={inputCls} value={barName} onChange={(e) => setBarName(e.target.value)} placeholder="The Craft House" />
                </div>
              </>
            )}
            <div>
              <label className="text-xs text-zinc-400" htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            {mode !== "forgot" && (
              <div>
                <label className="text-xs text-zinc-400" htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className={inputCls}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              </div>
            )}

            {error && <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{error}</p>}
            {info && <p className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 rounded-lg px-3 py-2">{info}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 text-sm hover:brightness-110 transition disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </button>
          </form>

          {mode !== "forgot" && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-zinc-800" />
                <span className="text-[11px] text-zinc-500 uppercase tracking-wide">or</span>
                <div className="h-px flex-1 bg-zinc-800" />
              </div>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-zinc-700 transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <i className="fa-brands fa-google text-amber-400" />
                Continue with Google
              </button>
            </>
          )}

          <div className="mt-4 text-center">
            {mode === "signin" && (
              <button type="button" onClick={() => { setMode("forgot"); reset(); }} className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2">
                Forgot password?
              </button>
            )}
            {mode === "forgot" && (
              <button type="button" onClick={() => { setMode("signin"); reset(); }} className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2">
                Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-zinc-500 mt-5">
          <Link to="/auth" className="hover:text-zinc-300">TapTrack</Link> • Secure access to your bar data
        </p>
      </div>
    </div>
  );
}
