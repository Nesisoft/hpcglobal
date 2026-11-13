import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Check, X, Ban, RotateCcw, KeyRound, Trash2, Copy } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { Alert, Empty, Field, Modal, PageHeader, Pill, Spinner, StatusBadge } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatDateTime, ROLE_LABEL } from '../../lib/format';
import { useForm } from '../../lib/useForm';
import { DeclineDialog } from '../hod/Members';

const TABS = [
  { status: '', label: 'All' },
  { status: 'PENDING', label: 'Waiting' },
  { status: 'ACTIVE', label: 'Active' },
  { status: 'SUSPENDED', label: 'Suspended' },
  { status: 'DECLINED', label: 'Declined' },
];

export default function Workers() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const departmentId = params.get('department') || '';
  const page = Number(params.get('page')) || 1;
  const [q, setQ] = useState(params.get('q') || '');
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  // The search below runs from a timer. Through these it reads and changes
  // the address as it is when the timer fires, not as it was when they
  // started typing — so it never undoes a tab or department picked meanwhile.
  const latest = useRef({ params, setParams });
  latest.current = { params, setParams };

  const update = useCallback((changes) => {
    latest.current.setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
      if (!('page' in changes)) next.delete('page');
      return next;
    }, { replace: true });
  }, []);

  // Only the latest request's answer is shown, so a slow answer to an older
  // search or tab never replaces the list for the current one.
  const requests = useRef(0);
  const searched = params.get('q') || '';
  const load = useCallback(async () => {
    const n = ++requests.current;
    setError('');
    try {
      const res = await api.get(`/admin/workers${qs({ status, departmentId, q: searched, page, limit: 30 })}`);
      if (n === requests.current) setData(res);
    } catch (err) {
      if (n === requests.current) setError(err.message);
    }
  }, [status, departmentId, searched, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/admin/departments').then((r) => setDepartments(r.departments)).catch(() => {}); }, []);

  // Search as they type, a moment after they stop.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((latest.current.params.get('q') || '') !== q.trim()) update({ q: q.trim() });
    }, 350);
    return () => clearTimeout(t);
  }, [q, update]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <AppShell title="Workers">
      <PageHeader title="Workers" subtitle="Approve sign-ups, set departments and heads of department, and manage accounts." />

      <div className="flex gap-1 mb-4 overflow-x-auto -mx-1 px-1">
        {TABS.map((t) => (
          <button key={t.status} onClick={() => update({ status: t.status })}
            className={`px-4 py-2 rounded-full text-sm font-body whitespace-nowrap border transition-colors ${
              status === t.status ? 'bg-purple-deep text-white border-purple-deep' : 'bg-white text-ink/60 border-purple-brand/10 hover:border-purple-brand/30'}`}>
            {t.label}
            {t.status && data?.counts?.[t.status] > 0 && (
              <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${
                status === t.status ? 'bg-gold text-purple-deep' : t.status === 'PENDING' ? 'bg-gold/20 text-[#8a6d1f]' : 'bg-purple-brand/8'}`}>
                {data.counts[t.status]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
          <input className="input pl-10" placeholder="Search by name, email or phone" aria-label="Search workers"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input sm:w-56" aria-label="Filter by department" value={departmentId} onChange={(e) => update({ department: e.target.value })}>
          <option value="">All departments</option>
          <option value="none">No department</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}{d.active ? '' : ' (archived)'}</option>)}
        </select>
      </div>

      <div className="mb-4"><Alert>{error}</Alert></div>

      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : data.workers.length === 0 ? (
        <Empty>No workers match.</Empty>
      ) : (
        <>
          {/* Table — computers */}
          <div className="card overflow-hidden hidden md:block">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-purple-brand/8 bg-[#F9F8FC]">
                  {['Name', 'Department', 'Phone', 'Status', 'Joined'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-ink/40 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-brand/5">
                {data.workers.map((w) => (
                  <tr key={w.id} onClick={() => setOpen(w.id)} className="cursor-pointer hover:bg-[#F9F8FC]">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-ink">{w.name}</div>
                      <div className="text-ink/45 text-xs">{w.email}</div>
                    </td>
                    <td className="px-5 py-3.5 text-ink/70">
                      {w.department?.name ?? '—'}
                      {w.isHod && <span className="ml-2 text-[10px] text-gold font-semibold uppercase tracking-wider">HOD</span>}
                      {w.role !== 'WORKER' && <div><Pill>{ROLE_LABEL[w.role]}</Pill></div>}
                    </td>
                    <td className="px-5 py-3.5 text-ink/70 whitespace-nowrap">{w.phoneDisplay}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={w.status} /></td>
                    <td className="px-5 py-3.5 text-ink/55 whitespace-nowrap">{formatDate(w.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Cards — phones */}
          <ul className="md:hidden space-y-3">
            {data.workers.map((w) => (
              <li key={w.id}>
                <button onClick={() => setOpen(w.id)} className="card p-4 w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-body font-semibold text-ink truncate">{w.name}</p>
                      <p className="text-sm font-body text-ink/55">{w.department?.name ?? 'No department'}{w.isHod ? ' · HOD' : ''}</p>
                      <p className="text-xs font-body text-ink/40 mt-0.5">{w.phoneDisplay}</p>
                    </div>
                    <StatusBadge status={w.status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <div className="flex items-center justify-between mt-5 text-sm font-body text-ink/55">
              <span>{data.total} workers · page {page} of {pages}</span>
              <div className="flex gap-2">
                <button className="btn-outline px-3 py-2" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft size={16} /></button>
                <button className="btn-outline px-3 py-2" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {open && <WorkerDialog id={open} departments={departments} onClose={() => setOpen(null)} onChanged={load} />}
    </AppShell>
  );
}

/** One worker: their details to edit, and what can be done to their account. */
function WorkerDialog({ id, departments, onClose, onChanged }) {
  const { worker: me, isSuperAdmin } = useAuth();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [declining, setDeclining] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [tempPassword, setTempPassword] = useState('');
  const form = useForm(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/admin/workers/${id}`);
      setDetail(res);
      const w = res.worker;
      form.setValues({
        firstName: w.firstName, lastName: w.lastName, email: w.email, phone: w.phoneDisplay, gender: w.gender,
        departmentId: w.department?.id ?? '', isHod: w.isHod, role: w.role,
      });
    } catch (err) { setError(err.message); }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const w = detail?.worker;
  const isSelf = w?.id === me.id;
  const targetIsAdmin = w && (w.role === 'ADMIN' || w.role === 'SUPER_ADMIN');
  const canManage = w && !isSelf && (isSuperAdmin || !targetIsAdmin);
  const departmentOptions = useMemo(
    () => departments.filter((d) => d.active || d.id === w?.department?.id),
    [departments, w],
  );

  async function save(e) {
    e.preventDefault();
    setNotice('');
    const v = form.values;
    // Only what the admin changed here, so saving one field never writes back
    // another that someone else has changed since; plus when the account was
    // last edited, as loaded, so the server refuses if another admin has
    // changed it meanwhile.
    const loaded = {
      firstName: w.firstName, lastName: w.lastName, email: w.email, phone: w.phoneDisplay, gender: w.gender,
      departmentId: w.department?.id ?? null, isHod: w.isHod, role: w.role,
    };
    const current = { ...v, departmentId: v.departmentId || null };
    const changed = Object.fromEntries(Object.keys(loaded)
      .filter((k) => (k !== 'role' || isSuperAdmin) && current[k] !== loaded[k])
      .map((k) => [k, current[k]]));
    if (!Object.keys(changed).length) { form.setFormError(''); setNotice('Nothing has changed.'); return; }
    const body = { ...changed, editedAt: w.editedAt };
    let stale = false;
    const res = await form.submit(async () => {
      try {
        return await api.patch(`/admin/workers/${id}`, body);
      } catch (err) {
        // The one 409 that names no field: changed by someone else meanwhile.
        if (err.status === 409 && !err.field) stale = true;
        throw err;
      }
    });
    if (res) { setNotice('Saved.'); await load(); onChanged(); }
    // The server's message stays above the form; the form now shows the
    // account as it is, for them to make their change again.
    else if (stale) { await load(); onChanged(); }
  }

  async function act(name, path, body, message) {
    setBusy(name); setError(''); setNotice('');
    try {
      const res = await api.post(`/admin/workers/${id}/${path}`, body);
      if (res.password) setTempPassword(res.password);
      if (message) setNotice(message);
      await load(); onChanged();
    } catch (err) { setError(err.message); } finally { setBusy(''); setConfirm(null); }
  }

  async function remove() {
    setBusy('remove'); setError('');
    try { await api.del(`/admin/workers/${id}`); onChanged(); onClose(); } catch (err) { setError(err.message); setBusy(''); setConfirm(null); }
  }

  const v = form.values;
  return (
    <Modal title={w ? w.name : 'Worker'} onClose={onClose} busy={Boolean(busy) || form.busy} wide>
      {!w ? (
        error ? <Alert>{error}</Alert> : <div className="py-10 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={w.status} />
            <Pill>{ROLE_LABEL[w.role]}</Pill>
            {w.isHod && <Pill tone="gold">HOD · {w.department?.name}</Pill>}
            <span className="text-xs font-body text-ink/40">Joined {formatDate(w.createdAt)} · last signed in {w.lastLogin ? formatDateTime(w.lastLogin) : 'never'}</span>
          </div>

          <Alert>{error}</Alert>
          {notice && <Alert kind="success">{notice}</Alert>}
          {w.statusNote && <p className="text-sm font-body text-ink/55 italic">Note: “{w.statusNote}”</p>}

          {tempPassword && (
            <div className="rounded-lg border border-gold/40 bg-gold-pale/60 p-4 space-y-2">
              <p className="text-sm font-body text-ink/80">Temporary password for {w.firstName} — read it to them now. It is shown only once, works for 72 hours, and they choose their own when they sign in.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white rounded px-3 py-2 font-mono text-base text-purple-deep border border-gold/30">{tempPassword}</code>
                {/* On white like the password beside it: gold on the pale gold box is hard to see. */}
                <button type="button" className="btn-outline bg-white px-3 py-2" onClick={() => navigator.clipboard?.writeText(tempPassword)} aria-label="Copy"><Copy size={15} /></button>
              </div>
            </div>
          )}

          {/* Status actions */}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {w.status === 'PENDING' && <>
                <button className="btn-primary px-4 py-2.5" disabled={Boolean(busy)} onClick={() => act('approve', 'approve', undefined, `${w.firstName} is approved.`)}>
                  {busy === 'approve' ? <Spinner size={15} /> : <Check size={15} />} Approve
                </button>
                <button className="btn-outline px-4 py-2.5" disabled={Boolean(busy)} onClick={() => setDeclining(true)}><X size={15} /> Decline</button>
              </>}
              {w.status === 'ACTIVE' && (
                <button className="btn-outline-danger px-4 py-2.5" disabled={Boolean(busy)}
                  onClick={() => setConfirm('suspend')}><Ban size={15} /> Suspend</button>
              )}
              {(w.status === 'SUSPENDED' || w.status === 'DECLINED') && (
                <button className="btn-outline px-4 py-2.5" disabled={Boolean(busy)} onClick={() => act('reactivate', 'reactivate', undefined, `${w.firstName} is active again.`)}>
                  {busy === 'reactivate' ? <Spinner size={15} /> : <RotateCcw size={15} />} {w.status === 'DECLINED' ? 'Approve after all' : 'Reactivate'}
                </button>
              )}
              <button className="btn-outline px-4 py-2.5" disabled={Boolean(busy)} onClick={() => setConfirm('temp')}><KeyRound size={15} /> Temporary password</button>
              {(w.status === 'PENDING' || w.status === 'DECLINED') && (
                <button className="btn-outline-danger px-4 py-2.5" disabled={Boolean(busy)}
                  onClick={() => setConfirm('remove')}><Trash2 size={15} /> Remove sign-up</button>
              )}
            </div>
          )}
          {!canManage && (
            <p className="text-sm font-body text-ink/50">
              {isSelf ? 'This is you — change your own details in My profile.' : 'Only a super administrator can change an administrator’s account.'}
            </p>
          )}

          {/* Details */}
          {v && (
            <form onSubmit={save} className="space-y-4" noValidate>
              <h3 className="font-display text-xl text-ink">Details</h3>
              <fieldset disabled={!canManage || form.busy} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="First name" error={form.errors.firstName}><input className="input" value={v.firstName} onChange={form.set('firstName')} /></Field>
                  <Field label="Last name" error={form.errors.lastName}><input className="input" value={v.lastName} onChange={form.set('lastName')} /></Field>
                  <Field label="Email" error={form.errors.email}><input className="input" type="email" value={v.email} onChange={form.set('email')} /></Field>
                  <Field label="Phone" error={form.errors.phone}><input className="input" type="tel" value={v.phone} onChange={form.set('phone')} /></Field>
                  <Field label="Gender" error={form.errors.gender}>
                    <select className="input" value={v.gender} onChange={form.set('gender')}>
                      <option value="MALE">Male</option><option value="FEMALE">Female</option>
                    </select>
                  </Field>
                  <Field label="Department" error={form.errors.departmentId}>
                    <select className="input" value={v.departmentId} onChange={form.set('departmentId')}>
                      <option value="">No department</option>
                      {departmentOptions.map((d) => <option key={d.id} value={d.id}>{d.name}{d.active ? '' : ' (archived)'}</option>)}
                    </select>
                  </Field>
                  {isSuperAdmin && (
                    <Field label="Role" error={form.errors.role}>
                      <select className="input" value={v.role} onChange={form.set('role')}>
                        <option value="WORKER">Worker</option>
                        <option value="ADMIN">Administrator</option>
                        <option value="SUPER_ADMIN">Super administrator</option>
                      </select>
                    </Field>
                  )}
                </div>
                <label className="flex items-center gap-3 text-sm font-body text-ink/75 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4 accent-[#3B1278]" checked={v.isHod} onChange={form.set('isHod')} />
                  Head of department {v.departmentId ? `for ${departments.find((d) => d.id === v.departmentId)?.name ?? 'this department'}` : '(choose a department first)'}
                </label>
                {(form.errors.isHod) && <p className="text-[12px] text-red-600">{form.errors.isHod}</p>}
                <Alert>{form.formError}</Alert>
              </fieldset>
              {canManage && (
                <div className="flex justify-end">
                  <button type="submit" className="btn-primary" disabled={form.busy}>{form.busy ? <Spinner size={15} /> : 'Save details'}</button>
                </div>
              )}
            </form>
          )}

          {/* History */}
          {detail.history.length > 0 && (
            <div>
              <h3 className="font-display text-xl text-ink mb-2">History</h3>
              <ul className="space-y-2">
                {detail.history.map((h) => (
                  <li key={h.id} className="text-sm font-body text-ink/70 flex gap-3">
                    <span className="text-ink/40 whitespace-nowrap text-xs pt-0.5">{formatDateTime(h.createdAt)}</span>
                    <span>{h.summary} <span className="text-ink/40">— {h.actorName}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {declining && w && (
        <DeclineDialog member={w} url={`/admin/workers/${w.id}/decline`} onClose={() => setDeclining(false)}
          onDone={async () => { setDeclining(false); setNotice(`${w.firstName}’s registration was declined.`); await load(); onChanged(); }} />
      )}
      {confirm === 'suspend' && w && (
        <SuspendDialog worker={w} busy={busy === 'suspend'} onClose={() => setConfirm(null)}
          onConfirm={(reason) => act('suspend', 'suspend', { reason: reason || undefined }, `${w.firstName} is suspended and has been signed out.`)} />
      )}
      {confirm === 'temp' && w && (
        <Modal title="Give a temporary password?" onClose={() => setConfirm(null)} busy={busy === 'temp'}
          footer={<>
            <button className="btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy === 'temp'} onClick={() => act('temp', 'temporary-password')}>{busy === 'temp' ? <Spinner size={15} /> : 'Make a password'}</button>
          </>}>
          <p className="text-sm font-body text-ink/65">
            For when {w.firstName} can’t get the reset email. Their current password stops working and they are signed out everywhere.
            You’ll see the new password once. It works for 72 hours; they choose their own the first time they sign in with it.
          </p>
        </Modal>
      )}
      {confirm === 'remove' && w && (
        <Modal title={`Remove ${w.name}’s sign-up?`} onClose={() => setConfirm(null)} busy={busy === 'remove'}
          footer={<>
            <button className="btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn-danger" disabled={busy === 'remove'} onClick={remove}>{busy === 'remove' ? <Spinner size={15} /> : 'Remove'}</button>
          </>}>
          <p className="text-sm font-body text-ink/65">The account is deleted. They can sign up again with the same email. This can’t be undone.</p>
        </Modal>
      )}
    </Modal>
  );
}

function SuspendDialog({ worker, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={`Suspend ${worker.name}?`} onClose={onClose} busy={busy}
      footer={<>
        <button className="btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-danger" onClick={() => onConfirm(reason.trim())} disabled={busy}>{busy ? <Spinner size={15} /> : 'Suspend'}</button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm font-body text-ink/65">They are signed out at once and can’t use the app until reactivated. Their attendance history is kept.</p>
        <Field label="Reason (optional)" hint="They see this when they try to sign in.">
          <textarea className="input min-h-[80px]" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
