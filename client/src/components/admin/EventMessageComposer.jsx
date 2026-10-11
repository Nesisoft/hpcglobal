import { useState, useEffect, useCallback } from 'react';
import { Mail, MessageSquare, Send, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { adminApi } from '../../services/api';
import { smsSegments, hasUnicodeSms } from '../../utils/format';
import FormField from './FormField';
import RichTextEditor from './RichTextEditor';

const AUDIENCES = [
  { value: 'ALL',       label: 'Everyone registered' },
  { value: 'IN_PERSON', label: 'Attending in person' },
  { value: 'ONLINE',    label: 'Attending online' },
];

const EMPTY = { email: true, sms: false, audience: 'ALL', subject: '', bodyHtml: '', bodySms: '' };

const STATUS_STYLE = {
  SENT:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  FAILED:  'bg-red-50 text-red-600 border-red-200',
  SENDING: 'bg-amber-50 text-amber-700 border-amber-200',
};

// Background of the banner shown right after a send.
const RESULT_TONE = {
  SENT:    'bg-emerald-50 border-emerald-200',
  PARTIAL: 'bg-amber-50 border-amber-200',
  FAILED:  'bg-red-50 border-red-200',
};

const STATUS_LABEL = {
  SENT:    'Sent',
  PARTIAL: 'Partly sent',
  FAILED:  'Failed',
  // A row only reaches the history as SENDING if the run never reported back,
  // so "Interrupted" is what an admin is actually looking at.
  SENDING: 'Interrupted',
};

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** A sent message, with whatever went wrong and the means to carry on. */
function HistoryRow({ event, message, onChanged }) {
  const [resuming, setResuming] = useState(false);
  const [showFailures, setShowFailures] = useState(false);
  const failures = message.failures ?? [];

  async function handleResume() {
    setResuming(true);
    try {
      await adminApi.resumeEventMessage(event.id, message.id);
      onChanged();
    } catch {
      alert('Could not continue sending. Please try again.');
    } finally {
      setResuming(false);
    }
  }

  const parts = [];
  if (message.emailTotal) parts.push(`${message.emailSent}/${message.emailTotal} emails`);
  if (message.smsTotal)   parts.push(`${message.smsSent}/${message.smsTotal} SMS`);

  return (
    <div className="border border-purple-brand/10 rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-sm text-ink truncate">
            {message.subject || message.bodySms || '(no subject)'}
          </p>
          <p className="text-[11px] font-body text-ink/45 mt-0.5">
            {fmtWhen(message.createdAt)}
            {message.sentByName && ` · ${message.sentByName}`}
            {parts.length > 0 && ` · ${parts.join(' · ')}`}
          </p>
        </div>
        <span className={`shrink-0 text-[10px] font-body font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_STYLE[message.status] ?? STATUS_STYLE.SENDING}`}>
          {STATUS_LABEL[message.status] ?? message.status}
        </span>
      </div>

      {(message.status === 'PARTIAL' || message.status === 'SENDING') && (
        <div className="mt-2 flex items-center gap-2">
          <p className="text-[11px] font-body text-amber-700 flex-1">
            {message.status === 'SENDING'
              ? 'This send was interrupted before it could report back. Continuing picks up where it stopped — nobody is messaged twice.'
              : 'This send did not finish. Continuing picks up where it stopped — nobody is messaged twice.'}
          </p>
          <button
            onClick={handleResume}
            disabled={resuming}
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-body font-medium text-purple-brand hover:text-purple-deep disabled:opacity-50"
          >
            {resuming ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Continue sending
          </button>
        </div>
      )}

      {failures.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowFailures((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-body text-red-600 hover:text-red-700"
          >
            <AlertTriangle size={12} />
            {failures.length} could not be delivered
          </button>
          {showFailures && (
            <ul className="mt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
              {failures.map((f, i) => (
                <li key={i} className="text-[11px] font-body text-ink/55">
                  <span className="text-ink/75">{f.to}</span> — {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compose and send a bulk message to an event's registrants.
 *
 * The recipient counts come from the server, using the same resolver the send
 * uses, so the number shown on the button is the number of people who will
 * actually be messaged — not the number of registrations, which is larger
 * (people register without an email, or twice from one address).
 */
export default function EventMessageComposer({ event, onSent }) {
  const [form, setForm]       = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState(null);
  const [audience, setAudience] = useState(null);
  const [history, setHistory]   = useState([]);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await adminApi.getEventMessages(event.id);
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    }
  }, [event.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Recount whenever the audience changes, so the figures on screen always
  // describe the selection currently made.
  useEffect(() => {
    let cancelled = false;
    setAudience(null);
    adminApi.getEventAudience(event.id, form.audience)
      .then(({ data }) => { if (!cancelled) setAudience(data); })
      .catch(() => { if (!cancelled) setAudience(null); });
    return () => { cancelled = true; };
  }, [event.id, form.audience]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const segments = smsSegments(form.bodySms);
  const unicode  = hasUnicodeSms(form.bodySms);

  const emailCount = form.email ? (audience?.email ?? 0) : 0;
  const smsCount   = form.sms   ? (audience?.sms   ?? 0) : 0;
  const reach      = emailCount + smsCount;

  const emailOff = audience?.transports?.email === 'none';
  const smsOff   = audience?.transports?.sms   === 'none';
  // The server refuses a channel with no provider, so don't offer the send.
  const channelOff = (form.email && emailOff) || (form.sms && smsOff);

  function validate() {
    if (!form.email && !form.sms) return 'Choose email, SMS, or both.';
    if (form.email) {
      if (!form.subject.trim()) return 'Please enter a subject for the email.';
      if (!form.bodyHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()) {
        return 'Please write the email message.';
      }
    }
    if (form.sms && !form.bodySms.trim()) return 'Please write the SMS message.';
    if (reach === 0) return 'Nobody registered for this event can be reached on the channels you chose.';
    return '';
  }

  async function handleSend() {
    const problem = validate();
    if (problem) { setError(problem); return; }

    const channel = form.email && form.sms ? 'BOTH' : form.email ? 'EMAIL' : 'SMS';
    const lines = [
      `Send this message to ${reach} ${reach === 1 ? 'person' : 'people'}?`,
      '',
      ...(form.email ? [`Email: ${emailCount}`] : []),
      ...(form.sms   ? [`SMS: ${smsCount}${segments > 1 ? ` (${segments} segments each)` : ''}`] : []),
      '',
      'This cannot be undone.',
    ];
    if (!window.confirm(lines.join('\n'))) return;

    setSending(true);
    setError('');
    try {
      const { data } = await adminApi.sendEventMessage(event.id, {
        channel,
        audience: form.audience,
        ...(form.email ? { subject: form.subject.trim(), bodyHtml: form.bodyHtml } : {}),
        ...(form.sms   ? { bodySms: form.bodySms.trim() } : {}),
      });
      setResult(data);
      setForm({ ...EMPTY, audience: form.audience, email: form.email, sms: form.sms });
      loadHistory();
      onSent?.();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not send the message. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* What was just sent */}
      {result && (
        <div className={`rounded-lg border p-3 ${RESULT_TONE[result.status] ?? RESULT_TONE.PARTIAL}`}>
          <p className="flex items-center gap-1.5 font-body text-sm text-ink">
            {result.status === 'SENT'
              ? <CheckCircle2 size={14} className="text-emerald-600" />
              : <AlertTriangle size={14} className={result.status === 'FAILED' ? 'text-red-600' : 'text-amber-600'} />}
            {result.status === 'SENT' ? 'Message sent.' : result.status === 'FAILED' ? 'Message not sent.' : 'Message partly sent.'}
            {' '}
            {[
              result.emailTotal ? `${result.emailSent} of ${result.emailTotal} emails` : null,
              result.smsTotal   ? `${result.smsSent} of ${result.smsTotal} SMS` : null,
            ].filter(Boolean).join(', ')}
          </p>
        </div>
      )}

      {/* Channels */}
      <div>
        <p className="text-[11px] font-body font-semibold uppercase tracking-wider text-ink/50 mb-2">Send by</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => set({ email: !form.email })}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-body transition-colors ${
              form.email ? 'border-purple-brand bg-purple-brand/5 text-purple-brand' : 'border-ink/15 text-ink/60 hover:border-ink/30'
            }`}
          >
            <Mail size={14} /> Email
            {audience && <span className="text-[11px] text-ink/40">({audience.email})</span>}
          </button>
          <button
            type="button"
            onClick={() => set({ sms: !form.sms })}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-body transition-colors ${
              form.sms ? 'border-purple-brand bg-purple-brand/5 text-purple-brand' : 'border-ink/15 text-ink/60 hover:border-ink/30'
            }`}
          >
            <MessageSquare size={14} /> SMS
            {audience && <span className="text-[11px] text-ink/40">({audience.sms})</span>}
          </button>
        </div>
        {form.email && emailOff && (
          <p className="text-[11px] font-body text-amber-700 mt-1.5">
            No email service is configured, so these emails will not go out. Set RESEND_API_KEY or the SMTP settings first.
          </p>
        )}
        {form.sms && smsOff && (
          <p className="text-[11px] font-body text-amber-700 mt-1.5">
            No SMS service is configured, so these messages will not go out. Set the Hubtel credentials first.
          </p>
        )}
      </div>

      {/* Audience */}
      <FormField
        label="Who it goes to"
        hint={audience
          ? `${audience.registrants} registered · ${audience.email} with an email address · ${audience.sms} with a phone number`
          : 'Counting…'}
      >
        <select
          className="input"
          value={form.audience}
          onChange={(e) => set({ audience: e.target.value })}
        >
          {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </FormField>

      {/* Email body */}
      {form.email && (
        <div className="space-y-3 border-t border-purple-brand/10 pt-4">
          <FormField label="Subject" required>
            <input
              className="input"
              value={form.subject}
              onChange={(e) => set({ subject: e.target.value })}
              placeholder={`About ${event.title}`}
              maxLength={200}
            />
          </FormField>
          <RichTextEditor
            label="Email message"
            required
            hint="Formatting is kept. The event's name, date and venue are added around your message automatically."
            value={form.bodyHtml}
            onChange={(html) => set({ bodyHtml: html })}
          />
        </div>
      )}

      {/* SMS body */}
      {form.sms && (
        <div className="border-t border-purple-brand/10 pt-4">
          <FormField
            label="SMS message"
            required
            hint={
              form.bodySms
                ? `${form.bodySms.length} characters · ${segments} ${segments === 1 ? 'segment' : 'segments'} per recipient${
                    unicode ? ' · contains a special character, which shortens each segment to 70' : ''
                  }`
                : 'Plain text only. 160 characters is one segment; longer messages are billed per segment.'
            }
          >
            <textarea
              className="input min-h-[110px] resize-y"
              value={form.bodySms}
              onChange={(e) => set({ bodySms: e.target.value })}
              placeholder={`Reminder: ${event.title} is coming up.`}
              maxLength={1600}
            />
          </FormField>
        </div>
      )}

      {error && (
        <p className="text-sm font-body text-red-600">{error}</p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-purple-brand/10 pt-4">
        <p className="text-[11px] font-body text-ink/45">
          {reach > 0
            ? `${reach} ${reach === 1 ? 'message' : 'messages'} will be sent.`
            : 'Nobody to send to yet.'}
        </p>
        <button
          onClick={handleSend}
          disabled={sending || reach === 0 || channelOff}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {sending ? 'Sending…' : 'Send message'}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="border-t border-purple-brand/10 pt-4">
          <p className="text-[11px] font-body font-semibold uppercase tracking-wider text-ink/50 mb-2">
            Already sent
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {history.map((m) => (
              <HistoryRow key={m.id} event={event} message={m} onChanged={loadHistory} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
