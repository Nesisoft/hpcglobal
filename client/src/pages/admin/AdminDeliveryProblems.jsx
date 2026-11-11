import { useState, useCallback } from 'react';
import { Mail, MessageSquare, CheckCircle2, AlertTriangle, CheckCheck, RefreshCw } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminTable from '../../components/admin/AdminTable';

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (d) =>
  new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const TRANSPORT_LABEL = { resend: 'Resend', smtp: 'SMTP', hubtel: 'Hubtel' };

/**
 * Emails and SMS the site tried to send and couldn't — a visitor's
 * confirmation, an office alert, a password reset — so someone can follow up
 * with the person instead of the failure sitting unread in Vercel's logs.
 */
export default function AdminDeliveryProblems() {
  const [showAll, setShowAll]     = useState(false);
  const [resolving, setResolving] = useState(null);   // a failure's id, or 'all'

  const fetchFn = useCallback(
    () => adminApi.getDeliveryFailures(showAll ? { show: 'all' } : undefined),
    [showAll],
  );
  const { data, loading, error, refetch } = useApi(fetchFn, [showAll]);
  const failures   = data?.failures ?? [];
  const open       = data?.open ?? 0;
  const total      = data?.total ?? 0;
  const transports = data?.transports;
  // Until the list has loaded, say nothing about it — an empty list that
  // failed to load must not read as "every message has gone out".
  const loaded     = Boolean(data) && !error;

  async function resolve(id) {
    setResolving(id);
    try {
      // "All" means the open ones on screen, not ones nobody has seen yet.
      if (id === 'all') await adminApi.resolveDeliveryFailures(failures.filter((f) => !f.resolvedAt).map((f) => f.id));
      else await adminApi.resolveDeliveryFailure(id);
      refetch();
      window.dispatchEvent(new Event('hpc:delivery-failures'));   // the sidebar badge
    } catch (err) {
      alert(err.response?.data?.message || 'Could not mark that as resolved.');
    } finally {
      setResolving(null);
    }
  }

  const columns = [
    {
      key: 'createdAt',
      label: 'When',
      render: (row) => (
        <div>
          <p className="text-ink/60 text-xs">{fmtDate(row.createdAt)}</p>
          <p className="text-ink/35 text-[11px]">{fmtTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'context',
      label: 'What',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-sm text-ink/80 leading-tight">{row.context}</p>
          <p className="text-ink/40 text-[11px] mt-0.5">{row.label}</p>
        </div>
      ),
    },
    {
      key: 'recipient',
      label: 'To',
      render: (row) => {
        const Icon = row.channel === 'SMS' ? MessageSquare : Mail;
        const href = row.recipient && (row.channel === 'SMS' ? `tel:${row.recipient}` : `mailto:${row.recipient}`);
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <Icon size={12} className={row.channel === 'SMS' ? 'text-gold' : 'text-purple-brand'} />
            {href
              ? <a href={href} className="text-purple-brand hover:underline">{row.recipient}</a>
              : <span className="text-ink/40">—</span>}
          </div>
        );
      },
    },
    {
      key: 'error',
      label: 'Problem',
      render: (row) => (
        <p className="text-ink/55 text-xs line-clamp-2 max-w-xs" title={row.error}>{row.error}</p>
      ),
    },
    {
      key: 'resolvedAt',
      label: '',
      render: (row) => row.resolvedAt ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-green-700">
          <CheckCircle2 size={12} /> Resolved
        </span>
      ) : (
        <button
          onClick={() => resolve(row.id)}
          disabled={resolving !== null}
          className="btn-outline text-[11px] px-3 py-1.5 whitespace-nowrap disabled:opacity-50"
        >
          {resolving === row.id ? 'Saving…' : 'Mark resolved'}
        </button>
      ),
    },
  ];

  const missing = [
    transports?.email === 'none' && 'Email is not set up, so no emails are going out. Set RESEND_API_KEY (or the SMTP settings) in Vercel.',
    transports?.sms   === 'none' && 'SMS is not set up, so no text messages are going out. Set the Hubtel credentials in Vercel.',
  ].filter(Boolean);

  return (
    <AdminLayout title="Delivery Problems">
      <AdminPageHeader
        title="Delivery Problems"
        subtitle={!loaded ? 'Emails and SMS that could not be delivered'
          : open > 0 ? `${open} message${open !== 1 ? 's' : ''} could not be delivered`
          : 'Every message has gone out'}
        action={loaded && open > 0 && !showAll && resolving === null
          ? { label: failures.length < total ? `Mark these ${failures.length} resolved` : 'Mark all resolved', icon: CheckCheck, onClick: () => resolve('all') }
          : undefined}
      >
        <div className="inline-flex rounded-lg border border-purple-brand/15 overflow-hidden text-xs font-body">
          {[[false, 'Open'], [true, 'All (90 days)']].map(([value, label]) => (
            <button
              key={label}
              onClick={() => setShowAll(value)}
              className={`px-3 py-2 transition-colors ${showAll === value ? 'bg-purple-brand text-white' : 'bg-white text-ink/55 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </AdminPageHeader>

      {missing.length > 0 ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
          {missing.map((m) => (
            <p key={m} className="flex items-start gap-1.5 text-xs font-body text-amber-800">
              <AlertTriangle size={13} className="mt-px flex-shrink-0" /> {m}
            </p>
          ))}
        </div>
      ) : transports && (
        <p className="mb-5 text-[11px] font-body text-ink/40">
          Email goes out through {TRANSPORT_LABEL[transports.email]}, SMS through {TRANSPORT_LABEL[transports.sms]}.
          Failures are kept for 90 days.
        </p>
      )}

      {error && !loading ? (
        <div className="bg-white rounded-xl border border-red-200 py-12 text-center space-y-3">
          <p className="text-red-600 font-body text-sm">Couldn’t load delivery problems: {error}</p>
          <button onClick={refetch} className="btn-outline text-xs px-4 py-2">
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      ) : (
      <>
      {loaded && failures.length < total && (
        <p className="mb-3 text-[11px] font-body text-ink/45">
          Showing the newest {failures.length} of {total}. Resolve these to see the rest.
        </p>
      )}
      <AdminTable
        columns={columns}
        rows={failures}
        loading={loading}
        empty={showAll
          ? 'Nothing has failed to send in the last 90 days.'
          : 'Nothing waiting. When an email or SMS can’t be delivered, it shows up here so you can follow up.'}
      />
      </>
      )}
    </AdminLayout>
  );
}
