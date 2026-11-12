import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HandCoins, Plus, Upload, Users, CalendarDays, TrendingUp, UserX, AlertTriangle } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import TithersPanel from '../../components/admin/tithes/TithersPanel';
import PaymentsPanel from '../../components/admin/tithes/PaymentsPanel';
import SmsTemplateEditor from '../../components/admin/tithes/SmsTemplateEditor';
import TitherForm from '../../components/admin/tithes/TitherForm';
import RecordPaymentModal from '../../components/admin/tithes/RecordPaymentModal';
import TitherImport from '../../components/admin/tithes/TitherImport';
import TitherDetail from '../../components/admin/tithes/TitherDetail';
import { amountLabel, monthLabel } from '../../utils/tithe';

const TABS = [
  ['tithers',  'Tithers'],
  ['payments', 'Payments'],
  ['sms',      'SMS Template'],
];

// Two to a row on a phone, so the icon sits above the figures there to leave
// them the card's full width; side by side from sm up.
function Stat({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-xl border border-purple-brand/8 p-3 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
      <div className={`w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${accent ?? 'bg-purple-brand/10'}`}>
        <Icon size={16} className="text-purple-brand" />
      </div>
      <div className="min-w-0">
        <p className="text-ink/45 text-[10px] sm:text-xs font-body uppercase tracking-wider leading-snug">{label}</p>
        <p className="font-display text-lg sm:text-xl text-ink font-light mt-0.5 leading-tight break-words">{value}</p>
        {sub && <p className="text-ink/40 text-[11px] sm:text-xs font-body mt-0.5 leading-snug">{sub}</p>}
      </div>
    </div>
  );
}

/**
 * Tithes: the register of tithers, the payments recorded against it, and the
 * acknowledgement SMS each payment sends. Super admins only — the server
 * enforces it; the route only hides it from the others.
 */
export default function AdminTithes() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') : 'tithers';
  const setTab = (next) => setParams(next === 'tithers' ? {} : { tab: next }, { replace: true });

  // Bumped after anything changes, so every panel and the summary refetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  const [form, setForm]             = useState(null);    // { mode, tither } while the add/edit form is open
  const [record, setRecord]         = useState(null);    // { tither } while recording a payment
  const [importOpen, setImportOpen] = useState(false);
  const [detailId, setDetailId]     = useState(null);

  // The template editor stays mounted once opened, so a half-written message
  // survives a look at another tab.
  const [smsVisited, setSmsVisited] = useState(tab === 'sms');
  useEffect(() => { if (tab === 'sms') setSmsVisited(true); }, [tab]);

  const summaryFn = useCallback(() => adminApi.titheSummary(), []);
  const { data: summary, error: summaryError, refetch: refetchSummary } = useApi(summaryFn, []);
  useEffect(() => { if (refreshKey > 0) refetchSummary(); }, [refreshKey, refetchSummary]);

  const openRecord = (tither) => setRecord({ tither: tither ?? null });

  const month = summary?.month ? monthLabel(summary.month) : 'this month';

  return (
    <AdminLayout title="Tithes">
      <AdminPageHeader
        title="Tithes"
        subtitle="Tithers, their payments, and the SMS that thanks them"
        action={{ label: 'Record payment', icon: HandCoins, onClick: () => openRecord(null) }}
      >
        <button type="button" onClick={() => setForm({ mode: 'create', tither: null })} className="btn-outline text-xs px-4 py-2.5 whitespace-nowrap">
          <Plus size={13} /> Add tither
        </button>
        <button type="button" onClick={() => setImportOpen(true)} className="btn-outline text-xs px-4 py-2.5 whitespace-nowrap">
          <Upload size={13} /> Upload list
        </button>
      </AdminPageHeader>

      {/* The SMS Template tab shows this warning itself. */}
      {summary?.sms === 'none' && tab !== 'sms' && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-start gap-1.5 text-xs font-body text-amber-800">
            <AlertTriangle size={13} className="mt-px flex-shrink-0" />
            SMS is not set up, so no acknowledgements are going out. Payments are still recorded. Set the Hubtel credentials in Vercel to switch it on.
          </p>
        </div>
      )}

      {summaryError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-red-600 text-sm font-body flex items-center justify-between gap-3">
          <span>The totals could not be loaded: {summaryError}</span>
          <button type="button" onClick={refetchSummary} className="underline flex-shrink-0">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <Stat
            icon={CalendarDays}
            label={`Tithes for ${month}`}
            value={summary ? amountLabel(summary.monthTotal) : '—'}
            sub={summary ? `${summary.monthCount} payment${summary.monthCount === 1 ? '' : 's'} from ${summary.monthTithers} tither${summary.monthTithers === 1 ? '' : 's'}` : ''}
          />
          <Stat
            icon={UserX}
            label={`Not yet paid for ${month}`}
            value={summary ? String(summary.unpaid) : '—'}
            sub={summary ? `of ${summary.activeTithers} active tither${summary.activeTithers === 1 ? '' : 's'}` : ''}
            accent={summary?.unpaid > 0 ? 'bg-gold/15' : undefined}
          />
          <Stat
            icon={Users}
            label="Active tithers"
            value={summary ? String(summary.activeTithers) : '—'}
            sub="on the register"
          />
          <Stat
            icon={TrendingUp}
            label={`Tithes in ${summary?.month ? summary.month.slice(0, 4) : 'this year'}`}
            value={summary ? amountLabel(summary.yearTotal) : '—'}
            sub={summary ? `${summary.yearCount} payment${summary.yearCount === 1 ? '' : 's'}` : ''}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-purple-brand/10 mb-5 overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-body whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-purple-brand text-purple-brand font-medium'
                : 'border-transparent text-ink/50 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'tithers' && (
        <TithersPanel
          refreshKey={refreshKey}
          onOpenTither={setDetailId}
          onRecordPayment={openRecord}
          onAddTither={() => setForm({ mode: 'create', tither: null })}
          onImport={() => setImportOpen(true)}
        />
      )}
      {tab === 'payments' && (
        <PaymentsPanel
          refreshKey={refreshKey}
          onChanged={bump}
          onOpenTither={setDetailId}
          onRecordPayment={() => openRecord(null)}
        />
      )}
      {smsVisited && (
        <div hidden={tab !== 'sms'}>
          <SmsTemplateEditor />
        </div>
      )}

      {/* The detail reloads after any change elsewhere (an edit, a payment) so
          what it shows is never stale. */}
      {detailId && (
        <TitherDetail
          key={detailId}
          titherId={detailId}
          refreshKey={refreshKey}
          onClose={() => setDetailId(null)}
          onEdit={(tither) => setForm({ mode: 'edit', tither })}
          onConvert={(tither) => setForm({ mode: 'convert', tither })}
          onRecordPayment={openRecord}
          onChanged={bump}
        />
      )}

      <TitherForm
        open={Boolean(form)}
        mode={form?.mode ?? 'create'}
        tither={form?.tither ?? null}
        onClose={() => setForm(null)}
        onSaved={() => { setForm(null); bump(); }}
      />

      <RecordPaymentModal
        open={Boolean(record)}
        tither={record?.tither ?? null}
        onClose={() => setRecord(null)}
        onRecorded={bump}
      />

      <TitherImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={bump}
      />
    </AdminLayout>
  );
}
