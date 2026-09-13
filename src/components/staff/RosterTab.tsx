import { useState } from 'react';
import { WEEKDAYS, useSaveShift, useShifts, weekStartKey, type StaffMember, type StaffRole } from '@/lib/staffApi';

function shiftWeek(weekStart: string, deltaWeeks: number): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() + deltaWeeks * 7);
  return weekStartKey(date);
}

export function RosterTab({
  staff,
  role,
  myStaffId,
}: {
  staff: StaffMember[];
  role: StaffRole;
  myStaffId: string | null;
}) {
  const [week, setWeek] = useState(weekStartKey());
  const { data: shifts = [] } = useShifts(week);
  const saveShift = useSaveShift();
  const canEdit = role !== 'staff';
  const visible = role === 'staff' ? staff.filter(s => s.id === myStaffId) : staff.filter(s => s.is_active);

  const cell = (staffId: string, weekday: number) =>
    shifts.find(s => s.staff_id === staffId && s.weekday === weekday);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setWeek(shiftWeek(week, -1))} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700">
          <i className="fa-solid fa-chevron-left" />
        </button>
        <div className="text-sm text-zinc-200 font-semibold">Week of {week}</div>
        <button onClick={() => setWeek(shiftWeek(week, 1))} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700">
          <i className="fa-solid fa-chevron-right" />
        </button>
        <button onClick={() => setWeek(weekStartKey())} className="ml-auto text-xs text-amber-400 hover:underline">
          This week
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="text-xs text-zinc-500">No active staff to schedule.</div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[720px] space-y-2">
            <div className="grid grid-cols-8 gap-2 text-[10px] font-mono uppercase text-zinc-500">
              <div>Staff</div>
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center">{d}</div>
              ))}
            </div>
            {visible.map(s => (
              <div key={s.id} className="grid grid-cols-8 gap-2 items-center">
                <div className="text-xs text-zinc-200 font-semibold truncate">{s.full_name}</div>
                {WEEKDAYS.map((_, i) => {
                  const c = cell(s.id, i);
                  return (
                    <div key={i} className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-1.5 text-center">
                      {canEdit ? (
                        <div className="space-y-1">
                          <input
                            defaultValue={c?.is_off ? '' : (c?.start_time ?? '')}
                            placeholder="17:00"
                            onBlur={e =>
                              saveShift.mutate({
                                staffId: s.id,
                                staffName: s.full_name,
                                weekStart: week,
                                weekday: i,
                                start_time: e.target.value || null,
                                end_time: c?.end_time ?? null,
                                is_off: false,
                              })
                            }
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-1 py-1 text-[11px] text-zinc-200 text-center"
                          />
                          <input
                            defaultValue={c?.is_off ? '' : (c?.end_time ?? '')}
                            placeholder="23:00"
                            onBlur={e =>
                              saveShift.mutate({
                                staffId: s.id,
                                staffName: s.full_name,
                                weekStart: week,
                                weekday: i,
                                start_time: c?.start_time ?? null,
                                end_time: e.target.value || null,
                                is_off: false,
                              })
                            }
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-1 py-1 text-[11px] text-zinc-200 text-center"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              saveShift.mutate({
                                staffId: s.id,
                                staffName: s.full_name,
                                weekStart: week,
                                weekday: i,
                                start_time: null,
                                end_time: null,
                                is_off: !c?.is_off,
                              })
                            }
                            className={`w-full rounded px-1 py-0.5 text-[10px] font-mono ${c?.is_off ? 'bg-red-900/60 text-red-200' : 'bg-zinc-800 text-zinc-400'}`}
                          >
                            {c?.is_off ? 'Off' : 'Mark off'}
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11px] text-zinc-300 py-2">
                          {c?.is_off ? 'Off' : c?.start_time ? `${c.start_time}–${c.end_time ?? ''}` : '—'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
