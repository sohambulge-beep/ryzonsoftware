import { useMemo, useState } from 'react';
import {
  daysInMonth,
  monthKey,
  todayKey,
  useAttendance,
  useMarkAttendance,
  type StaffMember,
  type StaffRole,
} from '@/lib/staffApi';

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-emerald-600/80 text-white',
  half: 'bg-amber-500/80 text-zinc-900',
  leave: 'bg-sky-600/80 text-white',
  absent: 'bg-red-700/70 text-white',
};

export function AttendanceTab({
  staff,
  role,
  myStaffId,
}: {
  staff: StaffMember[];
  role: StaffRole;
  myStaffId: string | null;
}) {
  const visible = role === 'staff' ? staff.filter(s => s.id === myStaffId) : staff;
  const [period, setPeriod] = useState(monthKey());
  const [selectedId, setSelectedId] = useState<string>(visible[0]?.id ?? '');
  const selected = visible.find(s => s.id === selectedId) ?? visible[0];
  const { data: rows = [], isLoading } = useAttendance(period);
  const mark = useMarkAttendance();
  const today = todayKey();

  const mine = useMemo(() => rows.filter(r => r.staff_id === selected?.id), [rows, selected?.id]);
  const byDate = useMemo(() => new Map(mine.map(r => [r.work_date, r])), [mine]);

  const total = daysInMonth(period);
  const present = mine.filter(r => r.status === 'present').length;
  const half = mine.filter(r => r.status === 'half').length;
  const leave = mine.filter(r => r.status === 'leave').length;
  const absent = mine.filter(r => r.status === 'absent').length;
  const hours = mine.reduce((sum, r) => {
    if (!r.check_in_at || !r.check_out_at) return sum;
    return sum + (new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 3_600_000;
  }, 0);

  const todayRow = byDate.get(today);
  const canEditOthers = role !== 'staff';

  const [y, m] = period.split('-').map(Number);
  const firstWeekday = (new Date(y!, m! - 1, 1).getDay() + 6) % 7;

  if (!selected) return <div className="text-xs text-zinc-500">No staff profile linked to you yet.</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selected.id}
          onChange={e => setSelectedId(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
          disabled={!canEditOthers}
        >
          {visible.map(s => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
        />
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => mark.mutate({ staffId: selected.id, staffName: selected.full_name, date: today, kind: 'in' })}
            disabled={mark.isPending || !!todayRow?.check_in_at}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2 px-4 text-xs transition"
          >
            <i className="fa-solid fa-right-to-bracket mr-1.5" /> Check In
          </button>
          <button
            onClick={() => mark.mutate({ staffId: selected.id, staffName: selected.full_name, date: today, kind: 'out' })}
            disabled={mark.isPending || !todayRow?.check_in_at || !!todayRow?.check_out_at}
            className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 font-semibold rounded-lg py-2 px-4 text-xs transition"
          >
            <i className="fa-solid fa-right-from-bracket mr-1.5" /> Check Out
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Present', value: present, color: 'text-emerald-400' },
          { label: 'Half Day', value: half, color: 'text-amber-400' },
          { label: 'Leave', value: leave, color: 'text-sky-400' },
          { label: 'Absent', value: absent, color: 'text-red-400' },
          { label: 'Hours', value: hours.toFixed(1), color: 'text-zinc-200' },
        ].map(card => (
          <div key={card.label} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3">
            <div className="text-[10px] font-mono uppercase text-zinc-500">{card.label}</div>
            <div className={`text-lg font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 md:p-4">
        <div className="grid grid-cols-7 gap-1 md:gap-2 text-center text-[10px] font-mono uppercase text-zinc-500 mb-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {Array.from({ length: total }).map((_, i) => {
            const day = i + 1;
            const date = `${period}-${String(day).padStart(2, '0')}`;
            const row = byDate.get(date);
            const style = row ? STATUS_STYLE[row.status] ?? 'bg-zinc-700 text-white' : 'bg-zinc-800/60 text-zinc-500';
            return (
              <button
                key={date}
                type="button"
                disabled={!canEditOthers && selected.id !== myStaffId}
                onClick={() => {
                  const order = ['present', 'half', 'leave', 'absent'];
                  const next = order[(order.indexOf(row?.status ?? 'absent') + 1) % order.length]!;
                  mark.mutate({ staffId: selected.id, staffName: selected.full_name, date, kind: 'status', status: next });
                }}
                className={`aspect-square rounded-lg text-[11px] font-mono flex items-center justify-center transition hover:brightness-110 ${style}`}
                title={row ? `${row.status}${row.check_in_at ? ` · in ${new Date(row.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'No record'}
              >
                {day}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-zinc-400">
          <span><span className="inline-block w-2.5 h-2.5 rounded bg-emerald-600 mr-1" />Present</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded bg-amber-500 mr-1" />Half day</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded bg-sky-600 mr-1" />Leave</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded bg-red-700 mr-1" />Absent</span>
          <span className="text-zinc-500">Tap a day to change it</span>
        </div>
        {isLoading && <div className="text-xs text-zinc-500 mt-2">Loading attendance…</div>}
      </div>
    </div>
  );
}
