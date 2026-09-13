import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store';
import { useAlerts } from '@/hooks/useAlerts';
import { usePlan } from '@/lib/plan';
import type { AlertSeverity } from '@/hooks/useAlerts';

const SEVERITY_STYLES: Record<AlertSeverity, { dot: string; bg: string; border: string; icon: string }> = {
  critical: { dot: 'bg-red-500', bg: 'bg-red-950/40', border: 'border-red-800/50', icon: 'text-red-400' },
  warning: { dot: 'bg-amber-500', bg: 'bg-amber-950/30', border: 'border-amber-800/40', icon: 'text-amber-400' },
  info: { dot: 'bg-sky-500', bg: 'bg-sky-950/30', border: 'border-sky-800/40', icon: 'text-sky-400' },
};

export function AlertBell() {
  const { db, navigate } = useStore();
  const alerts = useAlerts(db);
  const { hasFeature, requireFeature } = usePlan();
  const alertsUnlocked = hasFeature('alerts');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [open]);

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;

  const handleAction = (view?: string) => {
    if (view) navigate(view as never);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { if (!requireFeature('alerts')) return; setOpen(v => !v); }}
        className="relative p-2.5 rounded-lg text-zinc-300 hover:bg-zinc-800 transition touch-manipulation"
        aria-label="Smart Alerts"
      >
        <i className="fa-solid fa-bell text-lg" />
        {alertsUnlocked && alerts.length > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 ${
            criticalCount > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-zinc-950'
          }`}>
            {alerts.length}
          </span>
        )}
        {alertsUnlocked && criticalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-red-500 animate-ping opacity-60" />
        )}
      </button>

      {open && alertsUnlocked && (
        <div className="absolute right-0 top-full mt-2 w-[340px] max-w-[calc(100vw-2rem)] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 flex flex-col max-h-[70vh] overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-bell text-amber-400" />
              <h3 className="font-bold text-white text-sm">Smart Alerts</h3>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              {alerts.length} active{criticalCount > 0 && ` · ${criticalCount} critical`}
            </span>
          </div>

          <div className="overflow-y-auto scrollbar-thin flex-1 p-2 space-y-2">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs">
                <i className="fa-solid fa-circle-check text-emerald-400 text-2xl mb-2 block" />
                All clear! Koi alerts nahi hai.
              </div>
            ) : alerts.map(alert => {
              const s = SEVERITY_STYLES[alert.severity];
              return (
                <div key={alert.id} className={`rounded-lg border p-3 ${s.bg} ${s.border}`}>
                  <div className="flex items-start gap-2.5">
                    <i className={`${alert.icon} ${s.icon} text-sm mt-0.5 flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`w-2 h-2 rounded-full ${s.dot} flex-shrink-0`} />
                        <h4 className="text-xs font-bold text-white truncate">{alert.title}</h4>
                      </div>
                      <p className="text-[11px] text-zinc-300 leading-relaxed">{alert.message}</p>
                      {alert.actionLabel && alert.actionView && (
                        <button
                          type="button"
                          onClick={() => handleAction(alert.actionView)}
                          className="mt-2 text-[10px] font-bold text-amber-400 hover:text-amber-300 transition touch-manipulation"
                        >
                          {alert.actionLabel} &rarr;
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
