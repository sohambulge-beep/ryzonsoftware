import { useState } from 'react';
import { useStore } from '@/store';
import type { AppData } from '@/types';

export function BackupView() {
  const { db, restoreData, loadSample, clearAll } = useStore();
  const [rawJson, setRawJson] = useState(JSON.stringify(db, null, 2));

  const jsonStr = JSON.stringify(db, null, 2);
  const sizeKb = new Blob([jsonStr]).size / 1024;

  const downloadBackup = () => {
    const link = document.createElement('a');
    link.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(jsonStr);
    link.download = `TapTrack_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as AppData;
        if (parsed && parsed.taps && Array.isArray(parsed.taps)) {
          if (confirm('Restore this backup? Current bar data will be replaced.')) {
            restoreData(parsed);
            setRawJson(JSON.stringify(parsed, null, 2));
            alert('Database successfully restored from backup!');
          }
        } else {
          alert('Invalid TapTrack backup file structure.');
        }
      } catch (err) {
        alert('Error parsing JSON file: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const restoreFromRaw = () => {
    try {
      const parsed = JSON.parse(rawJson) as AppData;
      if (parsed && parsed.taps) {
        if (confirm('Replace current data with JSON in textarea?')) {
          restoreData(parsed);
          alert('Data restored successfully!');
        }
      } else {
        alert('JSON missing core entities (taps/invoices).');
      }
    } catch (err) {
      alert('Invalid JSON format: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <i className="fa-solid fa-database text-rose-400" /> Backup & Restore Business Data
        </h2>
        <p className="text-xs text-zinc-400">Export complete database as JSON or restore previous business states</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <i className="fa-solid fa-download text-lg" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Download Full Backup</h3>
              <p className="text-xs text-zinc-400">Saves all taps, stock, invoices, purchases, payments, customers & expenses.</p>
            </div>
          </div>
          <div className="bg-zinc-950/80 p-3.5 rounded-lg border border-zinc-800 text-xs font-mono space-y-1.5">
            <div className="text-zinc-400 flex justify-between"><span>Database Size:</span> <span className="text-zinc-200">{sizeKb.toFixed(1)} KB</span></div>
            <div className="text-zinc-400 flex justify-between"><span>Total Invoices:</span> <span className="text-zinc-200">{db.invoices.length}</span></div>
            <div className="text-zinc-400 flex justify-between"><span>Total Purchases:</span> <span className="text-zinc-200">{db.purchases.length}</span></div>
            <div className="text-zinc-400 flex justify-between"><span>Total Payments:</span> <span className="text-zinc-200">{db.payments.length}</span></div>
          </div>
          <button onClick={downloadBackup} className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 px-4 w-full text-sm flex items-center justify-center gap-2 hover:brightness-110 transition">
            <i className="fa-solid fa-floppy-disk" /> Backup & Download JSON File
          </button>
        </div>

        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <i className="fa-solid fa-upload text-lg" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Restore from Backup</h3>
              <p className="text-xs text-zinc-400">Select a TapTrack JSON backup file to overwrite current system database.</p>
            </div>
          </div>
          <label className="border-2 border-dashed border-zinc-700 hover:border-amber-500/60 rounded-xl p-4 text-center cursor-pointer transition block">
            <input type="file" accept=".json" className="hidden" onChange={handleFileRestore} />
            <i className="fa-solid fa-file-code text-2xl text-zinc-500 mb-2" />
            <div className="text-xs font-semibold text-zinc-300">Click to choose TapTrack JSON backup</div>
            <div className="text-[10px] text-zinc-500 mt-1">.json format only</div>
          </label>
          <div className="flex gap-2">
            <button onClick={() => { if (confirm('Reload default sample bar dataset?')) { loadSample(); setRawJson(JSON.stringify(db, null, 2)); } }} className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-2 px-4 text-xs flex items-center justify-center gap-2 transition">
              <i className="fa-solid fa-rotate-left" /> Reload Sample Data
            </button>
            <button onClick={() => { if (confirm('WARNING: Clear all transactions, customers, and history?')) { clearAll(); setRawJson(JSON.stringify(db, null, 2)); } }} className="flex-1 bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500 hover:text-white font-semibold rounded-lg py-2 px-4 text-xs flex items-center justify-center gap-2 transition">
              <i className="fa-solid fa-trash-can" /> Reset DB
            </button>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
            <i className="fa-solid fa-code text-amber-400" /> Direct JSON Paste / Inspect
          </h3>
          <button onClick={restoreFromRaw} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-1 px-3 text-xs transition">Apply JSON Text</button>
        </div>
        <textarea
          value={rawJson}
          onChange={e => setRawJson(e.target.value)}
          className="w-full h-40 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-300 scrollbar-thin outline-none focus:border-amber-500"
          placeholder="Paste TapTrack JSON database structure here to restore..."
        />
      </div>
    </div>
  );
}
