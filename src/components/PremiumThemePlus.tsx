import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Extra life on top of PremiumTheme: slowly drifting purple light, twinkling stars, a soft sheen on the
// dashboard cards and a stronger glow on the AI button. Only transform and opacity move, so it stays smooth.
// Switch off: open the app link with ?fx=off (and ?fx=on to bring it back).
const OFF_KEY = "pt_fx_off";

const ribbons =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 400' preserveAspectRatio='none'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23a855f7' stop-opacity='0'/%3E%3Cstop offset='.3' stop-color='%23c084fc' stop-opacity='.8'/%3E%3Cstop offset='.62' stop-color='%23f0abfc' stop-opacity='.85'/%3E%3Cstop offset='1' stop-color='%23f59e0b' stop-opacity='.2'/%3E%3C/linearGradient%3E%3Cfilter id='b' x='-10%25' y='-40%25' width='120%25' height='180%25'%3E%3CfeGaussianBlur stdDeviation='9'/%3E%3C/filter%3E%3C/defs%3E%3Cpath d='M-40 220 C 120 120 260 300 420 250 S 700 150 860 230' fill='none' stroke='url(%23g)' stroke-width='22' opacity='.40' filter='url(%23b)'/%3E%3Cpath d='M-40 220 C 120 120 260 300 420 250 S 700 150 860 230' fill='none' stroke='url(%23g)' stroke-width='2.2'/%3E%3Cpath d='M-40 238 C 125 140 265 320 425 270 S 705 172 860 250' fill='none' stroke='url(%23g)' stroke-width='1.3' opacity='.75'/%3E%3Cpath d='M-40 256 C 130 160 270 340 430 290 S 710 194 860 270' fill='none' stroke='url(%23g)' stroke-width='.9' opacity='.55'/%3E%3Cpath d='M-40 274 C 135 180 275 360 435 310 S 715 216 860 290' fill='none' stroke='url(%23g)' stroke-width='.7' opacity='.38'/%3E%3C/svg%3E\")";

const css = `
body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }

.pt-fx { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
.pt-fx > div { position: absolute; will-change: transform, opacity; transform: translateZ(0); }

.pt-fx-stars1 {
  inset: 0;
  background:
    radial-gradient(circle at 18% 22%, rgba(255,255,255,.95) 0 1.2px, transparent 2.6px),
    radial-gradient(circle at 70% 14%, rgba(255,255,255,.85) 0 1px, transparent 2.4px),
    radial-gradient(circle at 41% 38%, rgba(255,255,255,.8) 0 1px, transparent 2.4px),
    radial-gradient(circle at 88% 36%, rgba(255,255,255,.9) 0 1.2px, transparent 2.6px),
    radial-gradient(circle at 12% 71%, rgba(255,255,255,.8) 0 1px, transparent 2.4px),
    radial-gradient(circle at 58% 62%, rgba(255,255,255,.75) 0 1px, transparent 2.4px),
    radial-gradient(circle at 83% 79%, rgba(255,255,255,.9) 0 1.2px, transparent 2.6px),
    radial-gradient(circle at 34% 91%, rgba(255,255,255,.8) 0 1px, transparent 2.4px);
  animation: ptTwinkle 5s ease-in-out infinite alternate;
}
.pt-fx-stars2 {
  inset: 0;
  background:
    radial-gradient(circle at 26% 8%, rgba(251,191,36,.9) 0 1.2px, transparent 2.8px),
    radial-gradient(circle at 52% 24%, rgba(240,171,252,.9) 0 1.2px, transparent 2.8px),
    radial-gradient(circle at 94% 58%, rgba(255,255,255,.9) 0 1px, transparent 2.4px),
    radial-gradient(circle at 6% 44%, rgba(240,171,252,.85) 0 1.2px, transparent 2.8px),
    radial-gradient(circle at 66% 48%, rgba(251,191,36,.8) 0 1px, transparent 2.6px),
    radial-gradient(circle at 46% 84%, rgba(255,255,255,.85) 0 1px, transparent 2.4px),
    radial-gradient(circle at 76% 94%, rgba(240,171,252,.85) 0 1.2px, transparent 2.8px);
  animation: ptTwinkle 7s ease-in-out -2.5s infinite alternate;
}

.pt-fx-aurora {
  left: -25%; right: -25%; top: 28%; height: 58%;
  background: ${ribbons} center / 100% 100% no-repeat;
  animation: ptDrift 26s ease-in-out infinite alternate;
}
.pt-fx-orb1 {
  width: 360px; height: 360px; left: -130px; top: 16%; border-radius: 50%;
  background: radial-gradient(circle, rgba(168,85,247,.30), transparent 68%);
  animation: ptFloat 22s ease-in-out infinite alternate;
}
.pt-fx-orb2 {
  width: 400px; height: 400px; right: -150px; bottom: 6%; border-radius: 50%;
  background: radial-gradient(circle, rgba(236,72,153,.22), transparent 68%);
  animation: ptFloat 28s ease-in-out -7s infinite alternate-reverse;
}

@keyframes ptTwinkle { from { opacity: .3; } to { opacity: 1; } }
@keyframes ptDrift {
  from { transform: translate3d(-3%, 0, 0) scale(1); opacity: .72; }
  to   { transform: translate3d(3%, -2%, 0) scale(1.05); opacity: 1; }
}
@keyframes ptFloat { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(46px, -34px, 0); } }

/* Dashboard cards rise in one after another, and a soft light slides across them. */
.pt-dash .pt-glass { animation: ptRise .55s cubic-bezier(.2, .7, .2, 1) both; }
.pt-dash .grid > .pt-glass:nth-child(2) { animation-delay: .06s; }
.pt-dash .grid > .pt-glass:nth-child(3) { animation-delay: .12s; }
.pt-dash .grid > .pt-glass:nth-child(4) { animation-delay: .18s; }
@keyframes ptRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

.pt-glass.overflow-hidden::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 38%, rgba(255,255,255,.10) 50%, transparent 62%);
  transform: translateX(-130%);
  animation: ptSheen 9s ease-in-out infinite;
}
@keyframes ptSheen { 0%, 55% { transform: translateX(-130%); } 100% { transform: translateX(130%); } }

header h1 { text-shadow: 0 0 18px rgba(192, 132, 252, .35); }

/* The floating AI button glows blue. */
.fixed.rounded-full.from-sky-400 {
  box-shadow: 0 0 24px rgba(56, 189, 248, .55), 0 0 60px rgba(56, 189, 248, .28) !important;
}

@media (prefers-reduced-motion: reduce) {
  .pt-fx > div, .pt-dash .pt-glass, .pt-glass.overflow-hidden::before { animation: none !important; }
}
`;

export default function PremiumThemePlus() {
  const [on, setOn] = useState(false);

  // Read after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    try {
      const q = window.location.search;
      if (q.includes("fx=off")) localStorage.setItem(OFF_KEY, "1");
      else if (q.includes("fx=on")) localStorage.removeItem(OFF_KEY);
      const off = localStorage.getItem(OFF_KEY) === "1";
      const themeOff = localStorage.getItem("pt_theme_off") === "1";
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      const weak = typeof mem === "number" && mem <= 2;
      setOn(!off && !themeOff && !reduce && !weak);
    } catch {
      setOn(true);
    }
  }, []);

  if (!on || typeof document === "undefined") return null;
  return (
    <>
      <style>{css}</style>
      {createPortal(
        <div className="pt-fx" aria-hidden="true">
          <div className="pt-fx-stars1" />
          <div className="pt-fx-stars2" />
          <div className="pt-fx-orb1" />
          <div className="pt-fx-orb2" />
          <div className="pt-fx-aurora" />
        </div>,
        document.body
      )}
    </>
  );
}
