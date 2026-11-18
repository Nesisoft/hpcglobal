import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Modal, Spinner } from './ui';
import { Steps } from './InstallApp';
import { useInstall, isPhone, snoozed, snooze } from '../lib/install';

// Long enough for the page to settle (and for Android's install offer to
// arrive) before anything pops up.
const DELAY_MS = 2500;

/**
 * Asking, on a phone, whether to install the app: a short pop-up a moment
 * after Home opens. "Install" brings up the phone's own install prompt (a
 * website may only ask for that after a tap), or on an iPhone the Add to
 * Home Screen steps. "Not now" — or closing it — means not again for a week.
 */
export default function InstallPrompt() {
  const { how, install } = useInstall();
  const [open, setOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPhone || snoozed()) return undefined;
    const timer = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!open || !how) return null;

  const later = () => { snooze(); setOpen(false); };
  async function onInstall() {
    setBusy(true);
    try { await install(); } finally { setBusy(false); setOpen(false); }
  }

  return (
    <Modal title="Install HPC Workers?" onClose={later} busy={busy}
      footer={<>
        <button type="button" onClick={later} disabled={busy} className="btn-outline">Not now</button>
        {how === 'prompt' ? (
          <button type="button" onClick={onInstall} disabled={busy} className="btn-primary">
            {busy ? <Spinner size={15} /> : <Download size={16} />} Install
          </button>
        ) : showSteps ? (
          <button type="button" onClick={() => setOpen(false)} className="btn-primary">Done</button>
        ) : (
          <button type="button" onClick={() => setShowSteps(true)} className="btn-primary"><Download size={16} /> Show me how</button>
        )}
      </>}>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <img src="/icon-192.png" alt="" className="w-14 h-14 rounded-2xl flex-shrink-0 shadow-md" />
          <p className="text-sm font-body text-ink/65">
            Put HPC Workers on your home screen and open it like any other app — quicker to clock in when you get to church.
          </p>
        </div>
        {showSteps && <Steps how={how} />}
      </div>
    </Modal>
  );
}
