import { useState, useEffect, useRef, useCallback } from 'react';
import { Save, RotateCcw, AlertTriangle, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { adminApi } from '../../../services/api';
import { useApi } from '../../../hooks/useApi';
import { renderTemplate } from '../../../utils/tithe';
import { smsSegments, hasUnicodeSms } from '../../../utils/format';
import FormField from '../FormField';
import Toggle from '../Toggle';

const token = (key) => `{${key}}`;
// The same shape the server reads, so what is flagged here is what it refuses.
const PLACEHOLDER_RE = /\{\s*([A-Za-z_]+)\s*\}/g;

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function Card({ title, className = '', children }) {
  return (
    <div className={`bg-white rounded-xl border border-purple-brand/8 p-5 ${className}`}>
      {title && <h3 className="font-display text-base text-ink font-light mb-4">{title}</h3>}
      {children}
    </div>
  );
}

/**
 * The acknowledgement SMS that follows each tithe payment, and whether it goes
 * out on its own — the "SMS Template" tab of Admin → Tithes.
 */
export default function SmsTemplateEditor() {
  const fetchFn = useCallback(() => adminApi.getTitheSettings(), []);
  const { data, loading, error, refetch } = useApi(fetchFn);

  const [template, setTemplate]   = useState('');
  const [enabled, setEnabled]     = useState(true);
  // What the server holds, so "has anything changed" has a yardstick.
  const [saved, setSaved]         = useState(null);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!data) return;
    const smsTemplate = data.smsTemplate ?? '';
    const smsEnabled  = data.smsEnabled !== false;
    setTemplate(smsTemplate);
    setEnabled(smsEnabled);
    setSaved({ smsTemplate, smsEnabled, updatedAt: data.updatedAt });
    setSaveError('');
  }, [data]);

  useEffect(() => {
    if (!justSaved) return undefined;
    const timer = setTimeout(() => setJustSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const placeholders    = data?.placeholders ?? [];
  const maxLength       = data?.maxLength ?? 600;
  const defaultTemplate = data?.defaultTemplate ?? '';

  // The server trims before storing, so compare what it would actually keep.
  const trimmed  = template.trim();
  const length   = template.length;
  const segments = smsSegments(template);
  const unicode  = hasUnicodeSms(template);
  const over     = length > maxLength;
  const dirty    = Boolean(saved) && (trimmed !== saved.smsTemplate || enabled !== saved.smsEnabled);

  // Closing or reloading the page with an unsaved message asks first. (The
  // page keeps this editor mounted across tab switches for the same reason.)
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const known   = new Set(placeholders.map((p) => p.key));
  const unknown = [...new Set([...template.matchAll(PLACEHOLDER_RE)].map((m) => m[1]).filter((k) => !known.has(k)))];

  const sampleValues = Object.fromEntries(placeholders.map((p) => [p.key, p.sample]));
  if (data?.church) sampleValues.church = data.church;   // the real name reads truer than the sample
  const example         = renderTemplate(trimmed, sampleValues);
  const exampleSegments = smsSegments(example);

  function edit(value) {
    setTemplate(value);
    setSaveError('');
  }

  function insert(key) {
    const text  = token(key);
    const el    = textareaRef.current;
    const start = el?.selectionStart ?? length;
    const end   = el?.selectionEnd ?? start;
    edit(template.slice(0, start) + text + template.slice(end));
    // React has written the new value by the next frame; then place the caret after it.
    const caret = start + text.length;
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  async function handleSave() {
    if (!trimmed) { setSaveError('The message cannot be empty.'); return; }
    setSaving(true);
    setSaveError('');
    setJustSaved(false);
    try {
      const { data: res } = await adminApi.updateTitheSettings({ smsTemplate: trimmed, smsEnabled: enabled });
      const next = {
        smsTemplate: res?.smsTemplate ?? trimmed,
        smsEnabled:  res?.smsEnabled ?? enabled,
        updatedAt:   res?.updatedAt ?? saved?.updatedAt,
      };
      setSaved(next);
      setTemplate(next.smsTemplate);
      setEnabled(next.smsEnabled);
      setJustSaved(true);
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Could not save the template. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <div className="bg-white rounded-xl border border-purple-brand/8 h-64 animate-pulse" />;
  }

  if (error && !data) {
    return (
      <div className="bg-white rounded-xl border border-red-200 py-12 text-center space-y-3">
        <p className="text-red-600 font-body text-sm">Couldn’t load the SMS template: {error}</p>
        <button type="button" onClick={refetch} className="btn-outline text-xs px-4 py-2">
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    );
  }

  const counter = length
    ? `${length} character${length === 1 ? '' : 's'} · ${segments} SMS per recipient`
    : 'Nothing to send yet.';

  return (
    <div className="space-y-5">
      {data?.sms === 'none' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-start gap-1.5 text-xs font-body text-amber-800">
            <AlertTriangle size={13} className="mt-px flex-shrink-0" />
            SMS is not set up, so no acknowledgements go out. Set the Hubtel credentials in Vercel.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card title="Acknowledgement message" className="lg:col-span-3">
          <div className="space-y-4">
            <FormField
              label="Message"
              hint={counter}
              error={over ? `${length} characters — keep it under ${maxLength}. It is sent as an SMS.` : ''}
            >
              <textarea
                ref={textareaRef}
                className="input min-h-[120px] resize-y leading-relaxed"
                rows={5}
                value={template}
                onChange={(e) => edit(e.target.value)}
                placeholder="Dear {name}, we acknowledge receipt of your tithe of {amount}…"
                disabled={saving}
              />
            </FormField>

            {unicode && (
              <p className="flex items-start gap-1.5 text-[11px] font-body text-amber-700 -mt-2">
                <AlertTriangle size={12} className="mt-px flex-shrink-0" />
                A character outside the basic SMS alphabet (e.g. a curly quote) makes each message count as several.
              </p>
            )}

            {unknown.length > 0 && (
              <p className="flex items-start gap-1.5 text-[11px] font-body text-amber-700 -mt-2">
                <AlertTriangle size={12} className="mt-px flex-shrink-0" />
                <span>
                  <span className="font-mono">{unknown.map(token).join(', ')}</span>
                  {unknown.length === 1 ? ' is not a placeholder' : ' are not placeholders'}, so the message cannot be saved as it is. Use one of the chips below.
                </span>
              </p>
            )}

            <div>
              <p className="text-[11px] font-body font-semibold uppercase tracking-wider text-ink/50 mb-2">Placeholders</p>
              <div className="flex flex-wrap gap-1.5">
                {placeholders.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    title={p.label}
                    onClick={() => insert(p.key)}
                    disabled={saving}
                    className="inline-flex items-center px-2.5 py-1 rounded-full border border-purple-brand/20 bg-purple-brand/5 text-purple-brand font-mono text-[11px] hover:bg-purple-brand/10 transition-colors disabled:opacity-50"
                  >
                    {token(p.key)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink/45 font-body mt-2">
                Click to insert. Placeholders are replaced with the tither’s details when the SMS is sent.
              </p>
              {placeholders.length > 0 && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3">
                  {placeholders.map((p) => (
                    <div key={p.key} className="flex gap-2 text-[11px] font-body">
                      <dt className="font-mono text-ink/70 shrink-0 min-w-[6.5rem]">{token(p.key)}</dt>
                      <dd className="text-ink/45">{p.description}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-5">
          <Card title="Example">
            {trimmed ? (
              <>
                <div className="rounded-lg bg-cream/40 border border-purple-brand/8 p-4 text-sm text-ink/80 font-body leading-relaxed whitespace-pre-wrap break-words">
                  {example}
                </div>
                <p className="text-[11px] text-ink/40 font-body mt-2">
                  With these details: {example.length} characters · {exampleSegments} SMS.
                </p>
              </>
            ) : (
              <p className="text-sm text-ink/40 font-body">Type a message to see how it will read.</p>
            )}
          </Card>

          <Card title="Sending">
            <Toggle
              checked={enabled}
              onChange={setEnabled}
              disabled={saving}
              label="Send automatically when a payment is recorded"
            />
            <p className="text-[11px] text-ink/45 font-body mt-2">
              {enabled
                ? 'Each payment recorded sends this message to the tither straight away.'
                : 'Payments are still recorded; the SMS can be sent by hand from the payment.'}
            </p>
          </Card>
        </div>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body">
          {saveError}
        </div>
      )}

      <div className="bg-white rounded-xl border border-purple-brand/8 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-[11px] text-ink/40 font-body">
          {saved?.updatedAt ? `Last changed ${fmtWhen(saved.updatedAt)}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {justSaved && !dirty && (
            <span className="inline-flex items-center gap-1 text-xs text-green-700 font-body">
              <CheckCircle2 size={13} /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={() => edit(defaultTemplate)}
            disabled={saving || !defaultTemplate || template === defaultTemplate}
            title="Puts the standard message back. Nothing changes until you save."
            className="btn-outline text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw size={14} /> Reset to default
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty || over}
            className="btn-primary text-sm px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
