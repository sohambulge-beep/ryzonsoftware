import { useState } from 'react';
import {
  useApprovals,
  useCreateApproval,
  useReviewApproval,
  type StaffMember,
  type StaffRole,
} from '@/lib/staffApi';
import { fmtMoney } from '@/utils';
import { fmtDateTime } from '@/utils';

const TYPES = ['Advance Request', 'Leave Request', 'Attendance Correction', 'Bonus Request'];

export function ApprovalsTab({
  staff,
  role,
  myStaffId,
}: {
  staff: StaffMember[];
  role: StaffRole;
  myStaffId: string | null;
}) {
  const { data: rows = [], isLoading } = useApprovals();
  const create = useCreateApproval();
  const review = useReviewApproval();
  const canReview = role !== 'staff';

  const [type, setType] = useState(TYPES[0]!);
  const [staffId, setStaffId] = useState<string>(myStaffId ?? staff[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!details.trim()) return;
    create.mutate(
      { staffId: staffId || null, type, amount: amount ? Number(amount) : null, details: details.trim() },
      { onSuccess: () => { setAmount(''); setDetails(''); } },
    );
  };

  const nameFor = (id: string | null) => staff.find(s => s.id === id)?.full_name ?? '—';

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select value={type} onChange={e => setType(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200">
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={staffId} onChange={e => setStaffId(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200">
          <option value="">No specific staff</option>
          {(role === 'staff' ? staff.filter(s => s.id === myStaffId) : staff).map(s => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
        <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="Amount (optional)" className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        <input value={details} onChange={e => setDetails(e.target.value)} placeholder="Reason / details" className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        <button type="submit" disabled={create.isPending} className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2 px-4 text-sm hover:brightness-110 transition disabled:opacity-60">
          Submit Request
        </button>
      </form>

      {isLoading ? (
        <div className="text-xs text-zinc-500">Loading requests…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-zinc-500">No approval requests yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm text-white font-semibold">{r.request_type} · {nameFor(r.staff_id)}</div>
                <div className="text-xs text-zinc-400">{r.details}</div>
                <div className="text-[11px] font-mono text-zinc-500 mt-1">{fmtDateTime(r.created_at)}</div>
              </div>
              {r.amount != null && <div className="text-sm font-mono text-amber-400">{fmtMoney(Number(r.amount))}</div>}
              <span className={`text-[10px] font-mono px-2 py-1 rounded-full ${
                r.status === 'Approved' ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-900/50'
                : r.status === 'Rejected' ? 'bg-red-950/70 text-red-300 border border-red-900/50'
                : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
              }`}>{r.status}</span>
              {canReview && r.status === 'Pending' && (
                <div className="flex gap-2">
                  <button onClick={() => review.mutate({ id: r.id, status: 'Approved' })} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg px-3 py-1.5">Approve</button>
                  <button onClick={() => review.mutate({ id: r.id, status: 'Rejected' })} className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg px-3 py-1.5">Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
