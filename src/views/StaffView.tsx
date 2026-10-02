import { useState } from 'react';
import { StaffModal } from '@/modals/StaffModal';
import { StaffPermissionsModal } from '@/modals/StaffPermissionsModal';
import { AttendanceTab } from '@/components/staff/AttendanceTab';
import { RosterTab } from '@/components/staff/RosterTab';
import { SalaryTab } from '@/components/staff/SalaryTab';
import { ActivityTab } from '@/components/staff/ActivityTab';
import { ApprovalsTab } from '@/components/staff/ApprovalsTab';
import {
  useDeleteStaff,
  useMyRole,
  useMyStaffId,
  useStaffList,
  type StaffMember,
} from '@/lib/staffApi';
import { fmtMoney } from '@/utils';

type TabId = 'team' | 'attendance' | 'roster' | 'salary' | 'activity' | 'approvals';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'team', label: 'Team', icon: 'fa-solid fa-users' },
  { id: 'attendance', label: 'Attendance', icon: 'fa-solid fa-calendar-check' },
  { id: 'roster', label: 'Shift Roster', icon: 'fa-solid fa-calendar-week' },
  { id: 'salary', label: 'Salary', icon: 'fa-solid fa-money-check-dollar' },
  { id: 'approvals', label: 'Approvals', icon: 'fa-solid fa-clipboard-check' },
  { id: 'activity', label: 'Activity Log', icon: 'fa-solid fa-clock-rotate-left' },
];

export function StaffView() {
  const [tab, setTab] = useState<TabId>('team');
  const [modalOpen, setModalOpen] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);

  const { data: role = 'owner' } = useMyRole();
  const { data: myStaffId = null } = useMyStaffId();
  const { data: staff = [], isLoading, error } = useStaffList();
  const remove = useDeleteStaff();

  const canManageTeam = role === 'owner';
  const tabs = TABS.filter(t => !(t.id === 'salary' && role === 'manager'));

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (s: StaffMember) => { setEditing(s); setModalOpen(true); };

  const visibleTeam = role === 'staff' ? staff.filter(s => s.id === myStaffId) : staff;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-user-tie text-amber-400" /> Staff Management
          </h2>
          <p className="text-xs text-zinc-400">
            Profiles, attendance, shift roster, salary and approvals — saved to your bar&apos;s account.
            <span className="ml-2 text-amber-400 font-mono uppercase text-[10px]">Signed in as {role}</span>
          </p>
        </div>
        {role === 'owner' && (
          <button onClick={() => setPermsOpen(true)} className="bg-zinc-900 border border-zinc-700 text-zinc-200 font-semibold rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 hover:bg-zinc-800 transition">
            <i className="fa-solid fa-user-shield" /> Roles & Permissions
          </button>
        )}
        {canManageTeam && (
          <button onClick={openNew} className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 hover:brightness-110 transition">
            <i className="fa-solid fa-user-plus" /> Add Staff
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition flex items-center gap-2 ${
              tab === t.id ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <i className={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
          Could not load staff: {error instanceof Error ? error.message : 'unknown error'}
        </div>
      )}

      {tab === 'team' && (
        isLoading ? (
          <div className="text-xs text-zinc-500">Loading staff…</div>
        ) : visibleTeam.length === 0 ? (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-8 text-center">
            <i className="fa-solid fa-user-tie text-3xl text-zinc-700 mb-3 block" />
            <div className="text-sm text-zinc-300 font-semibold">No staff added yet</div>
            <p className="text-xs text-zinc-500 mt-1">Add your first team member to start tracking attendance and salary.</p>
            {canManageTeam && (
              <button onClick={openNew} className="mt-4 bg-amber-500 text-zinc-950 font-semibold rounded-lg py-2 px-4 text-xs">
                <i className="fa-solid fa-user-plus mr-1.5" /> Add Staff
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleTeam.map(s => (
              <div key={s.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                    {s.photo_url ? (
                      <img src={s.photo_url} alt={s.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-amber-400">{s.full_name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white text-sm truncate">{s.full_name}</div>
                    <div className="text-[11px] font-mono uppercase text-amber-400">{s.role}</div>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    s.is_active ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-900/50' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="space-y-1 text-xs text-zinc-400">
                  <div><i className="fa-solid fa-phone w-4 text-zinc-500" /> {s.phone || 'No phone'}</div>
                  <div><i className="fa-solid fa-calendar-day w-4 text-zinc-500" /> Joined {s.joining_date}</div>
                  {role !== 'manager' && (
                    <div><i className="fa-solid fa-indian-rupee-sign w-4 text-zinc-500" /> {fmtMoney(Number(s.base_salary))} / month</div>
                  )}
                </div>
                {canManageTeam && (
                  <div className="flex gap-2 pt-2 border-t border-zinc-800/80">
                    <button onClick={() => openEdit(s)} className="flex-1 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 rounded-lg py-1.5 text-xs font-semibold">
                      <i className="fa-solid fa-pen mr-1" /> Edit
                    </button>
                    <button
                      onClick={() => { if (confirm(`Remove ${s.full_name}?`)) remove.mutate(s); }}
                      className="bg-red-950/60 border border-red-900/50 hover:bg-red-900/50 text-red-300 rounded-lg py-1.5 px-3 text-xs font-semibold"
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'attendance' && <AttendanceTab staff={staff} role={role} myStaffId={myStaffId} />}
      {tab === 'roster' && <RosterTab staff={staff} role={role} myStaffId={myStaffId} />}
      {tab === 'salary' && <SalaryTab staff={staff} role={role} myStaffId={myStaffId} />}
      {tab === 'approvals' && <ApprovalsTab staff={staff} role={role} myStaffId={myStaffId} />}
      {tab === 'activity' && <ActivityTab />}

      <StaffModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} canEditSalary={role === 'owner'} />
      <StaffPermissionsModal open={permsOpen} onClose={() => setPermsOpen(false)} />
    </div>
  );
}
