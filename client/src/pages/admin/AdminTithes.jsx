import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HandCoins, Plus, Upload, Users, CalendarDays, TrendingUp, UserX, AlertTriangle, Globe } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import TithersPanel from '../../components/admin/tithes/TithersPanel';
import PaymentsPanel from '../../components/admin/tithes/PaymentsPanel';
import OnlineTithesPanel from '../../components/admin/tithes/OnlineTithesPanel';
import SmsTemplateEditor from '../../components/admin/tithes/SmsTemplateEditor';
import TitherForm from '../../components/admin/tithes/TitherForm';
import RecordPaymentModal from '../../components/admin/tithes/RecordPaymentModal';
import TitherImport from '../../components/admin/tithes/TitherImport';
import TitherDetail from '../../components/admin/tithes/TitherDetail';
import { amountLabel, monthLabel } from '../../utils/tithe';

const TABS = [
  ['tithers',  'Tithers'],
  ['payments', 'Payments'],
  ['online',   'Online tithes'],
  ['sms',      'SMS Template'],
];

/**
 * What the new-tither form starts with for the giver of an online tithe. The
 * number they gave is offered only when nobody on the register holds it.
 */
const fromGift = (gift) => ({
  number: gift.issue === 'NOT_FOUND' ? gift.titheNumber || '' : '',
  name:   gift.name || '',
  phone:  gift.phone || '',
});

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

  // Bumped after anything changes, so every panel and the summary refetch —
  // and the sidebar's count of online tithes to add.
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => {
    setRefreshKey((k) => k + 1);
    window.dispatchEvent(new Event('hpc:online-tithes'));
  };

  // { mode, tither, initial?, gift? } while the add/edit form is open; `gift`
  // when the tither is being added for an online tithe, which is then added
  // to their new account.
  const [form, setForm]             = useState(null);
  const [record, setRecord]         = useState(null);    // { tither, gift } while recording a payment
  const [importOpen, setImportOpen] = useState(false);
  const [detailId, setDetailId]     = useState(null);

  // The template editor stays mounted once opened, so a half-written message
  // survives a look at another tab.
  const [smsVisited, setSmsVisited] = useState(tab === 'sms');
  useEffect(() => { if (tab === 'sms') setSmsVisited(true); }, [tab]);

  const summaryFn = useCallback(() => adminApi.titheSummary(), []);
  const { data: summary, error: summaryError, refetch: refetchSummary } = useApi(summaryFn, []);
  useEffect(() => { if (refreshKey > 0) refetchSummary(); }, [refreshKey, refetchSummary]);

  // Online tithes still to add. A reminder: if it can't be read, it isn't shown.
  const onlineFn = useCallback(() => adminApi.countOnlineTithes(), []);
  const { data: online, refetch: refetchOnline } = useApi(onlineFn, []);
  useEffect(() => { if (refreshKey > 0) refetchOnline(); }, [refreshKey, refetchOnline]);
  const needsMatch = online?.needsMatch ?? 0;

  const openRecord = (tither) => setRecord({ tither: tither ?? null, gift: null });
  const openAssign = (gift, tither) => setRecord({ tither: tither ?? null, gift });
  const openNewTitherFor = (gift) => {
    setRecord(null);
    setForm({ mode: 'create', tither: null, initial: fromGift(gift), gift });
  };

  function handleSaved(saved) {
    const gift = form?.gift;
    setForm(null);
    bump();
    // Straight on to adding the online tithe to the account just made (it is
    // already chosen). The gift was read before that account existed, so its
    // "not on the register" facts and suggestions no longer apply.
    if (gift && saved?.id) {
      setRecord({ tither: saved, gift: { ...gift, issue: null, holder: null, suggestions: [], newTither: true } });
    }
  }

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

      {needsMatch > 0 && tab !== 'online' && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
          <p className="flex items-start gap-1.5 text-xs font-body text-amber-800">
            <Globe size={13} className="mt-px flex-shrink-0" />
            {needsMatch === 1
              ? '1 online tithe is waiting to be added to the register.'
              : `${needsMatch} online tithes are waiting to be added to the register.`}
          </p>
          <button type="button" onClick={() => setTab('online')} className="btn-outline text-xs px-3 py-1.5 whitespace-nowrap flex-shrink-0">
            Review them
          </button>
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
            {key === 'online' && needsMatch > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold align-middle">
                {needsMatch}
              </span>
            )}
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
      {tab === 'online' && (
        <OnlineTithesPanel
          refreshKey={refreshKey}
          onChanged={bump}
          onAssign={openAssign}
          onAddTither={openNewTitherFor}
          onOpenTither={setDetailId}
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
        initial={form?.initial}
        onClose={() => setForm(null)}
        onSaved={handleSaved}
      />

      <RecordPaymentModal
        open={Boolean(record)}
        tither={record?.tither ?? null}
        gift={record?.gift ?? null}
        onClose={() => setRecord(null)}
        onRecorded={bump}
        onAddTither={openNewTitherFor}
        onChanged={bump}
      />

      <TitherImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={bump}
      />
    </AdminLayout>
  );
}
