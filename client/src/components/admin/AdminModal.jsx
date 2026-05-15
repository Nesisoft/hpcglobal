import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Slide-over / centered modal for create & edit forms.
 *
 * Props:
 *   open      – boolean
 *   onClose   – close handler
 *   title     – modal heading
 *   size      – 'sm' | 'md' | 'lg' | 'xl'  (default 'md')
 *   children  – form content
 */
const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function AdminModal({ open, onClose, title, size = 'md', children }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`relative bg-white rounded-xl shadow-xl w-full ${SIZE[size] ?? SIZE.md} max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-brand/8 flex-shrink-0">
          <h3 className="font-display text-xl text-ink font-light">{title}</h3>
          <button
            onClick={onClose}
            className="text-ink/30 hover:text-ink transition-colors p-1 rounded"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
