import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QrCode, ChevronRight } from 'lucide-react';
import { Alert, Modal, Spinner } from './ui';
import { formatTimeRange } from '../lib/format';
import { api } from '../lib/api';

/**
 * "Show QR for today's service", for a head of department at church: one
 * service open now or later today goes straight to its QR screen; several
 * ask which; none says so.
 *
 * Opens in this tab: a new tab opened after waiting for the server is
 * treated as a pop-up and blocked on most phones.
 */
export default function ShowQrButton({ from }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState(null);   // { sessions } or { error }

  async function open() {
    setBusy(true);
    try {
      const { sessions = [] } = await api.get('/qr/today');
      if (sessions.length === 1) navigate(`/display/${sessions[0].id}`, { state: { from } });
      else setChoice({ sessions });
    } catch (err) {
      setChoice({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-primary px-4 py-2.5" onClick={open} disabled={busy}>
        {busy ? <Spinner size={15} /> : <QrCode size={15} />} Show QR for today’s service
      </button>
      {choice && (
        <Modal title="Show the QR code" onClose={() => setChoice(null)}>
          {choice.error ? (
            <Alert>{choice.error}</Alert>
          ) : choice.sessions.length === 0 ? (
            <p className="text-sm font-body text-ink/65 pb-2">
              There’s no service left today. The QR code can be shown on the day of a service, from when clock-in opens.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-body text-ink/65">Which service?</p>
              <ul className="space-y-2">
                {choice.sessions.map((s) => (
                  <li key={s.id}>
                    <Link to={`/display/${s.id}`} state={{ from }}
                      className="flex items-center gap-3 rounded-lg border border-purple-brand/10 px-4 py-3 hover:border-gold hover:bg-gold/5 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-body font-semibold text-ink truncate">{s.service?.name}</p>
                        <p className="text-sm font-body text-ink/55">{formatTimeRange(s.startsAt, s.endsAt)}{s.service?.venueName ? ` · ${s.service.venueName}` : ''}</p>
                      </div>
                      <ChevronRight size={18} className="text-ink/30 flex-shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
