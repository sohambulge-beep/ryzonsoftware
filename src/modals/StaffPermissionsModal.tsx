import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { useRole } from "@/components/RoleGuard";
import {
  fetchStaffRoles,
  assignRole,
  updateStaffRole,
  removeStaffRole,
  DEFAULT_ROLE_PERMISSIONS,
  type AppRole,
  type PermissionKey,
  type StaffRoleRow,
} from "@/lib/staffLoginService";

const MODULE_OPTIONS: { key: PermissionKey; label: string }[] = [
  { key: "pos", label: "Point of Sale" },
  { key: "billing", label: "Invoices & Sales" },
  { key: "gst", label: "GST & e-Invoice" },
  { key: "customers", label: "Customers & Tabs" },
  { key: "expenses", label: "Expenses" },
  { key: "inventory", label: "Stock & Kegs" },
  { key: "staff", label: "Staff" },
  { key: "insights", label: "Business Insights" },
  { key: "suppliers", label: "Suppliers & Purchases" },
  { key: "payments", label: "Customer Payments" },
  { key: "reports", label: "Reports & Analytics" },
  { key: "backup", label: "Backup & Restore" },
];

const ROLES: AppRole[] = ["manager", "cashier", "waiter"];

const ROLE_BADGE: Record<AppRole, string> = {
  owner: "bg-amber-500/20 text-amber-300 border border-amber-700/50",
  manager: "bg-sky-500/20 text-sky-300 border border-sky-700/50",
  cashier: "bg-emerald-500/20 text-emerald-300 border border-emerald-700/50",
  waiter: "bg-zinc-500/20 text-zinc-300 border border-zinc-700/50",
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function StaffPermissionsModal({ open, onClose }: Props) {
  const { role: myRole } = useRole();

  const [staff, setStaff] = useState<StaffRoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // editor (existing staff)
  const [editing, setEditing] = useState<StaffRoleRow | null>(null);
  const [editRole, setEditRole] = useState<AppRole>("waiter");
  const [editPerms, setEditPerms] = useState<PermissionKey[]>([]);

  // new staff form
  const [newUserId, setNewUserId] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("waiter");
  const [newPerms, setNewPerms] = useState<PermissionKey[]>(DEFAULT_ROLE_PERMISSIONS.waiter);

  const load = async () => {
    setLoading(true);
    try {
      setStaff(await fetchStaffRoles());
    } catch (e: any) {
      alert(e?.message ?? "Failed to load staff roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setEditing(null);
      setNewUserId(""); setNewName(""); setNewRole("waiter");
      setNewPerms([...DEFAULT_ROLE_PERMISSIONS.waiter]);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (list: PermissionKey[], setList: (p: PermissionKey[]) => void, key: PermissionKey) =>
    setList(list.includes(key) ? list.filter(k => k !== key) : [...list, key]);

  const openEditor = (s: StaffRoleRow) => {
    setEditing(s);
    setEditRole(s.role);
    setEditPerms([...(s.permissions ?? [])]);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateStaffRole(editing.id, editRole, editPerms);
      setEditing(null);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const assignNew = async () => {
    if (!newUserId.trim()) {
      alert("Staff ka Supabase Auth User ID (uuid) daalo");
      return;
    }
    setSaving(true);
    try {
      await assignRole(newUserId.trim(), newRole, newPerms, newName.trim());
      setNewUserId(""); setNewName("");
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Assign failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: StaffRoleRow) => {
    if (!confirm(`"${s.name || s.user_id}" ka role remove karo?`)) return;
    try {
      await removeStaffRole(s.id);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Remove failed");
    }
  };

  const checkboxGrid = (list: PermissionKey[], setList: (p: PermissionKey[]) => void) => (
    <div className="grid grid-cols-2 gap-1.5">
      {MODULE_OPTIONS.map(m => (
        <label key={m.key} className="flex items-center gap-2 text-xs text-zinc-300 bg-zinc-950/70 border border-zinc-800 rounded-lg px-2.5 py-2 cursor-pointer hover:border-amber-500/50">
          <input
            type="checkbox"
            checked={list.includes(m.key)}
            onChange={() => toggle(list, setList, m.key)}
            className="accent-amber-500"
          />
          {m.label}
        </label>
      ))}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Staff Roles & Permissions" icon="fa-solid fa-user-shield" maxWidth="max-w-2xl">
      {myRole !== "owner" ? (
        <div className="p-6 text-center text-sm text-zinc-400">
          <i className="fa-solid fa-lock text-2xl text-red-400 mb-3 block" />
          Sirf <b className="text-amber-400">owner</b> staff roles manage kar sakta hai.
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {/* Staff list */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-2">Staff Members</div>
            {loading ? (
              <div className="text-xs text-zinc-500 py-4 text-center">Loading...</div>
            ) : staff.length === 0 ? (
              <div className="text-xs text-zinc-500 py-4 text-center border border-dashed border-zinc-800 rounded-lg">Koi staff role assigned nahi hai</div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                {staff.map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-xs bg-zinc-950/70 border border-zinc-800 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-zinc-200 truncate">{s.name || "(no name)"}</div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">{s.user_id.slice(0, 8)}... • {(s.permissions ?? []).length} modules</div>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${ROLE_BADGE[s.role]}`}>{s.role}</span>
                    <button onClick={() => openEditor(s)} className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300" title="Edit permissions">
                      <i className="fa-solid fa-pen" />
                    </button>
                    {s.role !== "owner" && (
                      <button onClick={() => remove(s)} className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-red-950 text-red-400" title="Remove role">
                        <i className="fa-solid fa-trash" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Editor */}
          {editing && (
            <div className="p-4 rounded-xl border border-amber-800/50 bg-amber-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-white">Edit: {editing.name || editing.user_id}</div>
                <select value={editRole} onChange={e => setEditRole(e.target.value as AppRole)}
                  className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-500">
                  {(["owner", ...ROLES] as AppRole[]).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button onClick={() => setEditPerms([...DEFAULT_ROLE_PERMISSIONS[editRole]])}
                className="text-[11px] text-amber-400 hover:underline">
                Apply "{editRole}" default permissions
              </button>
              {checkboxGrid(editPerms, setEditPerms)}
              <div className="flex gap-2 pt-1">
                <button onClick={saveEdit} disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold py-2 rounded-lg text-sm transition">
                  Save Permissions
                </button>
                <button onClick={() => setEditing(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm transition">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Assign new */}
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/50 space-y-3">
            <div className="text-sm font-bold text-white"><i className="fa-solid fa-user-plus mr-2 text-amber-400" />Assign New Staff</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Staff name"
                className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500" />
              <input value={newUserId} onChange={e => setNewUserId(e.target.value)} placeholder="Auth User ID (uuid)"
                className="sm:col-span-2 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500 font-mono" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-zinc-400 font-mono uppercase">Role</label>
              <select value={newRole} onChange={e => {
                const r = e.target.value as AppRole;
                setNewRole(r);
                setNewPerms([...DEFAULT_ROLE_PERMISSIONS[r]]);
              }} className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-500">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {checkboxGrid(newPerms, setNewPerms)}
            <button onClick={assignNew} disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm transition">
              <i className="fa-solid fa-check mr-2" />Assign Role
            </button>
            <div className="text-[10px] text-zinc-500">Staff ka Auth User ID: Supabase Dashboard → Authentication → Users se milta hai.</div>
          </div>
        </div>
      )}
    </Modal>
  );
}
