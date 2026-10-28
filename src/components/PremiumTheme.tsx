import { useEffect, useState } from "react";

const OFF_KEY = "pt_theme_off";

const css = `
html { background-color: #05070f; }

body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(900px 520px at 88% -8%, rgba(245,158,11,.16), transparent 62%),
    radial-gradient(720px 520px at -10% 102%, rgba(99,102,241,.16), transparent 62%),
    linear-gradient(180deg, rgba(5,7,15,.80), rgba(5,7,15,.93)),
    url("/bg-bar.jpg") center / cover no-repeat;
}

.bg-zinc-950 {
  background-color: rgba(5, 8, 18, .74) !important;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}

.border-zinc-800 { border-color: rgba(245, 158, 11, .26) !important; }
.border-zinc-800\\/80 { border-color: rgba(245, 158, 11, .20) !important; }

.rounded-lg.border.border-zinc-800,
.rounded-xl.border.border-zinc-800,
.rounded-2xl.border.border-zinc-800 {
  box-shadow:
    0 0 0 1px rgba(245, 158, 11, .08),
    0 0 18px rgba(245, 158, 11, .10),
    inset 0 0 22px rgba(245, 158, 11, .04);
}

.bg-amber-500 {
  box-shadow: 0 0 16px rgba(245, 158, 11, .55), 0 0 40px rgba(245, 158, 11, .18);
}

button.bg-emerald-600 { box-shadow: 0 0 14px rgba(16, 185, 129, .35); }
button.bg-sky-600 { box-shadow: 0 0 14px rgba(14, 165, 233, .35); }
button.bg-amber-600 { box-shadow: 0 0 14px rgba(245, 158, 11, .45); }

@keyframes ptg-pulse {
  0%, 100% { box-shadow: 0 0 16px rgba(245, 158, 11, .22), inset 0 0 14px rgba(245, 158, 11, .07); }
  50% { box-shadow: 0 0 30px rgba(245, 158, 11, .45), inset 0 0 22px rgba(245, 158, 11, .14); }
}

/* The "Total Due" row of the POS ticket becomes a golden glowing box. */
.pt-1.font-bold.text-white.text-sm.justify-between {
  padding: 12px 14px !important;
  border: 1px solid rgba(245, 158, 11, .6) !important;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(245, 158, 11, .16), rgba(245, 158, 11, .04));
  align-items: center;
  animation: ptg-pulse 3.2s ease-in-out infinite;
}

.font-mono.text-amber-400.text-base {
  font-size: 1.75rem !important;
  line-height: 1.1;
  font-weight: 800;
  color: #fbbf24 !important;
  text-shadow: 0 0 14px rgba(251, 191, 36, .75), 0 0 34px rgba(245, 158, 11, .4);
}

@media (prefers-reduced-motion: reduce) {
  .pt-1.font-bold.text-white.text-sm.justify-between { animation: none; }
}
`;

export default function PremiumTheme() {
  const [off, setOff] = useState(false);

  // The saved choice is read only after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    try {
      setOff(localStorage.getItem(OFF_KEY) === "1");
    } catch {
      // storage can be blocked; the theme stays on
    }
  }, []);

  if (off) return null;
  return <style>{css}</style>;
}
