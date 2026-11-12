import { MessageSquare, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';
import { SMS_STATUS } from '../../../utils/tithe';

const ICON = { SENT: CheckCircle2, FAILED: AlertTriangle, SKIPPED: MinusCircle };

/**
 * What became of a payment's acknowledgement SMS. The reason (why it was
 * skipped, or the failure) is shown underneath when `detail` is set, and is
 * always available on hover.
 *
 * Props:
 *   status  – 'SENT' | 'FAILED' | 'SKIPPED' | null  (null: nothing attempted yet)
 *   error   – the reason text kept on the payment
 *   to      – formatted numbers it reached (array of strings). A FAILED send
 *             can still have reached some of them; `error` then names only
 *             the ones it missed.
 *   detail  – show the reason / recipients as a second line
 */
export default function SmsStatusBadge({ status, error, to, detail = false }) {
  if (!status) {
    return <span className="inline-flex items-center gap-1 text-[11px] text-ink/35"><MessageSquare size={11} /> —</span>;
  }
  const meta = SMS_STATUS[status] ?? SMS_STATUS.SKIPPED;
  const Icon = ICON[status] ?? MessageSquare;

  const reached = to?.length ? `Sent to ${to.join(' and ')}` : '';
  const text =
    status === 'SENT' ? reached
    : status === 'FAILED' && reached ? `${reached}. ${error ?? ''}`.trim()
    : (error ?? '');

  return (
    <div className="min-w-0">
      <span
        title={text || undefined}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${meta.className}`}
      >
        <Icon size={10} /> {meta.label}
      </span>
      {/* Table cells don't wrap on their own; this line has to. */}
      {detail && text && (
        <p className="text-[11px] text-ink/45 mt-1 leading-snug max-w-xs whitespace-normal">{text}</p>
      )}
    </div>
  );
}
