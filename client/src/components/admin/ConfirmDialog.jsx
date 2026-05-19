import { AlertTriangle, X } from 'lucide-react';
import AdminModal from './AdminModal';

/**
 * Delete / destructive action confirmation dialog.
 *
 * Props:
 *   open       – boolean
 *   onClose    – cancel handler
 *   onConfirm  – confirm handler
 *   title      – dialog heading (default "Are you sure?")
 *   message    – body text
 *   danger     – boolean, shows red confirm button (default true)
 *   loading    – disables buttons while async action runs
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  danger = true,
  loading,
}) {
  return (
    <AdminModal open={open} onClose={onClose} title="" size="sm">
      <div className="text-center py-2">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${danger ? 'bg-red-50' : 'bg-gold/10'}`}>
          <AlertTriangle size={22} className={danger ? 'text-red-500' : 'text-gold'} />
        </div>
        <h3 className="font-display text-xl text-ink font-light mb-2">{title}</h3>
        <p className="text-ink/55 font-body text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="btn-outline text-sm px-5 py-2"
          >
            <X size={14} /> Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`text-sm px-5 py-2 rounded font-body font-medium transition-colors ${
              danger
                ? 'bg-red-500 hover:bg-red-600 text-white disabled:opacity-50'
                : 'btn-primary'
            }`}
          >
            {loading ? 'Please wait…' : 'Confirm'}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
