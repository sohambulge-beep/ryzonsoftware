import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function AccountMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      setEmail(data.user.email ?? '');
      const meta = data.user.user_metadata as { full_name?: string; name?: string } | null;
      setName(meta?.full_name || meta?.name || (data.user.email ?? '').split('@')[0] || 'Account');
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: '/auth', replace: true });
  }

  const initial = (name || email || '?').charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="h-9 w-9 rounded-full bg-zinc-800 border border-zinc-700 text-amber-400 font-semibold text-sm hover:bg-zinc-700 transition flex items-center justify-center"
        aria-label="Account menu"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl p-2 z-50">
          <div className="px-3 py-2 border-b border-zinc-800 mb-1">
            <p className="text-sm text-white font-medium truncate">{name || 'Account'}</p>
            <p className="text-xs text-zinc-400 truncate">{email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg flex items-center gap-2"
          >
            <i className="fa-solid fa-right-from-bracket text-zinc-400" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
