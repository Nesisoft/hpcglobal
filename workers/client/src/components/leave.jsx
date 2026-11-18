import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Alert, Empty, Field, Modal, Spinner } from './ui';
import { api } from '../lib/api';
import { formatDate, formatDay } from '../lib/format';

export const LEAVE_TYPES = [
  { value: 'SICK', label: 'Sick' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'FAMILY', label: 'Family emergency' },
  { value: 'TRAVEL', label: 'Travel' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS = {
  PENDING:   { label: 'Waiting', tone: 'bg-gold/15 text-[#8a6d1f] border-gold/30' },
  APPROVED:  { label: 'Approved', tone: 'bg-green-50 text-green-700 border-green-200' },
  REJECTED:  { label: 'Not approved', tone: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED: { label: 'Withdrawn', tone: 'bg-ink/5 text-ink/50 border-ink/10' },
};

export function LeaveStatus({ status }) {
  const s = STATUS[status] ?? { label: status, tone: '' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-body font-medium whitespace-nowrap ${s.tone}`}>
      {s.label}
    </span>
  );
}

/** "Sun 23 Nov" or "Sun 23 Nov – Tue 25 Nov · 3 days". */
export const leaveDates = (l) => (l.startDate === l.endDate
  ? formatDay(l.startDate, { short: true })
  : `${formatDay(l.startDate, { short: true })} – ${formatDay(l.endDate, { short: true })} · ${l.days} days`);

/** The facts of one request, as every list shows them. */
export function LeaveSummary({ leave: l, showWorker = false }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        {showWorker && <p className="font-body font-semibold text-ink">{l.worker?.name}</p>}
        <p className={`font-body ${showWorker ? 'text-ink/60 text-sm' : 'font-semibold text-ink'}`}>{l.typeLabel}</p>
        <LeaveStatus status={l.status} />
      </div>
      <p className="text-sm font-body text-ink/70 mt-0.5">
        {leaveDates(l)}
        {showWorker && l.worker?.department && <span className="text-ink/40"> · {l.worker.department.name}</span>}
      </p>
      <p className="text-sm font-body text-ink/55 mt-1 break-words">“{l.reason}”</p>
      <p className="text-xs font-body text-ink/40 mt-1">
        Asked {formatDate(l.createdAt)}
        {l.reviewedByName && ` · ${l.status === 'APPROVED' ? 'Approved' : 'Reviewed'} by ${l.reviewedByName}`}
        {l.reviewNote && ` — “${l.reviewNote}”`}
      </p>
    </div>
  );
}

const FILTERS = [
  { status: 'PENDING', label: 'Waiting' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'REJECTED', label: 'Not approved' },
  { status: '', label: 'All' },
];

/**
 * Leave requests to review: a head of department's members' (`base` "/hod")
 * or everyone's ("/admin"). Waiting ones first.
 */
export function LeaveReview({ base, selfId }) {
  const [status, setStatus] = useState('PENDING');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewing, setReviewing] = useState(null);   // { leave, approve }

  const latest = useRef(0);
  const load = useCallback(async () => {
    const n = ++latest.current;
    setError('');
    try {
      const res = await api.get(`${base}/leave${status ? `?status=${status}` : ''}`);
      if (n === latest.current) setData(res);
    } catch (err) {
      if (n === latest.current) setError(err.message);
    }
  }, [base, status]);
  useEffect(() => { setData(null); load(); }, [load]);

  return (
    <div>
      <div className="flex gap-1 mb-4 overflow-x-auto -mx-1 px-1">
        {FILTERS.map((f) => (
          <button key={f.status || 'all'} onClick={() => setStatus(f.status)}
            className={`px-4 py-2 rounded-full text-sm font-body whitespace-nowrap border transition-colors ${
              status === f.status ? 'bg-purple-deep text-white border-purple-deep' : 'bg-white text-ink/60 border-purple-brand/10 hover:border-purple-brand/30'}`}>
            {f.label}
            {f.status === 'PENDING' && data?.waiting > 0 && (
              <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${status === 'PENDING' ? 'bg-gold text-purple-deep' : 'bg-gold/20 text-[#8a6d1f]'}`}>
                {data.waiting}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="space-y-3 mb-4">
        <Alert>{error}</Alert>
        {notice && <Alert kind="success">{notice}</Alert>}
      </div>
      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : data.leave.length === 0 ? (
        <Empty>{status === 'PENDING' ? 'No leave requests are waiting.' : 'No leave requests here.'}</Empty>
      ) : (
        <ul className="space-y-3">
          {data.leave.map((l) => (
            <li key={l.id} className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <LeaveSummary leave={l} showWorker />
              {l.status === 'PENDING' && l.worker?.id !== selfId && (
                <div className="flex gap-2">
                  <button onClick={() => setReviewing({ leave: l, approve: false })} className="btn-outline px-4 py-2.5 flex-1 sm:flex-none">
                    <X size={15} /> Decline
                  </button>
                  <button onClick={() => setReviewing({ leave: l, approve: true })} className="btn-primary px-4 py-2.5 flex-1 sm:flex-none">
                    <Check size={15} /> Approve
                  </button>
                </div>
              )}
              {l.status === 'PENDING' && l.worker?.id === selfId && (
                <p className="text-xs font-body text-ink/45 sm:w-40">Your own — reviewed by {base === '/hod' ? 'the church office' : 'another administrator'}.</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {reviewing && (
        <ReviewDialog
          {...reviewing}
          url={`${base}/leave/${reviewing.leave.id}/${reviewing.approve ? 'approve' : 'reject'}`}
          onClose={() => setReviewing(null)}
          onDone={async (leave) => {
            setNotice(`${leave.worker.name}’s leave was ${reviewing.approve ? 'approved' : 'declined'}.`);
            setReviewing(null);
            await load();
          }}
          onStale={async (message) => { setReviewing(null); await load(); setError(message); }}
        />
      )}
    </div>
  );
}

function ReviewDialog({ leave, approve, url, onClose, onDone, onStale }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true); setError('');
    try {
      const res = await api.post(url, { note: note.trim() || null });
      await onDone(res.leave);
    } catch (err) {
      if (err.status === 409 || err.status === 404) return onStale(err.message);
      setError(err.message); setBusy(false);
    }
  }
  return (
    <Modal title={`${approve ? 'Approve' : 'Decline'} ${leave.worker.name}’s leave?`} onClose={onClose} busy={busy}
      footer={<>
        <button onClick={onClose} disabled={busy} className="btn-outline">Cancel</button>
        <button onClick={send} disabled={busy} className={approve ? 'btn-primary' : 'btn-danger'}>
          {busy ? <Spinner size={15} /> : approve ? 'Approve' : 'Decline'}
        </button>
      </>}>
      <div className="space-y-4">
        <Alert>{error}</Alert>
        <p className="text-sm font-body text-ink/65">
          {leave.typeLabel} · {leaveDates(leave)}.{' '}
          {approve ? 'Services on these days will count as excused, not absent.' : 'Services on these days will count as usual.'}
        </p>
        <Field label="Note to them (optional)">
          <textarea className="input min-h-[80px]" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={approve ? 'For example: “Get well soon.”' : 'For example: “We need everyone for the conference that weekend.”'} />
        </Field>
      </div>
    </Modal>
  );
}
