import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { Check, Eye, EyeOff, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { evaluatePassword } from '../lib/passwordPolicy';
import { STATUS_LABEL } from '../lib/format';

// The website's logo (client/src/config/brand.js), so both apps show the same mark.
export const LOGO_URL = 'https://i.ibb.co/V0FCRc6T/HPC-GLOBAL-LOGO-PNG.png';

export function Spinner({ size = 18, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} aria-hidden="true" />;
}

// Elements a <label> can name. A component child (PasswordInput) is trusted
// to pass `id` on to its input.
const LABELABLE = new Set(['input', 'select', 'textarea']);

/**
 * A labelled input, as the website's admin FormField. `dark` for the purple
 * sign-in screens. With one input inside and no `htmlFor`, the label is tied
 * to it by itself — the input's own id, or one made here — so a screen reader
 * reads the label and tapping it focuses the box. Something else inside (the
 * sign-up's gender buttons) labels itself.
 */
export function Field({ label, error, hint, required, dark = false, children, htmlFor }) {
  const autoId = useId();
  const only = Children.count(children) === 1 && isValidElement(children) ? children : null;
  const labelable = only && (typeof only.type !== 'string' || LABELABLE.has(only.type));
  const id = htmlFor ?? (labelable ? (only.props.id ?? autoId) : undefined);
  const control = labelable && !htmlFor && !only.props.id ? cloneElement(only, { id }) : children;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className={dark ? 'label-dark' : 'label'}>
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      {control}
      {hint && !error && <p className={`text-[11px] font-body ${dark ? 'text-white/35' : 'text-ink/40'}`}>{hint}</p>}
      {error && <p className={`text-[12px] font-body ${dark ? 'text-red-300' : 'text-red-600'}`} role="alert">{error}</p>}
    </div>
  );
}

export function PasswordInput({ dark = false, id, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className={`${dark ? 'input-dark' : 'input'} pr-11`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className={`absolute right-3 top-1/2 -translate-y-1/2 ${dark ? 'text-white/35 hover:text-white/70' : 'text-ink/35 hover:text-ink/70'}`}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

/** The live checklist under a new-password box. */
export function PasswordChecklist({ password, dark = false }) {
  const { rules } = evaluatePassword(password);
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-1">
      {rules.map((r) => (
        <li key={r.id} className={`flex items-center gap-1.5 text-[11px] font-body ${
          r.ok ? (dark ? 'text-gold' : 'text-green-700') : (dark ? 'text-white/40' : 'text-ink/45')}`}>
          {r.ok ? <Check size={12} /> : <span className="w-3 h-3 rounded-full border border-current inline-block" />}
          {r.label}
        </li>
      ))}
    </ul>
  );
}

export function Alert({ kind = 'error', dark = false, children }) {
  if (!children) return null;
  const Icon = kind === 'error' ? AlertCircle : CheckCircle2;
  const styles = dark
    ? (kind === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-gold/10 border-gold/30 text-gold-light')
    : (kind === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800');
  return (
    <div className={`flex items-start gap-2 border rounded p-3 text-sm font-body ${styles}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={16} className="mt-0.5 flex-shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** The website's AdminPageHeader. */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-3xl text-ink font-light leading-tight">{title}</h1>
        {subtitle && <p className="text-ink/45 font-body text-sm mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-3 flex-wrap">{children}</div>}
    </div>
  );
}

/** The website's dashboard StatCard. */
const STAT_COLORS = {
  gold:   { bg: 'bg-gold/10', icon: 'text-gold', ring: 'ring-gold/20' },
  purple: { bg: 'bg-purple-brand/8', icon: 'text-purple-brand', ring: 'ring-purple-brand/15' },
  green:  { bg: 'bg-green-50', icon: 'text-green-600', ring: 'ring-green-100' },
  red:    { bg: 'bg-red-50', icon: 'text-red-500', ring: 'ring-red-100' },
};
export function StatCard({ icon: Icon, label, value, color = 'gold' }) {
  const c = STAT_COLORS[color] ?? STAT_COLORS.gold;
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-full ${c.bg} ring-1 ${c.ring} flex items-center justify-center flex-shrink-0`}>
        <Icon size={20} className={c.icon} />
      </div>
      <div className="min-w-0">
        <div className="font-display text-2xl text-ink font-light leading-none">{value ?? '—'}</div>
        <div className="text-ink/45 font-body text-[11px] uppercase tracking-wider mt-1">{label}</div>
      </div>
    </div>
  );
}

const STATUS_STYLE = {
  PENDING:   'bg-gold/15 text-[#8a6d1f] border-gold/30',
  ACTIVE:    'bg-green-50 text-green-700 border-green-200',
  DECLINED:  'bg-ink/5 text-ink/55 border-ink/10',
  SUSPENDED: 'bg-red-50 text-red-700 border-red-200',
};
export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-body font-medium whitespace-nowrap ${STATUS_STYLE[status] ?? ''}`}>
      {status === 'PENDING' ? 'Waiting' : STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Pill({ children, tone = 'purple' }) {
  const tones = {
    purple: 'bg-purple-brand/8 text-purple-brand border-purple-brand/15',
    gold:   'bg-gold/15 text-[#8a6d1f] border-gold/30',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-body font-medium ${tones[tone]}`}>{children}</span>;
}

export function Empty({ children }) {
  return (
    <div className="card py-14 text-center">
      <p className="text-ink/40 font-body text-sm px-6">{children}</p>
    </div>
  );
}

// Open dialogs, oldest first. Only the top one answers Escape, so closing a
// confirmation never closes the dialog underneath it too; the page stops
// scrolling while any is open.
const openDialogs = [];
let pageOverflow = '';

// What can take focus inside a dialog, as the website's AdminModal.
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * A dialog over the page. Escape and the backdrop close it unless `busy`.
 * Full width at the bottom of a phone screen, centred on a computer.
 *
 * Focus moves into it when it opens — so a keyboard or screen reader is in
 * the dialog, not behind it — and goes back to whatever opened it when it
 * closes, as the website's AdminModal does.
 */
export function Modal({ title, onClose, busy = false, children, footer, wide = false }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const bodyRef = useRef(null);
  const footerRef = useRef(null);
  const latest = useRef({ busy, onClose });
  latest.current = { busy, onClose };
  // What had focus before this opened. Read while rendering: a field inside
  // with autoFocus takes focus before any effect runs.
  const openerRef = useRef(null);
  if (!openerRef.current) openerRef.current = document.activeElement;

  useEffect(() => {
    const entry = {};
    if (!openDialogs.length) {
      pageOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogs.push(entry);
    const onKey = (e) => {
      if (e.key !== 'Escape' || openDialogs[openDialogs.length - 1] !== entry) return;
      if (!latest.current.busy) latest.current.onClose();
    };
    document.addEventListener('keydown', onKey);

    // Into the dialog, unless a field inside already took focus: the first
    // thing that can be used (in a confirmation that is Cancel), or the
    // dialog itself while its contents are still loading.
    const returnTo = openerRef.current;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const first = [bodyRef.current, footerRef.current]
        .flatMap((part) => [...(part?.querySelectorAll(FOCUSABLE) ?? [])])
        .find((el) => el.getClientRects().length > 0);
      (first ?? panel).focus({ preventScroll: true });
    }

    return () => {
      document.removeEventListener('keydown', onKey);
      const i = openDialogs.indexOf(entry);
      if (i !== -1) openDialogs.splice(i, 1);
      if (!openDialogs.length) document.body.style.overflow = pageOverflow;
      // Back to whatever opened it, unless focus has moved on elsewhere since.
      const now = document.activeElement;
      if (returnTo instanceof HTMLElement && returnTo.isConnected && !panel?.contains(returnTo)
        && (!now || now === document.body || panel?.contains(now))) {
        returnTo.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-purple-deep/60" onClick={() => !busy && onClose()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} sm:rounded-xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col focus:outline-none`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-purple-brand/8">
          <h2 id={titleId} className="font-display text-xl text-ink">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="text-ink/35 hover:text-ink p-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-ink/35">
            <X size={18} />
          </button>
        </div>
        {/* Without a footer the body is the bottom of a phone's sheet, so it keeps clear of the home bar. */}
        <div ref={bodyRef} className={`px-5 pt-5 overflow-y-auto ${footer ? 'pb-5' : 'pb-safe-5'}`}>{children}</div>
        {footer && (
          <div ref={footerRef} className="px-5 pt-4 pb-safe-4 border-t border-purple-brand/8 flex flex-wrap justify-end gap-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
