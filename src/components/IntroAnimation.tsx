import { useEffect, useState, useRef, useMemo } from 'react';

const TOTAL_DURATION = 12000;
const FADE_OUT_START = 10500;

const PHASES = [
  { label: 'Sales', icon: 'fa-solid fa-chart-line', delay: 3000 },
  { label: 'Inventory', icon: 'fa-solid fa-boxes-stacked', delay: 3900 },
  { label: 'Customers', icon: 'fa-solid fa-users', delay: 4800 },
  { label: 'Reports', icon: 'fa-solid fa-clipboard-list', delay: 5700 },
  { label: 'Billing', icon: 'fa-solid fa-receipt', delay: 6600 },
  { label: 'Analytics', icon: 'fa-solid fa-chart-pie', delay: 7500 },
];

export function IntroAnimation({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const [showUI, setShowUI] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const skipRef = useRef(false);

  // Generate random particles once
  const particles = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => {
      const angle = (i / 60) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 40 + Math.random() * 350;
      return {
        id: i,
        left: 15 + Math.random() * 70,
        top: 20 + Math.random() * 60,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        size: 1 + Math.random() * 3,
        delay: Math.random() * 2,
        duration: 3 + Math.random() * 3,
      };
    }), []);

  // Digital grid lines
  const gridLines = useMemo(() =>
    Array.from({ length: 16 }, (_, i) => ({
      id: i,
      top: 5 + (i * 6) + Math.random() * 2,
      delay: 1.5 + Math.random() * 2,
      duration: 1.5 + Math.random() * 1.5,
      width: 40 + Math.random() * 50,
    })), []);

  // Phase progression
  useEffect(() => {
    if (skipRef.current) return;
    const timers: number[] = [];

    PHASES.forEach((_, idx) => {
      timers.push(window.setTimeout(() => {
        setPhase(idx + 1);
      }, PHASES[idx].delay));
    });

    timers.push(window.setTimeout(() => setShowUI(true), 9000));
    timers.push(window.setTimeout(() => setFadeOut(true), FADE_OUT_START));
    timers.push(window.setTimeout(() => {
      if (!skipRef.current) onFinish();
    }, TOTAL_DURATION));

    return () => timers.forEach(clearTimeout);
  }, [onFinish]);

  // Subtle ambient audio synthesis
  useEffect(() => {
    let ctx: AudioContext | null = null;
    let humOsc: OscillatorNode | null = null;
    let humGain: GainNode | null = null;
    let sweepOsc: OscillatorNode | null = null;
    let sweepGain: GainNode | null = null;

    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = ctx;

      // Ambient low hum
      humOsc = ctx.createOscillator();
      humGain = ctx.createGain();
      humOsc.type = 'sine';
      humOsc.frequency.value = 55;
      humGain.gain.setValueAtTime(0, ctx.currentTime);
      humGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 1);
      humGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 5);
      humGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 11);
      humOsc.connect(humGain).connect(ctx.destination);
      humOsc.start();

      // Light sweep whoosh
      setTimeout(() => {
        if (!ctx || skipRef.current) return;
        sweepOsc = ctx.createOscillator();
        sweepGain = ctx.createGain();
        sweepOsc.type = 'sawtooth';
        sweepOsc.frequency.setValueAtTime(200, ctx.currentTime);
        sweepOsc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 1.5);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        sweepGain.gain.setValueAtTime(0, ctx.currentTime);
        sweepGain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.3);
        sweepGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
        sweepOsc.connect(filter).connect(sweepGain).connect(ctx.destination);
        sweepOsc.start();
        setTimeout(() => sweepOsc?.stop(), 2000);
      }, 1800);

      setTimeout(() => humOsc?.stop(), TOTAL_DURATION);
    } catch {
      // AudioContext not available — animation still plays silently
    }

    return () => {
      try { humOsc?.stop(); sweepOsc?.stop(); ctx?.close(); } catch { /* noop */ }
    };
  }, []);

  const handleSkip = () => {
    skipRef.current = true;
    try { audioCtxRef.current?.close(); } catch { /* noop */ }
    onFinish();
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black overflow-hidden ${fadeOut ? 'animate-[vfx-fade-out_1.5s_ease-in-out_forwards]' : ''}`}
    >
      {/* Ambient glow center */}
      <div
        className="absolute left-1/2 top-1/2 w-[500px] h-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/20 animate-[vfx-glow-pulse_4s_ease-in-out_infinite]"
        style={{ animationDelay: '1s' }}
      />
      <div
        className="absolute left-1/2 top-1/2 w-[300px] h-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 animate-[vfx-glow-pulse_3s_ease-in-out_infinite]"
        style={{ animationDelay: '0.5s' }}
      />

      {/* Digital grid background */}
      <div
        className="absolute inset-0 animate-[vfx-grid-pulse_4s_ease-in-out_infinite]"
        style={{
          backgroundImage: `linear-gradient(rgba(56,189,248,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.15) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
          animationDelay: '2s',
        }}
      />

      {/* Particles */}
      <div className="absolute inset-0">
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full bg-sky-300"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              boxShadow: '0 0 6px rgba(56,189,248,0.8)',
              ['--dx' as string]: `${p.dx}px`,
              ['--dy' as string]: `${p.dy}px`,
              animation: `vfx-particle-drift ${p.duration}s ease-in-out ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Light sweep */}
      <div
        className="absolute top-0 left-0 w-[200%] h-full pointer-events-none animate-[vfx-light-sweep_3s_ease-out_2s_forwards]"
        style={{
          background: 'linear-gradient(90deg, transparent 40%, rgba(56,189,248,0.15) 48%, rgba(255,255,255,0.25) 50%, rgba(56,189,248,0.15) 52%, transparent 60%)',
        }}
      />

      {/* Digital lines forming interface */}
      <div className="absolute inset-0">
        {gridLines.map(l => (
          <div
            key={l.id}
            className="absolute h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent origin-left"
            style={{
              top: `${l.top}%`,
              left: '10%',
              width: `${l.width}%`,
              animation: `vfx-digital-line-grow ${l.duration}s ease-out ${l.delay}s forwards`,
            }}
          />
        ))}
      </div>

      {/* Scan line */}
      <div
        className="absolute left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-sky-400/40 to-transparent animate-[vfx-scan-line_4s_linear_3s_forwards]"
      />

      {/* Expanding ring on reveal */}
      <div
        className="absolute left-1/2 top-1/2 w-32 h-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-400/40 animate-[vfx-ring-expand_2s_ease-out_9s_forwards]"
      />

      {/* Dashboard preview cards (phases) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="relative w-[90%] max-w-2xl">
          {/* Mock interface frame */}
          <div
            className={`relative rounded-xl border border-sky-500/30 bg-zinc-950/80 backdrop-blur-sm p-6 overflow-hidden transition-all duration-1000 ${
              showUI ? 'opacity-0 scale-105' : 'opacity-100'
            }`}
            style={{ animation: showUI ? 'none' : 'vfx-card-appear 1.5s ease-out 2.5s forwards' }}
          >
            {/* Mock sidebar */}
            <div className="flex gap-4">
              <div className="w-28 space-y-2 flex-shrink-0">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="h-7 rounded bg-zinc-800/50 border border-sky-500/10"
                    style={{ animation: `vfx-card-appear 0.5s ease-out ${3 + i * 0.3}s both` }}
                  />
                ))}
              </div>

              {/* Mock content area */}
              <div className="flex-1 space-y-3">
                {/* KPI cards */}
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="h-14 rounded-lg bg-zinc-900/60 border border-sky-500/10"
                      style={{ animation: `vfx-card-appear 0.5s ease-out ${3.2 + i * 0.2}s both` }}
                    />
                  ))}
                </div>

                {/* Chart mock */}
                <div
                  className="h-20 rounded-lg bg-zinc-900/40 border border-sky-500/10 flex items-end gap-1.5 px-3 pb-2"
                  style={{ animation: 'vfx-card-appear 0.6s ease-out 4s both' }}
                >
                  {[40, 65, 50, 80, 55, 90, 70, 100].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-gradient-to-t from-sky-500/20 to-sky-400/60"
                      style={{ height: `${h}%`, animation: `vfx-card-appear 0.4s ease-out ${4.2 + i * 0.1}s both` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Phase labels overlay */}
            <div className="absolute bottom-3 right-4 flex items-center gap-2">
              {phase > 0 && phase <= PHASES.length && (
                <span
                  key={phase}
                  className="text-[10px] font-mono text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded"
                >
                  <i className={`${PHASES[phase - 1].icon} mr-1`} />
                  {PHASES[phase - 1].label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main text: SMART BUSINESS MANAGEMENT */}
      <div className="absolute inset-x-0 top-[22%] flex flex-col items-center pointer-events-none">
        <h1
          className="text-2xl md:text-4xl font-bold text-white text-center tracking-wider"
          style={{
            animation: 'vfx-text-reveal 5s ease-in-out 1s forwards',
            textShadow: '0 0 20px rgba(56,189,248,0.6), 0 0 40px rgba(56,189,248,0.3)',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          SMART BUSINESS MANAGEMENT
        </h1>
        <p
          className="text-xs md:text-sm text-sky-300/80 font-mono mt-4 tracking-[0.3em] uppercase"
          style={{ animation: 'vfx-subtitle-reveal 5s ease-in-out 2.5s forwards' }}
        >
          Powerful &bull; Simple &bull; Professional
        </p>
      </div>

      {/* Final reveal glow */}
      {showUI && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ animation: 'vfx-zoom-in 1.5s ease-out forwards' }}
        >
          <div className="w-96 h-96 rounded-full bg-sky-400/10 blur-3xl" />
        </div>
      )}

      {/* Skip button */}
      <button
        type="button"
        onClick={handleSkip}
        className="absolute bottom-6 right-6 text-[11px] font-mono text-zinc-500 hover:text-sky-400 transition touch-manipulation flex items-center gap-1.5 z-10"
      >
        <i className="fa-solid fa-forward" /> Skip Intro
      </button>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 w-full h-0.5 bg-zinc-900">
        <div
          className="h-full bg-gradient-to-r from-sky-500 to-sky-300"
          style={{
            animation: `vfx-digital-line-grow ${TOTAL_DURATION}ms linear forwards`,
            transformOrigin: 'left',
          }}
        />
      </div>
    </div>
  );
}
