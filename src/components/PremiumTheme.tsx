import { useEffect, useState } from "react";

const OFF_KEY = "pt_theme_off";

// Everything here is static (no blur, no moving parts), so scrolling stays smooth on cheap phones.
const css = `
html { background-color: #050113; overscroll-behavior-y: none; }
body { overscroll-behavior-y: none; }

body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  transform: translateZ(0);
  background:
    radial-gradient(circle at 30% 12%, rgba(255, 255, 255, .75) 0 1px, transparent 2px),
    radial-gradient(circle at 62% 8%, rgba(255, 255, 255, .6) 0 1px, transparent 2px),
    radial-gradient(circle at 90% 15%, rgba(255, 255, 255, .6) 0 1px, transparent 2px),
    radial-gradient(circle at 8% 52%, rgba(255, 255, 255, .55) 0 1px, transparent 2px),
    radial-gradient(circle at 44% 66%, rgba(255, 255, 255, .5) 0 1px, transparent 2px),
    radial-gradient(circle at 74% 84%, rgba(255, 255, 255, .55) 0 1px, transparent 2px),
    radial-gradient(circle at 78% 22%, rgba(255, 255, 255, .16) 0 10px, transparent 26px),
    radial-gradient(circle at 16% 33%, rgba(251, 191, 36, .18) 0 8px, transparent 22px),
    radial-gradient(circle at 86% 47%, rgba(240, 171, 252, .20) 0 12px, transparent 30px),
    radial-gradient(circle at 52% 72%, rgba(255, 255, 255, .12) 0 14px, transparent 34px),
    radial-gradient(circle at 10% 90%, rgba(251, 191, 36, .16) 0 9px, transparent 24px),
    radial-gradient(circle at 92% 88%, rgba(168, 85, 247, .20) 0 10px, transparent 26px),
    radial-gradient(520px 420px at -5% 46%, rgba(168, 85, 247, .32), transparent 70%),
    radial-gradient(600px 420px at 105% 62%, rgba(236, 72, 153, .18), transparent 70%),
    radial-gradient(500px 360px at 50% 105%, rgba(99, 102, 241, .22), transparent 70%),
    radial-gradient(420px 300px at 85% 4%, rgba(59, 130, 246, .10), transparent 70%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 800' preserveAspectRatio='none'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23a855f7' stop-opacity='0'/%3E%3Cstop offset='.35' stop-color='%23c084fc' stop-opacity='.7'/%3E%3Cstop offset='.65' stop-color='%23f0abfc' stop-opacity='.75'/%3E%3Cstop offset='1' stop-color='%23f59e0b' stop-opacity='.15'/%3E%3C/linearGradient%3E%3Cfilter id='b' x='-10%25' y='-30%25' width='120%25' height='160%25'%3E%3CfeGaussianBlur stdDeviation='6'/%3E%3C/filter%3E%3C/defs%3E%3Cpath d='M-20 400 C 70 340 130 470 220 495 S 350 560 420 500' fill='none' stroke='url(%23g)' stroke-width='14' opacity='.45' filter='url(%23b)'/%3E%3Cpath d='M-20 400 C 70 340 130 470 220 495 S 350 560 420 500' fill='none' stroke='url(%23g)' stroke-width='2'/%3E%3Cpath d='M-20 414 C 70 356 135 486 225 510 S 355 576 420 518' fill='none' stroke='url(%23g)' stroke-width='1.2' opacity='.7'/%3E%3Cpath d='M-20 430 C 75 372 140 502 230 526 S 360 592 420 536' fill='none' stroke='url(%23g)' stroke-width='.8' opacity='.5'/%3E%3Cpath d='M-20 446 C 80 388 145 518 235 542 S 365 608 420 554' fill='none' stroke='url(%23g)' stroke-width='.6' opacity='.35'/%3E%3C/svg%3E") center / 100% 100% no-repeat,
    linear-gradient(165deg, #050113 0%, #0b0620 45%, #12082c 75%, #07031a 100%);
}

/* The big containers let the background show through. */
.flex.overflow-hidden.bg-zinc-950,
.min-h-screen.bg-zinc-950 {
  background-color: transparent !important;
}

/* Smaller dark areas (menu, bars, small boxes) stay softly dark. */
.bg-zinc-950 { background-color: rgba(8, 4, 24, .78) !important; }

/* The top bar sits lightly on the background. */
header[class*="bg-zinc-950"] {
  background-color: rgba(10, 5, 28, .35) !important;
  border-bottom-color: rgba(255, 255, 255, .08) !important;
}

.border-zinc-800 { border-color: rgba(255, 255, 255, .12) !important; }
.border-zinc-800\\/80 { border-color: rgba(255, 255, 255, .10) !important; }

/* Cards look like glass (no blur: only a see-through colour, a light edge and a soft shadow). */
.rounded-2xl[class*="bg-zinc-900"],
.rounded-xl[class*="bg-zinc-900"] {
  background: linear-gradient(135deg, rgba(255, 255, 255, .09), rgba(255, 255, 255, .03)) !important;
  border-color: rgba(255, 255, 255, .14) !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .10);
}

/* The dashboard cards (class pt-glass): bigger corners, a light sheen, a glow in one corner. */
.pt-glass {
  background:
    radial-gradient(120% 90% at 0% 100%, rgba(168, 85, 247, .16), transparent 60%),
    linear-gradient(145deg, rgba(255, 255, 255, .12), rgba(255, 255, 255, .035) 55%, rgba(255, 255, 255, .06)) !important;
  border: 1px solid rgba(255, 255, 255, .15) !important;
  border-radius: 26px !important;
  box-shadow:
    0 18px 40px -14px rgba(0, 0, 0, .6),
    inset 0 1px 0 rgba(255, 255, 255, .20),
    inset 0 0 30px rgba(255, 255, 255, .03) !important;
}
.pt-glass.pt-panel { border-radius: 22px !important; }

.pt-kpi-label {
  letter-spacing: .1em;
  color: rgba(255, 255, 255, .58) !important;
}
.pt-kpi-val {
  font-size: clamp(1.05rem, 4.8vw, 1.9rem) !important;
  line-height: 1.15;
  letter-spacing: -.01em;
  overflow-wrap: anywhere;
  text-shadow: 0 0 18px color-mix(in srgb, currentColor 55%, transparent);
}
.pt-kpi-sub { color: rgba(255, 255, 255, .62) !important; }

.pt-dot { box-shadow: 0 0 12px rgba(245, 158, 11, .9), 0 0 26px rgba(245, 158, 11, .45); }

/* Big numbers glow a little in their own colour. */
.font-mono[class*="text-3xl"],
.font-mono[class*="text-4xl"] {
  text-shadow: 0 0 16px color-mix(in srgb, currentColor 50%, transparent);
}

.bg-amber-500 { box-shadow: 0 0 14px rgba(245, 158, 11, .45); }
button.bg-emerald-600 { box-shadow: 0 0 12px rgba(16, 185, 129, .32); }
button.bg-sky-600 { box-shadow: 0 0 12px rgba(14, 165, 233, .32); }
button.bg-amber-600 { box-shadow: 0 0 12px rgba(245, 158, 11, .40); }

/* The "Total Due" row of the POS ticket stays a golden glowing box (still, not pulsing). */
.pt-1.font-bold.text-white.text-sm.justify-between {
  padding: 12px 14px !important;
  border: 1px solid rgba(245, 158, 11, .6) !important;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(245, 158, 11, .16), rgba(245, 158, 11, .04));
  align-items: center;
  box-shadow: 0 0 22px rgba(245, 158, 11, .28), inset 0 0 16px rgba(245, 158, 11, .08);
}

.font-mono.text-amber-400.text-base {
  font-size: 1.75rem !important;
  line-height: 1.1;
  font-weight: 800;
  color: #fbbf24 !important;
  text-shadow: 0 0 14px rgba(251, 191, 36, .75), 0 0 34px rgba(245, 158, 11, .4);
}
`;

export default function PremiumTheme() {
  const [off, setOff] = useState(false);

  // The saved choice is read only after the page has opened, so the server and the browser start the same.
  // Add ?theme=off to the app link to switch the theme off, and ?theme=on to switch it on again.
  useEffect(() => {
    try {
      const q = window.location.search;
      if (q.includes("theme=off")) localStorage.setItem(OFF_KEY, "1");
      else if (q.includes("theme=on")) localStorage.removeItem(OFF_KEY);
      setOff(localStorage.getItem(OFF_KEY) === "1");
    } catch {
      // storage can be blocked; the theme stays on
    }
  }, []);

  if (off) return null;
  return <style>{css}</style>;
}
