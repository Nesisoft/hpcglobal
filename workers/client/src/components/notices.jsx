import { Pin, Trash2, Pencil } from 'lucide-react';
import { Alert, Field, Modal, Spinner } from './ui';
import { api } from '../lib/api';
import { useForm } from '../lib/useForm';
import { formatDate, accraToday } from '../lib/format';

const AUDIENCE = { ALL: 'Everyone', HODS: 'Heads of department' };
export const audienceLabel = (n) => (n.audience === 'DEPARTMENT' ? n.department?.name ?? 'A department' : AUDIENCE[n.audience]);

const STATE = {
  scheduled: { label: 'Scheduled', tone: 'bg-gold/15 text-[#8a6d1f] border-gold/30' },
  expired:   { label: 'Expired', tone: 'bg-ink/5 text-ink/50 border-ink/10' },
};

/**
 * One notice. `manage` adds who it's for, how many have read it and the
 * edit/delete buttons; a worker's own view shows "New" instead.
 */
export function NoticeCard({ notice: n, isNew = false, manage = false, members, onEdit, onDelete }) {
  return (
    <article className={`card p-4 sm:p-5 ${n.pinned ? 'border-l-4 border-l-gold' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {n.pinned && <Pin size={14} className="text-gold flex-shrink-0" aria-label="Pinned" />}
            <h2 className="font-display text-xl text-ink leading-tight">{n.title}</h2>
            {isNew && <span className="text-[10px] font-body font-semibold uppercase tracking-wider bg-gold text-purple-deep px-1.5 py-0.5 rounded">New</span>}
            {manage && STATE[n.state] && (
              <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-body font-medium ${STATE[n.state].tone}`}>{STATE[n.state].label}</span>
            )}
          </div>
          <p className="text-xs font-body text-ink/45 mt-0.5">
            {n.authorName} · {formatDate(n.publishAt)}
            {manage && <> · To {audienceLabel(n)}</>}
            {manage && n.reads !== undefined && <> · Seen by {n.reads}{members ? ` of ${members}` : ''}</>}
            {manage && n.expiresAt && <> · Until {formatDate(n.expiresAt)}</>}
          </p>
        </div>
        {manage && (onEdit || onDelete) && (
          <div className="flex gap-1 flex-shrink-0">
            {onEdit && (
              <button onClick={() => onEdit(n)} className="p-2 rounded text-ink/40 hover:text-purple-brand hover:bg-purple-brand/5" aria-label={`Edit “${n.title}”`}>
                <Pencil size={15} />
              </button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(n)} className="p-2 rounded text-ink/40 hover:text-red-600 hover:bg-red-50" aria-label={`Take down “${n.title}”`}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-sm font-body text-ink/75 mt-3 whitespace-pre-line break-words">{n.body}</p>
    </article>
  );
}

const dayOf = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

/**
 * Writing or editing a notice. `url`/`method` say where it goes; `departments`
 * (the office only) adds the choice of who it's for.
 */
export function NoticeDialog({ notice, url, method = 'post', departments, onClose, onDone }) {
  const editing = Boolean(notice);
  const { values, set, errors, formError, busy, submit } = useForm({
    title:        notice?.title ?? '',
    body:         notice?.body ?? '',
    pinned:       notice?.pinned ?? false,
    audience:     notice?.audience ?? 'ALL',
    departmentId: notice?.department?.id ?? '',
    publishOn:    notice && notice.state === 'scheduled' ? dayOf(notice.publishAt) : '',
    expiresOn:    dayOf(notice?.expiresAt),
  });

  async function send(e) {
    e.preventDefault();
    const body = {
      title: values.title, body: values.body, pinned: values.pinned,
      expiresOn: values.expiresOn || null,
      // An edit leaves a notice that is already showing where it is.
      ...(!editing || notice.state === 'scheduled' || values.publishOn ? { publishOn: values.publishOn || null } : {}),
      ...(departments ? { audience: values.audience, departmentId: values.audience === 'DEPARTMENT' ? values.departmentId || null : null } : {}),
    };
    const res = await submit(() => api[method](url, body));
    if (res) await onDone(res.notice);
  }

  return (
    <Modal title={editing ? 'Edit notice' : 'New notice'} onClose={onClose} busy={busy} wide
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="btn-outline">Cancel</button>
        <button type="submit" form="notice-form" disabled={busy} className="btn-primary">{busy ? <Spinner size={15} /> : editing ? 'Save' : 'Post'}</button>
      </>}>
      <form id="notice-form" onSubmit={send} className="space-y-4" noValidate>
        <Alert>{formError}</Alert>
        {departments && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="For" error={errors.audience} required htmlFor="notice-audience">
              <select id="notice-audience" className="input" value={values.audience} onChange={set('audience')}>
                <option value="ALL">Everyone</option>
                <option value="DEPARTMENT">One department</option>
                <option value="HODS">Heads of department</option>
              </select>
            </Field>
            {values.audience === 'DEPARTMENT' && (
              <Field label="Department" error={errors.departmentId} required htmlFor="notice-dept">
                <select id="notice-dept" className="input" value={values.departmentId} onChange={set('departmentId')}>
                  <option value="">Choose…</option>
                  {departments.filter((d) => d.active || d.id === values.departmentId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
            )}
          </div>
        )}
        <Field label="Title" error={errors.title} required htmlFor="notice-title">
          <input id="notice-title" className="input" maxLength={120} value={values.title} onChange={set('title')} />
        </Field>
        <Field label="Notice" error={errors.body} required htmlFor="notice-body">
          <textarea id="notice-body" className="input min-h-[140px]" maxLength={4000} value={values.body} onChange={set('body')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Show from" error={errors.publishOn} htmlFor="notice-from" hint={editing && notice.state !== 'scheduled' ? 'Already showing' : 'Empty: now'}>
            <input id="notice-from" type="date" className="input" min={accraToday()} value={values.publishOn} onChange={set('publishOn')}
              disabled={editing && notice.state !== 'scheduled'} />
          </Field>
          <Field label="Last day" error={errors.expiresOn} htmlFor="notice-until" hint="Empty: until taken down">
            <input id="notice-until" type="date" className="input" min={values.publishOn || accraToday()} value={values.expiresOn} onChange={set('expiresOn')} />
          </Field>
        </div>
        <label className="flex items-center gap-2.5 text-sm font-body text-ink/75">
          <input type="checkbox" className="accent-purple-brand w-4 h-4" checked={values.pinned} onChange={set('pinned')} />
          Pin it to the top
        </label>
      </form>
    </Modal>
  );
}

/** "Take this notice down?" */
export function DeleteNoticeDialog({ notice, url, onClose, onDone }) {
  const { formError, busy, submit } = useForm({});
  async function remove() {
    const res = await submit(() => api.del(url));
    if (res) await onDone();
  }
  return (
    <Modal title="Take this notice down?" onClose={onClose} busy={busy}
      footer={<>
        <button onClick={onClose} disabled={busy} className="btn-outline">Keep it</button>
        <button onClick={remove} disabled={busy} className="btn-danger">{busy ? <Spinner size={15} /> : 'Take down'}</button>
      </>}>
      <Alert>{formError}</Alert>
      <p className="text-sm font-body text-ink/65">“{notice.title}” will disappear for everyone. This can’t be undone.</p>
    </Modal>
  );
}
