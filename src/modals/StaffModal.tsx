import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { fileToAvatarDataUrl, useSaveStaff, type StaffMember, type StaffRole } from '@/lib/staffApi';

const inputClass =
  'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500 transition';
const labelClass = 'block text-[0.65rem] uppercase tracking-wider text-zinc-400 mb-1.5 font-semibold font-mono';

export function StaffModal({
  open,
  onClose,
  editing,
  canEditSalary,
}: {
  open: boolean;
  onClose: () => void;
  editing: StaffMember | null;
  canEditSalary: boolean;
}) {
  const save = useSaveStaff();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('staff');
  const [photo, setPhoto] = useState<string | null>(null);
  const [joining, setJoining] = useState('');
  const [salary, setSalary] = useState('0');
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setFullName(editing?.full_name ?? '');
    setPhone(editing?.phone ?? '');
    setEmail(editing?.email ?? '');
    setRole(editing?.role ?? 'staff');
    setPhoto(editing?.photo_url ?? null);
    setJoining(editing?.joining_date ?? new Date().toISOString().slice(0, 10));
    setSalary(String(editing?.base_salary ?? 0));
    setActive(editing?.is_active ?? true);
    setNotes(editing?.notes ?? '');
  }, [open, editing]);

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPhoto(await fileToAvatarDataUrl(file));
    } catch {
      setError('Could not read that image.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setError('');
    try {
      await save.mutateAsync({
        ...(editing ? { id: editing.id } : {}),
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role,
        photo_url: photo,
        joining_date: joining,
        base_salary: Number(salary) || 0,
        is_active: active,
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this staff member.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Staff Profile' : 'Add Staff Member'}
      icon="fa-solid fa-user-tie"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
            {photo ? (
              <img src={photo} alt={fullName || 'Staff photo'} className="w-full h-full object-cover" />
            ) : (
              <i className="fa-solid fa-user text-zinc-500 text-xl" />
            )}
          </div>
          <div className="flex-1">
            <label className={labelClass}>Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={e => handlePhoto(e.target.files?.[0])}
              className="block w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-zinc-800 file:text-zinc-200"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Full Name *</label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} className={inputClass} required />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="98765 43210" />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value as StaffRole)} className={inputClass}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Joining Date</label>
            <input type="date" value={joining} onChange={e => setJoining(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Base Salary (monthly)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={salary}
              onChange={e => setSalary(e.target.value)}
              className={inputClass}
              disabled={!canEditSalary}
            />
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select value={active ? 'active' : 'inactive'} onChange={e => setActive(e.target.value === 'active')} className={inputClass}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${inputClass} h-20 resize-none`} />
        </div>

        {error && <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-2 px-4 text-sm transition">
            Cancel
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2 px-4 text-sm hover:brightness-110 transition disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Staff'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
