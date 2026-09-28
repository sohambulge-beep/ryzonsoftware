import { useState, useEffect } from 'react';
import { Modal } from '@/components/Modal';

interface Props {
  open: boolean;
  table?: { id: string; name: string; seats: number } | null;
  onClose: () => void;
  onSave: (data: { name: string; seats: number }) => void;
}

export function TableFormModal({ open, table, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [seats, setSeats] = useState(2);

  useEffect(() => {
    if (open) {
      setName(table?.name ?? '');
      setSeats(table?.seats ?? 2);
    }
  }, [open, table]);

  const submit = () => {
    if (!name.trim()) {
      alert('Table ka naam likho (e.g. T1, Window 2)');
      return;
    }
    if (seats < 1) {
      alert('Seats kam se kam 1 honi chahiye');
      return;
    }
    onSave({ name: name.trim(), seats });
  };

  return (
    <Modal open={open} onClose={onClose} title={table ? 'Edit Table' : 'Add Table'} icon="fa-solid fa-utensils" maxWidth="max-w-sm">
      <div className="p-4 space-y-4">
        <div>
          <label className="text-[0.65rem] uppercase tracking-wider text-zinc-400 mb-1.5 block font-semibold font-mono">Table Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. T1, Window 2"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="text-[0.65rem] uppercase tracking-wider text-zinc-400 mb-1.5 block font-semibold font-mono">Seats</label>
          <input
            type="number"
            min={1}
            value={seats}
            onChange={e => setSeats(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={submit} className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold py-2 rounded-lg text-sm transition">
            {table ? 'Save Changes' : 'Add Table'}
          </button>
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm transition">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
