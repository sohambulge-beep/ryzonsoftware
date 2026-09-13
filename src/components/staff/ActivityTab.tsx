import { useActivityLog } from '@/lib/staffApi';
import { fmtDateTime } from '@/utils';

export function ActivityTab() {
  const { data: rows = [], isLoading } = useActivityLog();

  if (isLoading) return <div className="text-xs text-zinc-500">Loading activity…</div>;
  if (rows.length === 0) return <div className="text-xs text-zinc-500">No staff activity recorded yet.</div>;

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <i className="fa-solid fa-clock-rotate-left text-amber-400 text-xs" />
          <span className="text-sm text-white font-semibold">{r.action}</span>
          <span className="text-xs text-zinc-400 flex-1 min-w-[150px]">{r.details}</span>
          <span className="text-[11px] font-mono text-zinc-500">{r.actor_name ?? 'User'} · {fmtDateTime(r.created_at)}</span>
        </div>
      ))}
    </div>
  );
}
