import { useEffect, useRef, useState } from 'react';
import { LANGUAGES } from '@/i18n/languages';
import { availableCodes, useLanguage } from '@/i18n/engine';

export function LanguageSwitcher() {
  const { pref, active, setPreference } = useLanguage();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const ready = availableCodes();
  const current = LANGUAGES.find(l => l.code === active) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (code: string) => {
    setPreference(code);
    setOpen(false);
  };

  const row = (selected: boolean, disabled: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm rounded-lg ${
      disabled ? 'opacity-45 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'
    } ${selected ? 'bg-amber-500/15' : ''}`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Language"
        aria-label="Language"
        className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 rounded-lg py-2 px-2.5 md:px-3 text-xs md:text-sm transition flex items-center gap-2"
      >
        <i className="fa-solid fa-globe" />
        <span translate="no" className="hidden md:inline">{current.native}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 max-h-[70vh] overflow-y-auto p-2"
          style={{
            zIndex: 160,
            background: 'linear-gradient(160deg, rgba(28,14,64,.99), rgba(10,5,28,.99))',
            border: '1px solid rgba(255,255,255,.16)',
            borderRadius: 16,
            boxShadow: '0 24px 60px rgba(0,0,0,.6)',
          }}
        >
          <div className="px-3 pt-1 pb-2 text-[10px] font-mono uppercase tracking-wider text-amber-400/80">Language</div>

          <button type="button" onClick={() => choose('auto')} className={row(pref === 'auto', false)}>
            <i className={`fa-solid fa-check w-4 text-amber-400 ${pref === 'auto' ? '' : 'opacity-0'}`} />
            <span className="flex-1">
              <span className="block text-white">Auto (device language)</span>
              <span className="block text-[11px] text-zinc-400">
                <span>Now showing:</span> <span translate="no">{current.native}</span>
              </span>
            </span>
          </button>

          {LANGUAGES.map(l => {
            const isReady = ready.includes(l.code);
            return (
              <button
                key={l.code}
                type="button"
                disabled={!isReady}
                onClick={() => isReady && choose(l.code)}
                className={row(pref === l.code, !isReady)}
              >
                <i className={`fa-solid fa-check w-4 text-amber-400 ${pref === l.code ? '' : 'opacity-0'}`} />
                <span className="flex-1">
                  <span translate="no" className="block text-white">{l.native}</span>
                  <span translate="no" className="block text-[11px] text-zinc-400">{l.english}</span>
                </span>
                {!isReady && <span className="text-[10px] text-zinc-400">Coming soon</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
