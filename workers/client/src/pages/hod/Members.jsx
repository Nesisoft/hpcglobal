import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X, Phone, Mail } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { Alert, Empty, Field, Modal, PageHeader, Spinner, StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';

const TABS = [
  { status: 'PENDING', label: 'Waiting' },
  { status: 'ACTIVE', label: 'Members' },
  { status: 'DECLINED', label: 'Declined' },
  { status: 'SUSPENDED', label: 'Suspended' },
];

/** A head of department's members, starting with sign-ups waiting for them. */
export default function Members() {
  const { worker } = useAuth();
  const [tab, setTab] = useState('PENDING');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [declining, setDeclining] = useState(null);
  const [acting, setActing] = useState(null);
  const [notice, setNotice] = useState('');

  // Only the latest request's answer is shown: switching tabs quickly must
  // not leave one tab's list under another tab's name.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const n = ++latest.current;
    setError('');
    try {
      const res = await api.get(`/hod/members?status=${tab}`);
      if (n === latest.current) setData(res);
    } catch (err) {
      if (n === latest.current) setError(err.message);
    }
  }, [tab]);
  useEffect(() => { setData(null); load(); }, [load]);

  async function approve(member) {
    setActing(member.id); setNotice(''); setError('');
    try {
      await api.post(`/hod/members/${member.id}/approve`);
      setNotice(`${member.name} is approved and can now clock in.`);
      await load();
    } catch (err) {
      // Reload first: the reload clears the message, and this one should stay.
      await load();
      setError(err.message);
    } finally { setActing(null); }
  }

  return (
    <AppShell title="My department">
      <PageHeader title={worker.department.name} subtitle="Approve new members and see who is in your department." />

      <div className="flex gap-1 mb-5 overflow-x-auto -mx-1 px-1">
        {TABS.map((t) => (
          <button key={t.status} onClick={() => setTab(t.status)}
            className={`px-4 py-2 rounded-full text-sm font-body whitespace-nowrap border transition-colors ${
              tab === t.status ? 'bg-purple-deep text-white border-purple-deep' : 'bg-white text-ink/60 border-purple-brand/10 hover:border-purple-brand/30'}`}>
            {t.label}
            {data?.counts?.[t.status] > 0 && (
              <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${
                tab === t.status ? 'bg-gold text-purple-deep' : t.status === 'PENDING' ? 'bg-gold/20 text-[#8a6d1f]' : 'bg-purple-brand/8'}`}>
                {data.counts[t.status]}
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
        // A failed load shows its message above instead of spinning for ever.
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : data.members.length === 0 ? (
        <Empty>{tab === 'PENDING' ? 'Nobody is waiting for approval.' : 'Nobody here.'}</Empty>
      ) : (
        <ul className="space-y-3">
          {data.members.map((m) => (
            <li key={m.id} className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-body font-semibold text-ink">{m.name}</p>
                  {m.isHod && <span className="text-[11px] text-gold font-body font-semibold uppercase tracking-wider">HOD</span>}
                  {tab !== 'ACTIVE' && <StatusBadge status={m.status} />}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm font-body text-ink/55">
                  <a href={`tel:+${m.phone}`} className="inline-flex items-center gap-1.5 hover:text-purple-brand"><Phone size={13} />{m.phoneDisplay}</a>
                  <span className="inline-flex items-center gap-1.5 min-w-0"><Mail size={13} /><span className="truncate">{m.email}</span></span>
                </div>
                <p className="text-xs font-body text-ink/40 mt-1">
                  {m.status === 'PENDING' ? `Signed up ${formatDate(m.createdAt)}` : m.approvedAt ? `Approved ${formatDate(m.approvedAt)}${m.approvedByName ? ` by ${m.approvedByName}` : ''}` : ''}
                  {m.statusNote ? ` · “${m.statusNote}”` : ''}
                </p>
              </div>
              {m.status === 'PENDING' && (
                <div className="flex gap-2">
                  <button onClick={() => setDeclining(m)} disabled={acting === m.id} className="btn-outline px-4 py-2.5 flex-1 sm:flex-none">
                    <X size={15} /> Decline
                  </button>
                  <button onClick={() => approve(m)} disabled={acting === m.id} className="btn-primary px-4 py-2.5 flex-1 sm:flex-none">
                    {acting === m.id ? <Spinner size={15} /> : <Check size={15} />} Approve
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {declining && (
        <DeclineDialog
          member={declining}
          url={`/hod/members/${declining.id}/decline`}
          onClose={() => setDeclining(null)}
          onDone={async () => { setNotice(`${declining.name}’s registration was declined.`); setDeclining(null); await load(); }}
        />
      )}
    </AppShell>
  );
}

/** Shared with the admin's Workers page. */
export function DeclineDialog({ member, url, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function decline() {
    setBusy(true); setError('');
    try { await api.post(url, { reason: reason.trim() || undefined }); await onDone(); } catch (err) { setError(err.message); setBusy(false); }
  }
  return (
    <Modal title={`Decline ${member.name}?`} onClose={onClose} busy={busy}
      footer={<>
        <button onClick={onClose} disabled={busy} className="btn-outline">Cancel</button>
        <button onClick={decline} disabled={busy} className="btn-danger">{busy ? <Spinner size={15} /> : 'Decline'}</button>
      </>}>
      <div className="space-y-4">
        <Alert>{error}</Alert>
        <p className="text-sm font-body text-ink/65">They won’t be able to use the app. They’ll see the reason below when they sign in.</p>
        <Field label="Reason (optional)" hint="For example: “Not a member of our department — please choose Media.”">
          <textarea className="input min-h-[90px]" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
