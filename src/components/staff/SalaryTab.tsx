import { useEffect, useState } from 'react';
import {
  computeEarned,
  monthKey,
  useAttendance,
  useSalaries,
  useSalaryHistory,
  useSaveSalary,
  type StaffMember,
  type StaffRole,
} from '@/lib/staffApi';
import { fmtMoney } from '@/utils';

export function SalaryTab({
  staff,
  role,
  myStaffId,
}: {
  staff: StaffMember[];
  role: StaffRole;
  myStaffId: string | null;
}) {
  const [period, setPeriod] = useState(monthKey());
  const visible = role === 'owner' ? staff : staff.filter(s => s.id === myStaffId);
  const [selectedId, setSelectedId] = useState(visible[0]?.id ?? '');
  const selected = visible.find(s => s.id === selectedId) ?? visible[0];
  const { data: attendance = [] } = useAttendance(period);
  const { data: salaries = [] } = useSalaries(period);
  const { data: history = [] } = useSalaryHistory();
  const save = useSaveSalary();
  const canEdit = role === 'owner';

  const record = salaries.find(s => s.staff_id === selected?.id);
  const rows = attendance.filter(a => a.staff_id === selected?.id);
  const present = rows.filter(r => r.status === 'present').length;
  const half = rows.filter(r => r.status === 'half').length;
  const base = Number(selected?.base_salary ?? 0);
  const earned = computeEarned(base, present, half, period);

  const [advance, setAdvance] = useState('0');
  const [deduction, setDeduction] = useState('0');
  const [bonus, setBonus] = useState('0');
  const [paid, setPaid] = useState('0');
  const [status, setStatus] = useState('Pending');
  const [method, setMethod] = useState('Cash');
  const [note, setNote] = useState('');

  useEffect(() => {
    setAdvance(String(record?.advance ?? 0));
    setDeduction(String(record?.deduction ?? 0));
    setBonus(String(record?.bonus ?? 0));
    setPaid(String(record?.paid_amount ?? 0));
    setStatus(record?.status ?? 'Pending');
    setMethod(record?.payment_method ?? 'Cash');
    setNote(record?.note ?? '');
  }, [record?.id, selected?.id, period]);

  const net = earned + Number(bonus || 0) - Number(deduction || 0) - Number(advance || 0);

  if (!selected) return <div className="text-xs text-zinc-500">No salary records available for your account.</div>;

  const inputClass = 'w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200';
  const labelClass = 'block text-[10px] uppercase tracking-wider text-zinc-500 mb-1 font-mono';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <select value={selected.id} onChange={e => setSelectedId(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" disabled={role !== 'owner'}>
          {visible.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
        <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Base Salary', value: fmtMoney(base) },
          { label: 'Days Present', value: `${present}${half ? ` + ${half} half` : ''}` },
          { label: 'Attendance Pay', value: fmtMoney(earned) },
          { label: 'Net Payable', value: fmtMoney(net) },
        ].map(c => (
          <div key={c.label} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3">
            <div className="text-[10px] font-mono uppercase text-zinc-500">{c.label}</div>
            <div className="text-base font-bold text-amber-400">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className={labelClass}>Advance</label><input type="number" value={advance} onChange={e => setAdvance(e.target.value)} className={inputClass} disabled={!canEdit} /></div>
          <div><label className={labelClass}>Deduction</label><input type="number" value={deduction} onChange={e => setDeduction(e.target.value)} className={inputClass} disabled={!canEdit} /></div>
          <div><label className={labelClass}>Bonus</label><input type="number" value={bonus} onChange={e => setBonus(e.target.value)} className={inputClass} disabled={!canEdit} /></div>
          <div><label className={labelClass}>Paid Amount</label><input type="number" value={paid} onChange={e => setPaid(e.target.value)} className={inputClass} disabled={!canEdit} /></div>
          <div>
            <label className={labelClass}>Payment Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass} disabled={!canEdit}>
              <option>Pending</option><option>Partial</option><option>Paid</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className={inputClass} disabled={!canEdit}>
              <option>Cash</option><option>UPI</option><option>Bank Transfer</option>
            </select>
          </div>
          <div className="md:col-span-2"><label className={labelClass}>Note</label><input value={note} onChange={e => setNote(e.target.value)} className={inputClass} disabled={!canEdit} /></div>
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <button
              onClick={() =>
                save.mutate({
                  staffId: selected.id,
                  staffName: selected.full_name,
                  period,
                  base_salary: base,
                  earned,
                  advance: Number(advance || 0),
                  deduction: Number(deduction || 0),
                  bonus: Number(bonus || 0),
                  paid_amount: Number(paid || 0),
                  status,
                  payment_method: method,
                  note,
                })
              }
              disabled={save.isPending}
              className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2 px-4 text-sm hover:brightness-110 transition disabled:opacity-60"
            >
              {save.isPending ? 'Saving…' : 'Save Salary Record'}
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-mono uppercase text-zinc-400 mb-2 font-semibold">Payment History</div>
        {history.length === 0 ? (
          <div className="text-xs text-zinc-500">No salary payments recorded yet.</div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="text-[10px] font-mono uppercase text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2">Month</th><th className="text-left">Staff</th>
                  <th className="text-right">Earned</th><th className="text-right">Net</th>
                  <th className="text-right">Paid</th><th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className="border-b border-zinc-800/60">
                    <td className="py-2 font-mono text-zinc-300">{h.period_month}</td>
                    <td className="text-zinc-200">{staff.find(s => s.id === h.staff_id)?.full_name ?? '—'}</td>
                    <td className="text-right font-mono text-zinc-300">{fmtMoney(Number(h.earned))}</td>
                    <td className="text-right font-mono text-amber-400">{fmtMoney(Number(h.net_payable))}</td>
                    <td className="text-right font-mono text-zinc-300">{fmtMoney(Number(h.paid_amount))}</td>
                    <td className="text-right">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        h.status === 'Paid' ? 'bg-emerald-950/70 text-emerald-300' : h.status === 'Partial' ? 'bg-amber-500/10 text-amber-300' : 'bg-zinc-800 text-zinc-300'
                      }`}>{h.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
