import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "../integrations/supabase/client";

const OFF_KEY = "pt_exit_screen_off";
const ASK_MS = 4500;
const LETTERS = ["B", "Y", "E", "·", "B", "Y", "E"];

const css = `
@keyframes ptx-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes ptx-wave { 0%, 100% { transform: rotate(-12deg); } 50% { transform: rotate(32deg); } }
@keyframes ptx-in { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes ptx-letter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes ptx-orb { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(14px, -18px) scale(1.12); } }
@keyframes ptx-blink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.1); } }
.ptx-float { animation: ptx-float 3.2s ease-in-out infinite; }
.ptx-arm { transform-origin: 151px 133px; animation: ptx-wave 1.1s ease-in-out infinite; }
.ptx-in { animation: ptx-in .5s ease-out both; }
.ptx-letter { display: inline-block; margin: 0 5px; opacity: 0; animation: ptx-letter .5s ease-out forwards; }
.ptx-orb { position: absolute; border-radius: 9999px; filter: blur(40px); animation: ptx-orb 7s ease-in-out infinite; }
.ptx-eye { transform-box: fill-box; transform-origin: center; animation: ptx-blink 4s infinite; }
@media (prefers-reduced-motion: reduce) {
  .ptx-float, .ptx-arm, .ptx-orb, .ptx-eye { animation: none; }
  .ptx-letter, .ptx-in { animation: none; opacity: 1; }
}
`;

type Phase = "idle" | "ask" | "bye";

// Copy of the browser history data without our own marks, so the app's router data is kept.
function plain(s: any): Record<string, any> {
  const out: Record<string, any> = s && typeof s === "object" ? { ...s } : {};
  delete out.ptBase;
  delete out.ptGuard;
  return out;
}

function isOff(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
}

// Marks the current page as the base and puts one guard page on top of it.
function armGuard() {
  const st: any = history.state && typeof history.state === "object" ? history.state : {};
  if (st.ptGuard) return;
  history.replaceState({ ...plain(st), ptBase: true }, "");
  history.pushState({ ...plain(st), ptGuard: true }, "");
}

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Inner() {
  const [signedIn, setSignedIn] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setSignedIn(!!data.session);
      })
      .catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setSignedIn(!!session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!signedIn || isOff()) return;
    try {
      armGuard();
    } catch {
      return;
    }

    const onPop = (e: PopStateEvent) => {
      if (isOff()) return;
      const s: any = e.state;
      if (!s || !s.ptBase) return; // not the app's own first page, nothing to do

      if (phaseRef.current === "ask") {
        // second press: leave
        clearTimer();
        setBoth("bye");
        try {
          history.back();
        } catch {
          // ignore
        }
        return;
      }

      // first press: show the farewell and put the guard page back
      try {
        history.pushState({ ...plain(s), ptGuard: true }, "");
      } catch {
        // ignore
      }
      setBoth("ask");
      clearTimer();
      timerRef.current = setTimeout(() => setBoth("idle"), ASK_MS);
    };

    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      clearTimer();
    };
  }, [signedIn, setBoth, clearTimer]);

  function stay() {
    clearTimer();
    setBoth("idle");
    try {
      armGuard();
    } catch {
      // ignore
    }
  }

  function noMore() {
    clearTimer();
    try {
      localStorage.setItem(OFF_KEY, "1");
    } catch {
      // ignore
    }
    setBoth("idle");
  }

  if (phase === "idle") return null;

  return (
    <>
      <style>{css}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Closing the app"
        className="fixed inset-0 flex items-center justify-center overflow-y-auto px-5 py-8"
        style={{
          zIndex: 100,
          color: "#e2e8f0",
          background: "radial-gradient(circle at 50% 28%, #1e1b4b 0%, #0b1020 55%, #050814 100%)",
        }}
      >
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(rgba(103,232,249,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,.06) 1px, transparent 1px)",
              backgroundSize: "36px 36px",
            }}
          />
          <span className="ptx-orb" style={{ width: 220, height: 220, left: "-60px", top: "8%", background: "rgba(124,58,237,.35)" }} />
          <span
            className="ptx-orb"
            style={{ width: 200, height: 200, right: "-50px", bottom: "10%", background: "rgba(6,182,212,.30)", animationDelay: "2s" }}
          />
        </div>

        <div
          className="ptx-in relative w-full max-w-sm rounded-3xl p-6 text-center"
          style={{
            background: "rgba(15,23,42,.62)",
            border: "1px solid rgba(103,232,249,.35)",
            boxShadow: "0 0 40px rgba(103,232,249,.18), inset 0 0 30px rgba(167,139,250,.08)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div className="flex justify-center">
            <svg width="190" height="215" viewBox="0 0 200 230" className="ptx-float" aria-hidden="true">
              <ellipse cx="100" cy="222" rx="52" ry="6" fill="rgba(103,232,249,.25)" />
              <circle cx="62" cy="42" r="17" fill="#111827" />
              <circle cx="138" cy="42" r="17" fill="#111827" />
              <ellipse cx="100" cy="155" rx="60" ry="58" fill="#ffffff" />
              <ellipse cx="66" cy="204" rx="24" ry="15" fill="#111827" />
              <ellipse cx="134" cy="204" rx="24" ry="15" fill="#111827" />
              <ellipse cx="44" cy="150" rx="15" ry="32" fill="#111827" transform="rotate(14 44 150)" />
              <ellipse cx="100" cy="158" rx="36" ry="36" fill="#f1f5f9" />
              <circle cx="100" cy="80" r="50" fill="#ffffff" />
              <ellipse cx="76" cy="76" rx="13" ry="17" fill="#111827" transform="rotate(22 76 76)" />
              <ellipse cx="124" cy="76" rx="13" ry="17" fill="#111827" transform="rotate(-22 124 76)" />
              <g className="ptx-eye">
                <circle cx="79" cy="75" r="6" fill="#ffffff" />
                <circle cx="80" cy="76" r="3.2" fill="#111827" />
                <circle cx="81" cy="74.5" r="1.1" fill="#ffffff" />
              </g>
              <g className="ptx-eye">
                <circle cx="121" cy="75" r="6" fill="#ffffff" />
                <circle cx="120" cy="76" r="3.2" fill="#111827" />
                <circle cx="121" cy="74.5" r="1.1" fill="#ffffff" />
              </g>
              <ellipse cx="100" cy="94" rx="8" ry="5.5" fill="#111827" />
              <path d="M90 102 Q100 112 110 102" stroke="#111827" strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <circle cx="64" cy="98" r="7" fill="#fda4af" opacity=".6" />
              <circle cx="136" cy="98" r="7" fill="#fda4af" opacity=".6" />
              <g className="ptx-arm">
                <ellipse cx="164" cy="104" rx="15" ry="32" fill="#111827" transform="rotate(24 164 104)" />
              </g>
            </svg>
          </div>

          <h2
            className="mt-2 text-3xl font-bold"
            style={{
              background: "linear-gradient(90deg, #67e8f9, #a78bfa, #f0abfc)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Bye bye!
          </h2>

          <p
            className="mt-2 text-xl font-bold"
            style={{ color: "#67e8f9", textShadow: "0 0 12px rgba(103,232,249,.7)", letterSpacing: ".15em" }}
            aria-label="B Y E, B Y E"
          >
            {LETTERS.map((ch, i) => (
              <span key={i} className="ptx-letter" style={{ animationDelay: `${0.35 + i * 0.13}s` }}>
                {ch}
              </span>
            ))}
          </p>

          <p className="mt-3 text-sm" style={{ color: "#cbd5e1" }}>
            See you soon!
          </p>
          <p className="mt-1 text-xs" style={{ color: "#94a3b8" }}>
            {phase === "ask"
              ? "Tap the Back button once more to close the app."
              : "You can close the app now. Have a great day!"}
          </p>

          <button
            type="button"
            autoFocus
            onClick={stay}
            className="mt-6 w-full rounded-xl px-6 py-3 text-sm font-semibold"
            style={{ background: "linear-gradient(90deg, #22d3ee, #8b5cf6)", color: "#0b1020" }}
          >
            Stay in app
          </button>
          <button type="button" onClick={noMore} className="mt-3 text-xs underline" style={{ color: "#94a3b8" }}>
            Do not show this again
          </button>
        </div>
      </div>
    </>
  );
}

export default function ExitGuard() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
