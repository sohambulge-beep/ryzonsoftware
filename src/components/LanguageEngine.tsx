import { useEffect, useState } from 'react';
import { clearMissing, getMissing, initLanguage, useLanguage } from '@/i18n/engine';

// Letter spacing breaks the joined letters of Indian scripts, and these scripts need a little more line height.
const css = `
html[data-ui-lang]:not([data-ui-lang="en"]) *,
html[data-ui-lang]:not([data-ui-lang="en"]) *::before,
html[data-ui-lang]:not([data-ui-lang="en"]) *::after { letter-spacing: normal !important; }
html[data-ui-lang]:not([data-ui-lang="en"]) .leading-none,
html[data-ui-lang]:not([data-ui-lang="en"]) .leading-tight { line-height: 1.45 !important; }
html[data-ui-lang]:not([data-ui-lang="en"]) body { line-height: 1.55; }
`;

// Helper for finishing the translations: add ?i18n=debug to the app link, pick a language, open a screen and press
// "Copy missing". It copies every text on that screen that has no translation yet.
function MissingPanel() {
  const [count, setCount] = useState(0);
  const [note, setNote] = useState('');

  useEffect(() => {
    const t = window.setInterval(() => setCount(getMissing().length), 1000);
    return () => window.clearInterval(t);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(getMissing(), null, 1));
      setNote('Copied');
    } catch {
      setNote('Could not copy');
    }
    window.setTimeout(() => setNote(''), 2000);
  };

  return (
    <div
      translate="no"
      style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 150, display: 'flex', gap: 6, alignItems: 'center' }}
    >
      <button
        type="button"
        onClick={copy}
        style={{ background: '#1f2937', color: '#fcd34d', border: '1px solid #f59e0b', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}
      >
        {`Copy missing (${count})`}
      </button>
      <button
        type="button"
        onClick={() => {
          clearMissing();
          setCount(0);
        }}
        style={{ background: '#111827', color: '#d1d5db', border: '1px solid #374151', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}
      >
        Clear
      </button>
      {note && <span style={{ color: '#a7f3d0', fontSize: 11 }}>{note}</span>}
    </div>
  );
}

// Has no screen of its own. Starts the language system when the app opens.
export default function LanguageEngine() {
  const { active } = useLanguage();
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    initLanguage();
    try {
      const q = window.location.search;
      if (q.includes('i18n=debug')) localStorage.setItem('pt_i18n_debug', '1');
      else if (q.includes('i18n=off')) localStorage.removeItem('pt_i18n_debug');
      setDebug(localStorage.getItem('pt_i18n_debug') === '1');
    } catch {
      // ignore
    }
  }, []);

  return (
    <>
      <style>{css}</style>
      {debug && active !== 'en' && <MissingPanel />}
    </>
  );
}
