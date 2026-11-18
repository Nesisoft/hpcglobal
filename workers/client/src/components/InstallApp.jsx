import { useState } from 'react';
import { Download, Share, SquarePlus, EllipsisVertical, X, CircleCheck } from 'lucide-react';
import { useInstall, snoozed, snooze } from '../lib/install';

/** The steps for a phone with no install button of its own. */
export function Steps({ how }) {
  const step = 'flex items-start gap-2.5';
  const num = 'w-5 h-5 rounded-full bg-gold/20 text-[#8a6d1f] text-[11px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5';
  if (how === 'ios') {
    return (
      <ol className="space-y-2 text-sm font-body text-ink/70">
        <li className={step}><span className={num}>1</span><span>Open this page in <strong>Safari</strong> (or Chrome) and tap the <strong>Share</strong> button <Share size={14} className="inline -mt-0.5 text-purple-brand" aria-label="Share" />.</span></li>
        <li className={step}><span className={num}>2</span><span>Scroll down and tap <strong>Add to Home Screen</strong> <SquarePlus size={14} className="inline -mt-0.5 text-purple-brand" aria-hidden="true" />.</span></li>
        <li className={step}><span className={num}>3</span><span>Tap <strong>Add</strong>. HPC Workers appears on your home screen.</span></li>
      </ol>
    );
  }
  return (
    <ol className="space-y-2 text-sm font-body text-ink/70">
      <li className={step}><span className={num}>1</span><span>Tap your browser’s menu <EllipsisVertical size={14} className="inline -mt-0.5 text-purple-brand" aria-label="menu" /> at the top right.</span></li>
      <li className={step}><span className={num}>2</span><span>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</span></li>
      <li className={step}><span className={num}>3</span><span>Tap <strong>Install</strong>. HPC Workers appears with your other apps.</span></li>
    </ol>
  );
}

/**
 * "Install the app": a one-tap button where the phone offers it, the steps
 * where it doesn't. `dismissible` (on Home) can be put off for a week, like
 * the pop-up; on the Profile page it stays, for anyone who put it off.
 */
export default function InstallApp({ dismissible = false, className = '' }) {
  const { how, install, installed } = useInstall();
  const [closed, setClosed] = useState(false);
  const hidden = dismissible && (closed || snoozed());
  const [showSteps, setShowSteps] = useState(false);
  const [busy, setBusy] = useState(false);

  if (hidden) return null;
  if (installed) {
    if (dismissible) return null;
    return (
      <section className={`card p-5 flex items-center gap-3 ${className}`}>
        <CircleCheck size={20} className="text-green-600 flex-shrink-0" aria-hidden="true" />
        <p className="text-sm font-body text-ink/70">You’re using the installed app.</p>
      </section>
    );
  }
  if (!how) return null;

  async function onInstall() {
    setBusy(true);
    try { await install(); } finally { setBusy(false); }
  }

  return (
    <section className={`card p-5 relative overflow-hidden ${className}`}>
      {dismissible && (
        <button onClick={() => { snooze(); setClosed(true); }} className="absolute top-3 right-3 p-1.5 rounded text-ink/35 hover:text-ink/70 hover:bg-ink/5"
          aria-label="Not now">
          <X size={16} />
        </button>
      )}
      <div className="flex items-center gap-4 pr-6">
        <img src="/icon-192.png" alt="" className="w-14 h-14 rounded-2xl flex-shrink-0 shadow-md" />
        <div className="min-w-0">
          <h2 className="font-display text-xl text-ink leading-tight">Install the app</h2>
          <p className="text-sm font-body text-ink/55 mt-0.5">Open HPC Workers from your home screen, full screen, like any other app.</p>
        </div>
      </div>
      <div className="mt-4">
        {how === 'prompt' ? (
          <button onClick={onInstall} disabled={busy} className="btn-primary w-full sm:w-auto">
            <Download size={16} /> Install HPC Workers
          </button>
        ) : showSteps ? (
          <Steps how={how} />
        ) : (
          <button onClick={() => setShowSteps(true)} className="btn-primary w-full sm:w-auto">
            <Download size={16} /> Show me how
          </button>
        )}
      </div>
    </section>
  );
}
