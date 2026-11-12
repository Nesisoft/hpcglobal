import { useState, useEffect, useRef } from 'react';
import { Search, Check, X, Plus, Phone, CheckCircle2, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { adminApi } from '../../../services/api';
import AdminModal from '../AdminModal';
import FormField from '../FormField';
import Toggle from '../Toggle';
import MonthPicker from './MonthPicker';
import {
  displayName, formatPhone, renderTemplate, templateValues,
  amountLabel, monthLabel, dateLabel, todayYmd, thisMonth,
} from '../../../utils/tithe';
import { smsSegments } from '../../../utils/format';

const ERROR_BOX = 'bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body';

/** The numbers the acknowledgement goes to — the same rule as the server's smsRecipients. */
function recipientsOf(tither) {
  if (!tither) return [];
  const phones = [tither.phone, tither.type === 'COUPLE' && tither.spousePhone].filter(Boolean);
  return [...new Set(phones)].map(formatPhone);
}

const freshForm = () => ({ amount: '', month: thisMonth(), paidOn: todayYmd(), note: '' });

/**
 * Record one tithe payment and show what became of its acknowledgement SMS.
 *
 * Props:
 *   open        – boolean
 *   tither      – optional: the account the payment is for (otherwise searched here)
 *   onClose     – close handler
 *   onRecorded  – ({ payment, sms }) => void, right after a payment is saved
 */
export default function RecordPaymentModal({ open, tither, onClose, onRecorded }) {
  const [selected, setSelected]       = useState(tither ?? null);
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState([]);
  const [resultsFor, setResultsFor]   = useState('');   // the text those results answer
  const [searching, setSearching]     = useState(false);
  const [searchError, setSearchError] = useState('');

  const [settings, setSettings]           = useState(null);
  const [settingsError, setSettingsError] = useState('');
  const [settingsTry, setSettingsTry]     = useState(0);

  const [form, setForm]       = useState(freshForm);
  const [sendSms, setSendSms] = useState(true);
  const [phase, setPhase]     = useState('');     // '' | 'saving'
  const [error, setError]     = useState('');
  const [result, setResult]   = useState(null);   // { payment, sms } once saved

  const searchRef = useRef(null);
  const amountRef = useRef(null);
  // Set once the office flips the SMS switch, so the settings arriving late
  // never overrule that choice.
  const smsTouchedRef = useRef(false);
  // The latest of these, for a search started by Enter that answers later.
  const latestRef = useRef({});
  latestRef.current = { open, query, selected };
  const enterRef = useRef(0);

  // Start afresh each time the modal opens, or is opened for someone else.
  // Keyed on the id so a parent re-render with the same tither does not wipe
  // what has been typed.
  useEffect(() => {
    if (!open) return;
    setSelected(tither ?? null);
    setQuery(''); setResults([]); setResultsFor(''); setSearchError('');
    setForm(freshForm());
    setSendSms(true);
    smsTouchedRef.current = false;
    enterRef.current += 1;
    setPhase(''); setError(''); setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tither?.id]);

  // The template, the church name and whether SMS can go out at all.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSettings(null); setSettingsError('');
    adminApi.getTitheSettings()
      .then(({ data }) => {
        if (cancelled) return;
        setSettings(data);
        // Off by default when automatic sending is off; still usable by hand.
        if (data.smsEnabled === false && !smsTouchedRef.current) setSendSms(false);
      })
      .catch((err) => {
        if (!cancelled) setSettingsError(err.response?.data?.message || 'Could not load the SMS settings.');
      });
    return () => { cancelled = true; };
  }, [open, settingsTry]);

  // Search as the person types; a keystroke supersedes the request before it.
  useEffect(() => {
    if (!open || selected) return;
    const q = query.trim();
    if (!q) { setResults([]); setResultsFor(''); setSearching(false); setSearchError(''); return undefined; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      adminApi.getTithers({ q, status: 'active', limit: 8 })
        .then(({ data }) => { if (!cancelled) { setResults(data.tithers ?? []); setResultsFor(q); setSearchError(''); } })
        .catch((err) => { if (!cancelled) { setResults([]); setResultsFor(''); setSearchError(err.response?.data?.message || 'Search failed. Please try again.'); } })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, selected, query]);

  // With nobody chosen the search box is the first thing to fill in;
  // otherwise the amount.
  useEffect(() => {
    if (!open || result) return;
    (selected ? amountRef : searchRef).current?.focus();
  }, [open, selected?.id, result]);   // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  function pick(t) {
    enterRef.current += 1;   // a search still running for Enter no longer matters
    setSelected(t);
    setQuery(''); setResults([]); setResultsFor(''); setSearchError('');
    setError('');
  }

  async function onSearchKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // Results on screen for this very text: take the first.
    if (resultsFor === q) {
      if (results[0]) pick(results[0]);
      return;
    }
    // They are still for what was typed before; search for this now instead
    // of picking someone the office did not mean.
    const mine = ++enterRef.current;
    setSearching(true);
    try {
      const { data } = await adminApi.getTithers({ q, status: 'active', limit: 8 });
      const now = latestRef.current;
      if (mine !== enterRef.current || !now.open || now.selected || now.query.trim() !== q) return;
      const found = data.tithers ?? [];
      if (found[0]) pick(found[0]);
      else { setResults([]); setResultsFor(q); setSearchError(''); setSearching(false); }
    } catch (err) {
      if (mine !== enterRef.current) return;
      setSearchError(err.response?.data?.message || 'Search failed. Please try again.');
      setSearching(false);
    }
  }

  function toggleSms(value) {
    smsTouchedRef.current = true;
    setSendSms(value);
  }

  const recipients = recipientsOf(selected);
  const noPhone    = Boolean(selected) && recipients.length === 0;
  const smsOff     = settings?.sms === 'none';
  const autoOff    = settings?.smsEnabled === false;
  const archived   = selected?.isActive === false;
  const smsLocked  = noPhone || smsOff;
  const willSend   = sendSms && !smsLocked;

  const smsNote = noPhone ? 'No phone number on this account.'
    : smsOff ? 'SMS is not set up in Vercel.'
    : autoOff ? 'Automatic SMS is switched off under SMS Template. Switch this on to send one by hand for this payment.'
    : '';

  const previewText = willSend && selected && settings
    ? renderTemplate(settings.smsTemplate, templateValues(selected, { amount: Number(form.amount) || 0, month: form.month, paidOn: form.paidOn }, settings.church))
    : '';
  const segments = previewText ? smsSegments(previewText) : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (phase) return;
    const amount = Number(form.amount);
    if (!selected) { setError('Choose who the payment is from.'); return; }
    if (archived) { setError(`${displayName(selected)}'s account is archived. Restore it first, then record the payment.`); return; }
    if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) { setError('Enter the amount paid — more than zero.'); return; }
    if (!form.month) { setError('Choose the month the tithe is for.'); return; }
    if (!form.paidOn) { setError('Choose the date it was paid.'); return; }

    setPhase('saving'); setError('');
    try {
      // Left alone, the switch shows the SMS Template setting, so nothing is
      // sent and the server's setting decides — and records the real reason
      // when no text goes (no phone, SMS not set up, sending switched off).
      // Flipped by the office, or shown without the settings to go on, it is
      // their choice for this payment: on sends even while automatic sending
      // is off, off records only.
      const choice = !smsLocked && (smsTouchedRef.current || settingsError) ? { sendSms: willSend } : {};
      const { data } = await adminApi.recordTithePayment({
        titherId: selected.id,
        amount,
        month:   form.month,
        paidOn:  form.paidOn,
        note:    form.note.trim(),
        ...choice,
      });
      setResult(data);
      onRecorded?.(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not record the payment. Please try again.');
    } finally {
      setPhase('');
    }
  }

  function recordAnother() {
    setResult(null); setError('');
    set({ amount: '', note: '' });
    if (!tither) setSelected(null);
  }

  return (
    <AdminModal open={open} onClose={onClose} title="Record a tithe payment" size="lg" dismissable={!phase}>
      {result ? (
        <ResultView result={result} onAnother={recordAnother} onDone={onClose} />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Who */}
          {selected ? (
            <div className="rounded-lg border border-purple-brand/15 bg-cream/40 px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-ink/50">{selected.number}</p>
                <p className="font-display text-lg text-ink font-light leading-tight flex items-center gap-2 flex-wrap">
                  {displayName(selected)}
                  {selected.type === 'COUPLE' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-brand/10 text-purple-brand font-body">Couple</span>
                  )}
                  {archived && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink/5 text-ink/50 font-body">Archived</span>
                  )}
                </p>
                <p className="text-[11px] text-ink/45 font-body mt-1 flex items-center gap-1">
                  <Phone size={11} className="flex-shrink-0" />
                  {recipients.length ? recipients.join(' · ') : 'No phone number'}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="btn-ghost text-xs flex-shrink-0">
                Change
              </button>
            </div>
          ) : (
            <FormField label="Who is it from" required hint="Type a name, tithe number or phone. Archived accounts are not offered.">
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35 pointer-events-none" />
                <input
                  ref={searchRef}
                  className="input pl-10"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKey}
                  placeholder="Kofi Mensah, HPC021 or 024…"
                  autoComplete="off"
                />
              </div>
              {searchError && <p className="text-[11px] text-red-500 font-body">{searchError}</p>}
              {!searchError && query.trim() && (
                searching && !results.length ? (
                  <p className="text-[11px] text-ink/40 font-body">Searching…</p>
                ) : results.length ? (
                  <div className="rounded-lg border border-purple-brand/15 divide-y divide-purple-brand/8 overflow-hidden">
                    {results.map((t) => {
                      const phones = recipientsOf(t);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => pick(t)}
                          className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-purple-brand/5 transition-colors"
                        >
                          <span className="font-mono text-xs text-ink/50 w-16 flex-shrink-0">{t.number}</span>
                          <span className="text-sm text-ink/90 font-body truncate">{displayName(t)}</span>
                          <span className="text-[11px] text-ink/45 font-body ml-auto flex-shrink-0 whitespace-nowrap">
                            {phones.length ? phones[0] : 'no phone'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-ink/40 font-body">No active tither matches “{query.trim()}”.</p>
                )
              )}
            </FormField>
          )}

          {/* What */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Amount" required>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink/45 font-body pointer-events-none">GHS</span>
                <input
                  ref={amountRef}
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  className="input pl-14"
                  value={form.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </FormField>
            <FormField label="Month the tithe is for" required>
              <MonthPicker value={form.month} onChange={(month) => set({ month })} />
            </FormField>
            <FormField label="Date paid" required>
              <input
                type="date"
                className="input"
                value={form.paidOn}
                max={todayYmd()}
                onChange={(e) => set({ paidOn: e.target.value })}
              />
            </FormField>
            <FormField label="Note" hint="Optional. Internal only.">
              <input
                className="input"
                value={form.note}
                onChange={(e) => set({ note: e.target.value })}
                placeholder="e.g. Cash, Sunday second service"
                maxLength={300}
              />
            </FormField>
          </div>

          {/* SMS */}
          <div className="space-y-3 border-t border-purple-brand/8 pt-4">
            <div>
              <Toggle
                checked={willSend}
                onChange={toggleSms}
                disabled={smsLocked}
                label="Send SMS acknowledgement"
              />
              {smsNote && (
                <p className={`text-[11px] font-body mt-1.5 ${autoOff && !smsLocked ? 'text-amber-700' : 'text-ink/45'}`}>{smsNote}</p>
              )}
            </div>

            {settingsError && (
              <p className="flex items-center gap-1.5 text-[11px] font-body text-amber-700">
                <AlertTriangle size={12} className="flex-shrink-0" />
                {settingsError}
                <button type="button" onClick={() => setSettingsTry((n) => n + 1)} className="inline-flex items-center gap-1 text-purple-brand hover:text-purple-deep font-medium">
                  <RefreshCw size={11} /> Try again
                </button>
              </p>
            )}

            {willSend && selected && !settings && !settingsError && (
              <p className="text-[11px] text-ink/40 font-body">Loading the message…</p>
            )}

            {previewText && (
              <div className="rounded-lg bg-cream/40 border border-purple-brand/8 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <p className="text-[11px] font-body font-semibold uppercase tracking-wider text-ink/50">Message that will be sent</p>
                  <p className="text-[11px] text-ink/45 font-body">
                    {segments} SMS{recipients.length > 1 ? ' each' : ''} · to {recipients.join(' and ')}
                  </p>
                </div>
                <p className="text-sm text-ink/80 font-body leading-relaxed whitespace-pre-wrap">{previewText}</p>
              </div>
            )}
          </div>

          {error && <div className={ERROR_BOX}>{error}</div>}

          <div className="flex justify-end gap-3 pt-4 border-t border-purple-brand/8">
            <button type="button" onClick={onClose} disabled={Boolean(phase)} className="btn-outline text-sm px-5 py-2 disabled:opacity-50">
              <X size={14} /> Cancel
            </button>
            <button type="submit" disabled={Boolean(phase) || archived} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
              {phase === 'saving' ? (willSend ? 'Saving and sending…' : 'Saving…') : <><Check size={14} /> Record payment</>}
            </button>
          </div>
        </form>
      )}
    </AdminModal>
  );
}

/** What was just recorded and whether the person was told. */
function ResultView({ result, onAnother, onDone }) {
  const { payment, sms } = result;
  const to = sms?.to ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-green-50 flex items-center justify-center text-green-600 flex-shrink-0">
          <CheckCircle2 size={20} />
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg text-ink font-light leading-snug">
            Recorded {amountLabel(payment.amount, payment.currency)} from {displayName(payment.tither)} for {monthLabel(payment.month)}.
          </p>
          <p className="text-ink/45 text-xs font-body mt-1">
            Paid on {dateLabel(payment.paidOn)}
            {payment.tither?.number && <> · {payment.tither.number}</>}
            {payment.note && <> · {payment.note}</>}
          </p>
        </div>
      </div>

      {sms?.status === 'SENT' ? (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-700 text-sm font-body flex items-start gap-2">
          <CheckCircle2 size={15} className="mt-px flex-shrink-0" />
          <span>
            SMS sent to {to[0]}{to.length > 1 && ` (and ${to.slice(1).join(', ')})`}
          </span>
        </div>
      ) : sms?.status === 'FAILED' ? (
        <div className={`${ERROR_BOX} flex items-start gap-2`}>
          <AlertTriangle size={15} className="mt-px flex-shrink-0" />
          <div className="min-w-0">
            <p>{to.length ? `SMS sent to ${to.join(' and ')}, but not to everyone.` : 'The SMS could not be sent.'}</p>
            {sms.error && <p className="text-xs mt-1 break-words">{sms.error}</p>}
            <p className="text-xs mt-1 text-red-500">The payment is saved. Use Send SMS on the payment to try again.</p>
          </div>
        </div>
      ) : sms?.status === 'SKIPPED' ? (
        <div className="bg-ink/5 rounded-lg px-4 py-3 text-ink/55 text-sm font-body flex items-start gap-2">
          <Info size={15} className="mt-px flex-shrink-0" />
          <span>No SMS sent{sms.error && ` — ${sms.error}`}</span>
        </div>
      ) : null}

      <div className="flex justify-end gap-3 pt-4 border-t border-purple-brand/8">
        <button type="button" onClick={onAnother} className="btn-outline text-sm px-5 py-2">
          <Plus size={14} /> Record another
        </button>
        <button type="button" onClick={onDone} className="btn-primary text-sm px-5 py-2" autoFocus>
          <Check size={14} /> Done
        </button>
      </div>
    </div>
  );
}
