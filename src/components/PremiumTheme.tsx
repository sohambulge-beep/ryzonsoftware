import { useEffect, useState } from "react";

const OFF_KEY = "pt_theme_off";

// Everything here is static (no blur, no moving parts), so scrolling stays smooth on cheap phones.
const css = `
html { background-color: #06020f; overscroll-behavior-y: none; }
body { overscroll-behavior-y: none; }

body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  transform: translateZ(0);
  background:
    radial-gradient(circle at 18% 12%, rgba(251, 191, 36, .55) 0 2px, transparent 3px),
    radial-gradient(circle at 82% 20%, rgba(255, 255, 255, .45) 0 2px, transparent 3px),
    radial-gradient(circle at 64% 38%, rgba(240, 171, 252, .50) 0 3px, transparent 4px),
    radial-gradient(circle at 30% 58%, rgba(251, 191, 36, .40) 0 2px, transparent 3px),
    radial-gradient(circle at 90% 66%, rgba(255, 255, 255, .35) 0 2px, transparent 3px),
    radial-gradient(circle at 12% 84%, rgba(240, 171, 252, .40) 0 2px, transparent 3px),
    radial-gradient(520px 380px at 12% 6%, rgba(168, 85, 247, .30), transparent 70%),
    radial-gradient(640px 460px at 96% 34%, rgba(236, 72, 153, .20), transparent 70%),
    radial-gradient(700px 520px at 18% 104%, rgba(99, 102, 241, .28), transparent 70%),
    radial-gradient(420px 300px at 82% 100%, rgba(245, 158, 11, .16), transparent 70%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 800' preserveAspectRatio='none'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23a855f7' stop-opacity='0'/%3E%3Cstop offset='.5' stop-color='%23f0abfc' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%23f59e0b' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M-20 560 C 80 470 170 690 420 500' fill='none' stroke='url(%23g)' stroke-width='2.5'/%3E%3Cpath d='M-20 584 C 90 504 180 704 420 534' fill='none' stroke='url(%23g)' stroke-width='1.2' opacity='.6'/%3E%3C/svg%3E") center / 100% 100% no-repeat,
    linear-gradient(160deg, #07021a 0%, #12062e 45%, #1a0a3d 70%, #08031a 100%);
}

/* The big containers let the background show through. */
.flex.overflow-hidden.bg-zinc-950,
.min-h-screen.bg-zinc-950 {
  background-color: transparent !important;
}

/* Smaller dark areas (menu, bars, small boxes) stay softly dark. */
.bg-zinc-950 { background-color: rgba(8, 4, 24, .78) !important; }

.border-zinc-800 { border-color: rgba(255, 255, 255, .12) !important; }
.border-zinc-800\\/80 { border-color: rgba(255, 255, 255, .10) !important; }

/* Cards look like glass (no blur: only a see-through colour, a light edge and a soft shadow). */
.rounded-2xl[class*="bg-zinc-900"],
.rounded-xl[class*="bg-zinc-900"] {
  background: linear-gradient(135deg, rgba(255, 255, 255, .09), rgba(255, 255, 255, .03)) !important;
  border-color: rgba(255, 255, 255, .14) !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .10);
}

[data-view="dashboard"] .rounded-2xl[class*="bg-zinc-900"],
[data-view="dashboard"] .rounded-xl[class*="bg-zinc-900"] {
  border-radius: 24px;
  border-color: rgba(255, 255, 255, .18) !important;
  box-shadow: 0 14px 38px rgba(0, 0, 0, .42), inset 0 1px 0 rgba(255, 255, 255, .14), inset 0 0 40px rgba(168, 85, 247, .06);
}

/* Big numbers glow a little in their own colour. */
.font-mono[class*="text-3xl"],
.font-mono[class*="text-4xl"] {
  text-shadow: 0 0 16px color-mix(in srgb, currentColor 50%, transparent);
}

.bg-amber-500 { box-shadow: 0 0 14px rgba(245, 158, 11, .45); }
button.bg-emerald-600 { box-shadow: 0 0 12px rgba(16, 185, 129, .32); }
button.bg-sky-600 { box-shadow: 0 0 12px rgba(14, 165, 233, .32); }
button.bg-amber-600 { box-shadow: 0 0 12px rgba(245, 158, 11, .40); }

/* The "Total Due" row of the POS ticket stays a golden glowing box (now still, not pulsing). */
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
