import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "../integrations/supabase/client";

const OFF_KEY = "pt_exit_screen_off";
const HINT_MS = 2500;
const BYE_MS = 3000;
const IMAGE = "/mascot.png";

const css = `
@keyframes ptx-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes ptx-orb { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(16px, -20px) scale(1.12); } }
@keyframes ptx-in { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
@keyframes ptx-bar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes ptx-ring { 0% { transform: scale(.85); opacity: .7; } 100% { transform: scale(1.4); opacity: 0; } }
@keyframes ptx-toast { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
.ptx-float { animation: ptx-float 3.2s ease-in-out infinite; }
.ptx-orb { position: absolute; border-radius: 9999px; filter: blur(44px); animation: ptx-orb 7s ease-in-out infinite; }
.ptx-in { animation: ptx-in .5s ease-out both; }
.ptx-ring { position: absolute; inset: 0; border-radius: 9999px; border: 2px solid rgba(103,232,249,.55); animation: ptx-ring 2.4s ease-out infinite; }
.ptx-bar { transform-origin: left; animation: ptx-bar 3s linear forwards; }
@media (prefers-reduced-motion: reduce) {
  .ptx-float, .ptx-orb, .ptx-ring { animation: none; }
  .ptx-in { animation: none; }
}
`;

type Phase = "idle" | "hint" | "bye";

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
  const [imgFailed, setImgFailed] = useState(false);
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

  // Loads the mascot in advance so it shows at once.
  useEffect(() => {
    if (!signedIn) return;
    try {
      const img = new Image();
      img.src = IMAGE;
    } catch {
      // ignore
    }
  }, [signedIn]);

  // Tries to close the app. If the browser does not allow it, the person is brought back to the app.
  const leave = useCallback(() => {
    try {
      window.close();
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        history.back();
      } catch {
        // ignore
      }
      setTimeout(() => {
        // Still here: the browser did not allow closing, so return to the app.
        setBoth("idle");
        try {
          armGuard();
        } catch {
          // ignore
        }
      }, 1500);
    }, 300);
  }, [setBoth]);

  const startBye = useCallback(() => {
    clearTimer();
    setBoth("bye");
    timerRef.current = setTimeout(leave, BYE_MS);
  }, [clearTimer, setBoth, leave]);

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
      if (phaseRef.current === "bye") return; // already leaving

      if (phaseRef.current === "hint") {
        startBye(); // second press within the time: say goodbye
        return;
      }

      // first press: show the small hint and put the guard page back
      try {
        history.pushState({ ...plain(s), ptGuard: true }, "");
      } catch {
        // ignore
      }
      setBoth("hint");
      clearTimer();
      timerRef.current = setTimeout(() => setBoth("idle"), HINT_MS);
    };

    // If the person switches to another app while the goodbye is showing, cancel it.
    const onHide = () => {
      if (document.visibilityState === "hidden" && phaseRef.current === "bye") {
        clearTimer();
        setBoth("idle");
        try {
          armGuard();
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("popstate", onPop);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("visibilitychange", onHide);
      clearTimer();
    };
  }, [signedIn, setBoth, clearTimer, startBye]);

  if (phase === "idle") return null;

  if (phase === "hint") {
    return (
      <>
        <style>{css}</style>
        <div
          role="status"
          className="fixed rounded-full px-4 py-2 text-xs"
          style={{
            zIndex: 90,
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            background: "rgba(15,23,42,.94)",
            color: "#f1f5f9",
            border: "1px solid rgba(103,232,249,.4)",
            animation: "ptx-toast .25s ease-out both",
          }}
        >
          Press Back again to exit
        </div>
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Goodbye"
        className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden px-5"
        style={{
          zIndex: 100,
          color: "#e2e8f0",
          background: "radial-gradient(circle at 50% 30%, #1e1b4b 0%, #0b1020 55%, #050814 100%)",
        }}
      >
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(rgba(103,232,249,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,.07) 1px, transparent 1px)",
              backgroundSize: "38px 38px",
            }}
          />
          <span className="ptx-orb" style={{ width: 240, height: 240, left: "-70px", top: "6%", background: "rgba(124,58,237,.38)" }} />
          <span
            className="ptx-orb"
            style={{ width: 220, height: 220, right: "-60px", bottom: "8%", background: "rgba(6,182,212,.32)", animationDelay: "2s" }}
          />
        </div>

        <div className="ptx-in relative flex flex-col items-center">
          <div className="relative flex items-center justify-center" style={{ width: 300, height: 300 }}>
            <span aria-hidden="true" className="ptx-ring" />
            <span aria-hidden="true" className="ptx-ring" style={{ animationDelay: "1.2s" }} />
            {imgFailed ? (
              <span className="ptx-float" style={{ fontSize: 120, lineHeight: 1 }} aria-hidden="true">
                🐧
              </span>
            ) : (
              <img
                src={IMAGE}
                alt="Mascot"
                className="ptx-float"
                onError={() => setImgFailed(true)}
                style={{
                  maxWidth: 280,
                  maxHeight: 280,
                  objectFit: "contain",
                  filter: "drop-shadow(0 0 22px rgba(103,232,249,.55))",
                }}
              />
            )}
          </div>

          <h2
            className="mt-4 text-3xl font-bold"
            style={{
              background: "linear-gradient(90deg, #67e8f9, #a78bfa, #f0abfc)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              letterSpacing: ".02em",
            }}
          >
            Thanks for visiting
          </h2>
        </div>

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 28,
            right: 28,
            bottom: 36,
            height: 4,
            borderRadius: 9999,
            background: "rgba(148,163,184,.25)",
            overflow: "hidden",
          }}
        >
          <div
            className="ptx-bar"
            style={{
              height: "100%",
              background: "linear-gradient(90deg, #22d3ee, #8b5cf6)",
              boxShadow: "0 0 10px rgba(34,211,238,.8)",
            }}
          />
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
