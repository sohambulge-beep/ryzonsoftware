import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: string;
  iconClass?: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, icon, iconClass = 'text-amber-400', children, maxWidth = 'max-w-md' }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    >
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
      />
      <div
        className={`relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full ${maxWidth} overflow-hidden shadow-2xl max-h-[90vh] flex flex-col`}
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <i className={`${icon} ${iconClass}`} />
            <h3 className="font-bold text-white text-base">{title}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-thin flex-1">{children}</div>
      </div>
    </div>
  );
}
