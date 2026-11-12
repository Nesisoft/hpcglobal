import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Slide-over / centered modal for create & edit forms.
 *
 * Props:
 *   open         – boolean
 *   onClose      – close handler
 *   title        – modal heading
 *   size         – 'sm' | 'md' | 'lg' | 'xl'  (default 'md')
 *   dismissable  – false while a save is in flight: Escape, the backdrop and
 *                  the X then do nothing (default true)
 *   label        – what a screen reader calls the dialog when the heading is
 *                  left empty and the body carries its own (ConfirmDialog)
 *   children     – form content
 */
const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

// Every open modal, shared by all of them. A modal opened from inside another
// is stacked on top of it: only the top one may answer Escape, and the page
// stays locked from scrolling until the last one closes.
const openModals = [];
let pageOverflow = '';

/** The modal painted on top: they share one z-index, so the last in the page wins. */
function topModal() {
  let top = openModals[openModals.length - 1];
  for (const m of openModals) {
    const a = top.panel.current;
    const b = m.panel.current;
    if (a && b && a !== b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)) top = m;
  }
  return top;
}

// One listener for all of them, so one key press can only ever close one.
function onDocumentKey(e) {
  if (e.key !== 'Escape' || !openModals.length) return;
  const top = topModal();
  if (top.dismissable.current) top.onClose.current?.();
}

export default function AdminModal({ open, onClose, title, size = 'md', dismissable = true, label, children }) {
  const panelRef = useRef(null);
  const bodyRef  = useRef(null);
  // Read through refs so a parent re-render never re-registers the modal.
  const onCloseRef     = useRef(onClose);
  const dismissableRef = useRef(dismissable);
  onCloseRef.current     = onClose;
  dismissableRef.current = dismissable;
  // What had focus before this opened, so it can have it back on close. Read
  // while rendering: a field inside with autoFocus takes focus before any
  // effect runs.
  const openerRef = useRef(null);
  if (!open) openerRef.current = null;
  else if (!openerRef.current) openerRef.current = document.activeElement;

  useEffect(() => {
    if (!open) return undefined;
    const me = { panel: panelRef, onClose: onCloseRef, dismissable: dismissableRef };
    if (!openModals.length) {
      pageOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onDocumentKey);
    }
    openModals.push(me);

    // Move focus into the dialog, unless a field inside already took it.
    const returnTo = openerRef.current;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const first = [...(bodyRef.current?.querySelectorAll(FOCUSABLE) ?? [])]
        .find((el) => el.getClientRects().length > 0);
      (first ?? panel).focus({ preventScroll: true });
    }

    return () => {
      const i = openModals.indexOf(me);
      if (i !== -1) openModals.splice(i, 1);
      if (!openModals.length) {
        document.body.style.overflow = pageOverflow;
        document.removeEventListener('keydown', onDocumentKey);
      }
      // Give focus back to whatever opened it, unless it has moved on since.
      const now = document.activeElement;
      if (returnTo instanceof HTMLElement && returnTo.isConnected && !panel?.contains(returnTo)
        && (!now || now === document.body || panel?.contains(now))) {
        returnTo.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;

  const close = () => { if (dismissable) onClose?.(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label || title || undefined}
        tabIndex={-1}
        className={`relative bg-white rounded-xl shadow-xl w-full ${SIZE[size] ?? SIZE.md} max-h-[90vh] flex flex-col focus:outline-none`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-brand/8 flex-shrink-0">
          <h3 className="font-display text-xl text-ink font-light">{title}</h3>
          <button
            type="button"
            onClick={close}
            disabled={!dismissable}
            aria-label="Close"
            className="text-ink/30 hover:text-ink transition-colors p-1 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-ink/30"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
